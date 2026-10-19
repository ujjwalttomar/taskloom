import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    pointerWithin,
    rectIntersection,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
    type CollisionDetection,
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

// Custom collision detection: prefer pointerWithin, fall back to rectIntersection
const collisionDetection: CollisionDetection = (args) => {
    // First try pointer-based (most accurate for the pointer position)
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    // Fall back to rect intersection
    return rectIntersection(args);
};

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

    // Members panel
    const [showMembers, setShowMembers] = useState(false);
    const [addMemberEmail, setAddMemberEmail] = useState("");
    const [addMemberRole, setAddMemberRole] = useState("EMPLOYEE");
    const [addMemberLoading, setAddMemberLoading] = useState(false);
    const [addMemberError, setAddMemberError] = useState("");
    const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

    // Board edit/delete
    const [editingBoardTitle, setEditingBoardTitle] = useState(false);
    const [boardTitleValue, setBoardTitleValue] = useState("");
    const [showBoardMenu, setShowBoardMenu] = useState(false);

    // Snapshot of lists at drag start — used to revert on failure
    const [listsSnapshot, setListsSnapshot] = useState<ListType[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

    // ─── Helpers ────────────────────────────────────────────────────────────────

    const findListByCardId = (cardId: number) =>
        lists.find((l) => l.cards.some((c) => c.id === cardId));

    // Given an over.id, figure out which list it belongs to
    // over.id could be: a list id, a "droppable-list-{id}", or a card id
    const resolveTargetList = (overId: string | number, overData: Record<string, any> | null): ListType | undefined => {
        // Droppable list container
        if (overData?.type === "list") {
            const listId = overData.listId ?? overId;
            return lists.find((l) => l.id === listId);
        }
        // Card — find its parent list
        if (overData?.type === "card") {
            return findListByCardId(overId as number);
        }
        // Fallback: maybe overId is a list id directly
        return lists.find((l) => l.id === overId);
    };

    // ─── DnD Handlers ───────────────────────────────────────────────────────────

    const handleDragStart = (event: DragStartEvent) => {
        const { id, data } = event.active;
        setListsSnapshot(lists); // snapshot for revert
        if (data.current?.type === "list") setActiveListId(id as number);
        if (data.current?.type === "card") setActiveCardId(id as number);
    };

    // onDragOver: optimistic move of card between lists while dragging
    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        if (active.data.current?.type !== "card") return;

        const activeCardIdNum = active.id as number;
        const overList = resolveTargetList(over.id, over.data.current as any);
        const sourceList = findListByCardId(activeCardIdNum);

        if (!sourceList || !overList || sourceList.id === overList.id) return;

        // Move card optimistically to the target list
        const card = sourceList.cards.find((c) => c.id === activeCardIdNum)!;
        setLists((prev) => prev.map((l) => {
            if (l.id === sourceList.id) return { ...l, cards: l.cards.filter((c) => c.id !== activeCardIdNum) };
            if (l.id === overList.id) {
                // Insert card at correct position
                const overCardIdx = l.cards.findIndex((c) => c.id === over.id);
                const newCards = [...l.cards];
                const insertIdx = overCardIdx >= 0 ? overCardIdx : newCards.length;
                newCards.splice(insertIdx, 0, { ...card, listId: overList.id });
                return { ...l, cards: newCards };
            }
            return l;
        }));
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveListId(null);
        setActiveCardId(null);
        if (!over) {
            // Dropped outside — revert to snapshot
            setLists(listsSnapshot);
            return;
        }

        // ── List reorder ────────────────────────────────────────────────────────
        if (active.data.current?.type === "list") {
            if (active.id === over.id) return;
            // over might be a list or a droppable-list-* id; normalise to list id
            const overListId = (over.data.current?.type === "list" && over.data.current?.listId)
                ? over.data.current.listId
                : over.id;

            const oldIndex = lists.findIndex((l) => l.id === active.id);
            const newIndex = lists.findIndex((l) => l.id === overListId);
            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(lists, oldIndex, newIndex);
            setLists(reordered);

            const movedList = reordered[newIndex]!;
            const afterList = newIndex > 0 ? reordered[newIndex - 1] : undefined;
            const beforeList = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : undefined;

            try {
                await api.lists.reorder(boardId, movedList.id, {
                    afterListId: afterList?.id,
                    beforeListId: beforeList?.id,
                });
            } catch {
                setLists(listsSnapshot);
            }
            return;
        }

        // ── Card move / reorder ─────────────────────────────────────────────────
        if (active.data.current?.type === "card") {
            const cardId = active.id as number;

            // Find where the card currently is (after optimistic moves in handleDragOver)
            const currentList = lists.find((l) => l.cards.some((c) => c.id === cardId));
            if (!currentList) {
                setLists(listsSnapshot);
                return;
            }

            // Determine target list and neighbouring cards
            const overList = resolveTargetList(over.id, over.data.current as any);
            if (!overList) {
                setLists(listsSnapshot);
                return;
            }

            let afterCardId: number | undefined;
            let beforeCardId: number | undefined;

            if (over.data.current?.type === "card" && over.id !== cardId) {
                const overCardIdx = overList.cards.findIndex((c) => c.id === over.id);
                if (overCardIdx >= 0) {
                    // Insert before this card
                    beforeCardId = over.id as number;
                    afterCardId = overCardIdx > 0 ? overList.cards[overCardIdx - 1]!.id : undefined;
                }
            } else {
                // Dropped on list itself — append at end
                const cards = overList.cards.filter((c) => c.id !== cardId);
                afterCardId = cards.length > 0 ? cards[cards.length - 1]!.id : undefined;
            }

            try {
                await api.cards.move(cardId, {
                    targetListId: overList.id,
                    afterCardId,
                    beforeCardId,
                });
            } catch {
                setLists(listsSnapshot);
            }
        }
    };

    // ─── Other handlers ─────────────────────────────────────────────────────────

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

    const handleAddMember = async () => {
        if (!addMemberEmail.trim()) return;
        setAddMemberLoading(true);
        setAddMemberError("");
        try {
            const data = await api.boards.addMember(boardId, {
                email: addMemberEmail.trim(),
                role: addMemberRole,
            });
            setBoard((prev) => prev ? { ...prev, members: [...(prev.members ?? []), data.member] } : prev);
            setAddMemberEmail("");
        } catch (e: any) {
            setAddMemberError(e.message || "Failed to add member");
        } finally {
            setAddMemberLoading(false);
        }
    };

    const handleRemoveMember = async (memberId: number) => {
        setRemovingMemberId(memberId);
        try {
            await api.boards.removeMember(boardId, memberId);
            setBoard((prev) => prev
                ? { ...prev, members: (prev.members ?? []).filter((m) => m.memberId !== memberId) }
                : prev
            );
        } catch (e: any) {
            alert(e.message || "Failed to remove member");
        } finally {
            setRemovingMemberId(null);
        }
    };

    const handleSaveBoardTitle = async () => {
        if (!boardTitleValue.trim() || !board) { setEditingBoardTitle(false); return; }
        try {
            const data = await api.boards.update(boardId, { title: boardTitleValue.trim() });
            setBoard((prev) => prev ? { ...prev, title: data.board.title } : prev);
        } catch (e: any) {
            alert(e.message || "Failed to update board");
        } finally {
            setEditingBoardTitle(false);
        }
    };

    const handleDeleteBoard = async () => {
        if (!confirm(`Delete board "${board?.title}"? All lists and cards will be lost.`)) return;
        try {
            await api.boards.delete(boardId);
            navigate("/dashboard");
        } catch (e: any) {
            alert(e.message || "Failed to delete board");
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
                    <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center shrink-0">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                        </svg>
                    </div>
                    {editingBoardTitle ? (
                        <input
                            autoFocus
                            value={boardTitleValue}
                            onChange={(e) => setBoardTitleValue(e.target.value)}
                            onBlur={handleSaveBoardTitle}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveBoardTitle();
                                if (e.key === "Escape") setEditingBoardTitle(false);
                            }}
                            className="bg-elevated border border-accent/50 rounded-lg px-2 py-1 text-white text-sm font-semibold outline-none w-48"
                        />
                    ) : (
                        <h1 className="text-white font-semibold text-sm">{board?.title}</h1>
                    )}

                    {/* Board 3-dot menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowBoardMenu(!showBoardMenu)}
                            className="text-slate-600 hover:text-white transition-colors p-1 rounded"
                        >
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                            </svg>
                        </button>
                        {showBoardMenu && (
                            <div className="absolute left-0 top-8 bg-elevated border border-border rounded-xl shadow-2xl z-20 w-40 py-1">
                                <button
                                    onClick={() => { setBoardTitleValue(board?.title ?? ""); setEditingBoardTitle(true); setShowBoardMenu(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-bg/50 transition-colors flex items-center gap-2"
                                >
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    Rename
                                </button>
                                <button
                                    onClick={() => { setShowBoardMenu(false); handleDeleteBoard(); }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-bg/50 transition-colors flex items-center gap-2"
                                >
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    Delete board
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="ml-auto flex items-center gap-3">
                    {/* Members avatars */}
                    <div className="flex items-center">
                        {(board?.members ?? []).slice(0, 5).map((m, i) => (
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

                    {/* Members panel */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowMembers(!showMembers); setAddMemberError(""); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-border hover:border-accent/50 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                        >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 110 8 4 4 0 010-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Members
                        </button>

                        {showMembers && (
                            <div className="absolute right-0 top-10 bg-elevated border border-border rounded-xl shadow-2xl z-20 w-80">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                    <p className="text-white text-sm font-semibold">Board members</p>
                                    <button
                                        onClick={() => setShowMembers(false)}
                                        className="text-slate-500 hover:text-white transition-colors"
                                    >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Member list */}
                                <div className="max-h-56 overflow-y-auto">
                                    {(board?.members ?? []).map((m) => (
                                        <div key={m.memberId} className="flex items-center gap-2 px-4 py-2.5 hover:bg-bg/50">
                                            <div
                                                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                                style={{ background: stringToColor(m.user?.name || String(m.memberId)) }}
                                            >
                                                {m.user?.name[0]?.toUpperCase() ?? "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-xs font-medium truncate">{m.user?.name ?? `User #${m.memberId}`}</p>
                                                <p className="text-slate-500 text-xs truncate">{m.user?.email}</p>
                                            </div>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.role === "ADMIN" ? "bg-accent/20 text-accent" : "bg-bg text-slate-400"}`}>
                                                {m.role === "ADMIN" ? "Admin" : "Employee"}
                                            </span>
                                            <button
                                                onClick={async () => {
                                                    const newRole = m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";
                                                    try {
                                                        await api.boards.updateMemberRole(boardId, m.memberId, newRole);
                                                        setBoard((prev) => prev ? {
                                                            ...prev,
                                                            members: (prev.members ?? []).map((bm) =>
                                                                bm.memberId === m.memberId ? { ...bm, role: newRole as "ADMIN" | "EMPLOYEE" } : bm
                                                            ),
                                                        } : prev);
                                                    } catch (e: any) { alert(e.message || "Failed"); }
                                                }}
                                                className="text-slate-600 hover:text-slate-300 text-xs transition-colors px-1 rounded"
                                                title={m.role === "ADMIN" ? "Demote" : "Promote"}
                                            >
                                                {m.role === "ADMIN" ? "↓" : "↑"}
                                            </button>
                                            <button
                                                onClick={() => handleRemoveMember(m.memberId)}
                                                disabled={removingMemberId === m.memberId}
                                                className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50 p-1 rounded shrink-0"
                                                title="Remove from board"
                                            >
                                                {removingMemberId === m.memberId ? (
                                                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add member form */}
                                <div className="px-4 py-3 border-t border-border">
                                    <p className="text-slate-400 text-xs mb-2">Add workspace member to board</p>
                                    <div className="flex gap-1.5 mb-1.5">
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={addMemberEmail}
                                            onChange={(e) => { setAddMemberEmail(e.target.value); setAddMemberError(""); }}
                                            onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                                            className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-slate-500 outline-none focus:border-accent/50 transition-colors"
                                        />
                                        <select
                                            value={addMemberRole}
                                            onChange={(e) => setAddMemberRole(e.target.value)}
                                            className="bg-bg border border-border rounded-lg px-2 py-1.5 text-white text-xs outline-none"
                                        >
                                            <option value="EMPLOYEE">Employee</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                    {addMemberError && (
                                        <p className="text-red-400 text-xs mb-1.5">{addMemberError}</p>
                                    )}
                                    <button
                                        onClick={handleAddMember}
                                        disabled={addMemberLoading || !addMemberEmail.trim()}
                                        className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    >
                                        {addMemberLoading ? "Adding..." : "Add to board"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Board canvas — horizontal scroll here, NOT on the DndContext wrapper */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetection}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    {/* Inner row — inline-flex so it sizes to content and lets the outer div scroll */}
                    <div className="inline-flex gap-4 h-full pt-5 px-5 pb-5 items-start">
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

                    {/* Drag overlay — ghost while dragging */}
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
