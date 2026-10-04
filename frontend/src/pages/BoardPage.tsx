import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useWebSocket } from "../hooks/useWebSocket";
import { List } from "../components/List";
import { CardModal } from "../components/CardModal";
import type { Board, List as ListType, Card, WsEvent } from "../types";

export function BoardPage() {
    const { boardId: boardIdParam } = useParams<{ boardId: string }>();
    const boardId = parseInt(boardIdParam ?? "0");
    const navigate = useNavigate();

    const [board, setBoard] = useState<Board | null>(null);
    const [lists, setLists] = useState<ListType[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

    const [addingList, setAddingList] = useState(false);
    const [newListTitle, setNewListTitle] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Load board
    useEffect(() => {
        setLoading(true);
        api.boards.getOne(boardId).then((data) => {
            setBoard(data.board);
            setLists(data.board.lists ?? []);
            setLoading(false);
        }).catch(() => navigate("/dashboard"));
    }, [boardId, navigate]);

    // Handle real-time events
    const handleWsEvent = useCallback((event: WsEvent) => {
        switch (event.type) {
            case "board_edited":
                setBoard((prev) => prev ? { ...prev, ...event.board } : prev);
                break;
            case "board_deleted":
                navigate("/dashboard");
                break;
            case "list_created":
                setLists((prev) => [...prev, { ...event.list, cards: [] }]);
                break;
            case "list_edited":
                setLists((prev) => prev.map((l) => l.id === event.list.id ? { ...l, title: event.list.title } : l));
                break;
            case "list_deleted":
                setLists((prev) => prev.filter((l) => l.id !== event.listId));
                break;
            case "list_reordered":
                setLists((prev) => {
                    const updated = prev.map((l) => l.id === event.list.id ? { ...l, order: event.list.order } : l);
                    return [...updated].sort((a, b) => a.order - b.order);
                });
                break;
            case "card_created":
                setLists((prev) => prev.map((l) =>
                    l.id === event.card.listId ? { ...l, cards: [...l.cards, event.card] } : l
                ));
                break;
            case "card_edited":
                setLists((prev) => prev.map((l) => ({
                    ...l,
                    cards: l.cards.map((c) => c.id === event.card.id ? { ...c, ...event.card } : c),
                })));
                break;
            case "card_deleted":
                setLists((prev) => prev.map((l) => ({
                    ...l,
                    cards: l.cards.filter((c) => c.id !== event.cardId),
                })));
                break;
            case "card_moved":
                setLists((prev) => {
                    // Remove card from all lists, insert into target list
                    const withoutCard = prev.map((l) => ({
                        ...l,
                        cards: l.cards.filter((c) => c.id !== event.card.id),
                    }));
                    return withoutCard.map((l) =>
                        l.id === event.card.listId
                            ? { ...l, cards: [...l.cards, event.card].sort((a, b) => a.order - b.order) }
                            : l
                    );
                });
                break;
        }
    }, [navigate]);

    useWebSocket(boardId, handleWsEvent);

    const handleAddList = async () => {
        if (!newListTitle.trim()) return;
        setSubmitting(true);
        const data = await api.lists.create(boardId, { title: newListTitle.trim() });
        setLists((prev) => [...prev, { ...data.list, cards: [] }]);
        setNewListTitle("");
        setAddingList(false);
        setSubmitting(false);
    };

    const handleCardCreated = (listId: number, card: Card) => {
        setLists((prev) => prev.map((l) =>
            l.id === listId ? { ...l, cards: [...l.cards, card] } : l
        ));
    };

    const handleCardUpdated = (updated: Card) => {
        setLists((prev) => prev.map((l) => ({
            ...l,
            cards: l.cards.map((c) => c.id === updated.id ? { ...c, ...updated } : c),
        })));
    };

    const handleCardDeleted = (cardId: number) => {
        setLists((prev) => prev.map((l) => ({
            ...l,
            cards: l.cards.filter((c) => c.id !== cardId),
        })));
    };

    const handleListDeleted = (listId: number) => {
        setLists((prev) => prev.filter((l) => l.id !== listId));
    };

    const handleListRenamed = (listId: number, title: string) => {
        setLists((prev) => prev.map((l) => l.id === listId ? { ...l, title } : l));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-screen bg-bg flex flex-col overflow-hidden">
            {/* Top bar */}
            <header className="shrink-0 h-14 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center px-5 gap-4">
                <button
                    onClick={() => navigate("/dashboard")}
                    className="text-slate-500 hover:text-white transition-colors"
                >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                        <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                <div className="w-px h-5 bg-border" />

                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                        </svg>
                    </div>
                    <h1 className="text-white font-semibold text-sm">{board?.title}</h1>
                </div>

                {/* Members */}
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center">
                        {board?.members.slice(0, 5).map((m, i) => (
                            <div
                                key={m.memberId}
                                className="w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center text-xs font-bold text-white"
                                style={{
                                    background: stringToColor(m.user?.name || String(m.memberId)),
                                    marginLeft: i > 0 ? "-6px" : 0,
                                }}
                                title={m.user?.name}
                            >
                                {m.user?.name[0]?.toUpperCase() ?? "?"}
                            </div>
                        ))}
                        {(board?.members.length ?? 0) > 5 && (
                            <div
                                className="w-7 h-7 rounded-full border-2 border-bg bg-elevated flex items-center justify-center text-xs text-slate-400 font-medium"
                                style={{ marginLeft: "-6px" }}
                            >
                                +{(board?.members.length ?? 0) - 5}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Board canvas */}
            <div className="flex-1 overflow-hidden">
                <div className="board-scroll h-full pt-5">
                    {lists.map((list) => (
                        <List
                            key={list.id}
                            list={list}
                            boardId={boardId}
                            onCardCreated={handleCardCreated}
                            onCardClick={(card) => setSelectedCardId(card.id)}
                            onListDeleted={handleListDeleted}
                            onListRenamed={handleListRenamed}
                        />
                    ))}

                    {/* Add list */}
                    <div className="w-72 shrink-0">
                        {addingList ? (
                            <div className="bg-surface border border-border rounded-2xl p-3 flex flex-col gap-2">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="List title..."
                                    value={newListTitle}
                                    onChange={(e) => setNewListTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleAddList();
                                        if (e.key === "Escape") { setAddingList(false); setNewListTitle(""); }
                                    }}
                                    className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm outline-none focus:border-accent/50 transition-colors"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAddList}
                                        disabled={submitting || !newListTitle.trim()}
                                        className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    >
                                        {submitting ? "Adding..." : "Add list"}
                                    </button>
                                    <button
                                        onClick={() => { setAddingList(false); setNewListTitle(""); }}
                                        className="flex-1 bg-elevated text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAddingList(true)}
                                className="w-full flex items-center gap-2 px-4 py-3 text-slate-500 hover:text-slate-300 hover:bg-surface/70 border border-dashed border-border hover:border-slate-600 rounded-2xl text-sm transition-all"
                            >
                                <svg width="14" height="14" fill="none" viewBox="0 0 12 12">
                                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                Add list
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Card modal */}
            {selectedCardId !== null && (
                <CardModal
                    cardId={selectedCardId}
                    boardId={boardId}
                    onClose={() => setSelectedCardId(null)}
                    onCardUpdated={handleCardUpdated}
                    onCardDeleted={handleCardDeleted}
                />
            )}
        </div>
    );
}

function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 60%, 40%)`;
}
