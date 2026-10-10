import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    horizontalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
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

    // DnD active item tracking
    const [activeListId, setActiveListId] = useState<number | null>(null);
    const [activeCardId, setActiveCardId] = useState<number | null>(null);

    // Invite modal
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("EMPLOYEE");
    const [inviteSending, setInviteSending] = useState(false);
    const [inviteMsg, setInviteMsg] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    useEffect(() => {
        setLoading(true);
        api.boards.getOne(boardId).then((data) => {
            setBoard(data.board);
            setLists(data.board.lists ?? []);
            setLoading(false);
        }).catch(() => navigate("/dashboard"));
    }, [boardId, navigate]);

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

    // ─── DnD Handlers ─────────────────────────────────────────────────────────

    const findListByCardId = (cardId: number) =>
        lists.find((l) => l.cards.some((c) => c.id === cardId));

    const handleDragStart = (event: DragStartEvent) => {
        const { id, data } = event.active;
        if (data.current?.type === "list") setActiveListId(id as number);
        if (data.current?.type === "card") setActiveCardId(id as number);
    };

    // onDragOver: optimistic UI for card moving between lists
    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        if (active.data.current?.type !== "card") return;

        const activeCardId = active.id as number;
        const overList = over.data.current?.type === "list"
            ? lists.find((l) => l.id === (over.id as number))
            : findListByCardId(over.id as number);

        const sourceList = findListByCardId(activeCardId);
        if (!sourceList || !overList || sourceList.id === overList.id) return;

        // Move card between lists optimistically
        const card = sourceList.cards.find((c) => c.id === activeCardId)!;
        setLists((prev) => prev.map((l) => {
            if (l.id === sourceList.id) return { ...l, cards: l.cards.filter((c) => c.id !== activeCardId) };
            if (l.id === overList.id) return { ...l, cards: [...l.cards, { ...card, listId: overList.id }] };
            return l;
        }));
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveListId(null);
        setActiveCardId(null);
        if (!over) return;

        // ── List reorder ───────────────────────────────────
        if (active.data.current?.type === "list" && active.id !== over.id) {
            const oldIndex = lists.findIndex((l) => l.id === active.id);
            const newIndex = lists.findIndex((l) => l.id === over.id);
            const reordered = arrayMove(lists, oldIndex, newIndex);
            setLists(reordered);

            const movedList = reordered[newIndex];
            const afterList = newIndex > 0 ? reordered[newIndex - 1] : undefined;
            const beforeList = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : undefined;

            try {
                await api.lists.reorder(boardId, movedList.id, {
                    afterListId: afterList?.id,
                    beforeListId: beforeList?.id,
                });
            } catch {
                // revert on failure
                setLists(lists);
            }
            return;
        }

        // ── Card reorder / move ────────────────────────────
        if (active.data.current?.type === "card") {
            const cardId = active.id as number;
            const sourceList = lists.find((l) => l.cards.some((c) => c.id === cardId));
            if (!sourceList) return;

            // Figure out target list
            let targetList: ListType | undefined;
            let afterCardId: number | undefined;
            let beforeCardId: number | undefined;

            if (over.data.current?.type === "list") {
                // Dropped directly on a list (empty or end)
                targetList = lists.find((l) => l.id === (over.id as number));
            } else if (over.data.current?.type === "card") {
                // Dropped on another card
                targetList = lists.find((l) => l.cards.some((c) => c.id === over.id));
                if (targetList) {
                    const overIdx = targetList.cards.findIndex((c) => c.id === over.id);
                    afterCardId = overIdx > 0 ? targetList.cards[overIdx - 1].id : undefined;
                    beforeCardId = targetList.cards[overIdx].id;
                }
            }

            if (!targetList) return;

            try {
                await api.cards.move(cardId, {
                    targetListId: targetList.id,
                    afterCardId,
                    beforeCardId,
                });
            } catch {
                // reload board on failure
                const data = await api.boards.getOne(boardId);
                setLists(data.board.lists ?? []);
            }
        }
    };

    // ─── Other handlers ───────────────────────────────────────────────────────

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

    const handleListDeleted = (listId: number) => setLists((prev) => prev.filter((l) => l.id !== listId));
    const handleListRenamed = (listId: number, title: string) =>
        setLists((prev) => prev.map((l) => l.id === listId ? { ...l, title } : l));

    const handleSendInvite = async () => {
        if (!inviteEmail.trim()) return;
        setInviteSending(true);
        setInviteMsg("");
        try {
            await api.invites.send(board!.workspaceId, { email: inviteEmail.trim(), role: inviteRole });
            setInviteMsg("Invite sent!");
            setInviteEmail("");
            setTimeout(() => { setInviteMsg(""); setShowInvite(false); }, 2000);
        } catch (e: any) {
            setInviteMsg(e.message || "Failed to send invite");
        } finally {
            setInviteSending(false);
        }
    };

    // DragOverlay content
    const activeList = activeListId ? lists.find((l) => l.id === activeListId) : null;
    const activeCard = activeCardId
        ? lists.flatMap((l) => l.cards).find((c) => c.id === activeCardId)
        : null;

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

                <div className="ml-auto flex items-center gap-3">
                    {/* Members avatars */}
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

                    {/* Invite button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowInvite(!showInvite)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-border hover:border-accent/50 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                        >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M20 8v6M23 11h-6M9 7a4 4 0 110 8 4 4 0 010-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Invite
                        </button>

                        {showInvite && (
                            <div className="absolute right-0 top-10 bg-elevated border border-border rounded-xl shadow-2xl p-4 z-20 w-72">
                                <p className="text-white text-xs font-semibold mb-3">Invite to workspace</p>
                                <input
                                    type="email"
                                    placeholder="Email address"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-accent/50 transition-colors mb-2"
                                    onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
                                />
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-xs outline-none mb-3"
                                >
                                    <option value="EMPLOYEE">Employee</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                                {inviteMsg && (
                                    <p className={`text-xs mb-2 ${inviteMsg === "Invite sent!" ? "text-green-400" : "text-red-400"}`}>
                                        {inviteMsg}
                                    </p>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSendInvite}
                                        disabled={inviteSending || !inviteEmail.trim()}
                                        className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    >
                                        {inviteSending ? "Sending..." : "Send invite"}
                                    </button>
                                    <button
                                        onClick={() => { setShowInvite(false); setInviteEmail(""); setInviteMsg(""); }}
                                        className="px-3 py-1.5 bg-border text-slate-400 hover:text-white rounded-lg text-xs transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Board canvas */}
            <div className="flex-1 overflow-hidden">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className="board-scroll h-full pt-5">
                        <SortableContext
                            items={lists.map((l) => l.id)}
                            strategy={horizontalListSortingStrategy}
                        >
                            {lists.map((list) => (
                                <List
                                    key={list.id}
                                    list={list}
                                    boardId={boardId}
                                    onCardCreated={handleCardCreated}
                                    onCardClick={(card) => setSelectedCardId(card.id)}
                                    onListDeleted={handleListDeleted}
                                    onListRenamed={handleListRenamed}
                                    isDragging={activeListId === list.id}
                                />
                            ))}
                        </SortableContext>

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

                    {/* Drag overlay — shows ghost while dragging */}
                    <DragOverlay>
                        {activeList && (
                            <div className="flex flex-col w-72 bg-surface border border-accent/30 rounded-2xl opacity-90 rotate-2 shadow-2xl">
                                <div className="px-4 py-3">
                                    <p className="text-white font-semibold text-sm">{activeList.title}</p>
                                    <p className="text-slate-600 text-xs">{activeList.cards.length} cards</p>
                                </div>
                            </div>
                        )}
                        {activeCard && (
                            <div className="w-72 bg-elevated border border-accent/30 rounded-xl px-3 py-2.5 shadow-2xl rotate-1 opacity-90">
                                <p className="text-white text-sm">{activeCard.title}</p>
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
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
    const palette = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#3b82f6","#f97316"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length]!;
}
