import { useEffect, useState, useCallback, useRef } from "react";
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
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { List } from "../components/List";
import { CardModal } from "../components/CardModal";
import { UserCardModal } from "../components/UserCardModal";
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

    const { user } = useAuth();
    const userIdRef = useRef<number | undefined>(user?.id);
    useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

    // The open CardModal subscribes here to receive comment/assignment events for its card
    const cardEventListeners = useRef(new Set<(event: WsEvent) => void>());
    const subscribeCardEvents = useCallback((listener: (event: WsEvent) => void) => {
        cardEventListeners.current.add(listener);
        return () => { cardEventListeners.current.delete(listener); };
    }, []);

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

    // Online presence
    const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

    // User card modal
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Loads (or reloads) the whole board. Also used to resync after a WebSocket reconnect,
    // because events sent while we were disconnected are gone for good.
    const loadBoard = useCallback(() => {
        return api.boards.getOne(boardId).then((data) => {
            setBoard(data.board);
            setLists(data.board.lists ?? []);
            setLoading(false);
        }).catch(() => navigate("/dashboard"));
    }, [boardId, navigate]);

    useEffect(() => {
        setLoading(true);
        loadBoard();
    }, [loadBoard]);

    const handleWsEvent = useCallback((event: WsEvent) => {
        cardEventListeners.current.forEach((listener) => listener(event));
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
            case "board_presence":
                setOnlineUserIds(new Set(event.onlineUserIds));
                break;
            case "user_joined_board":
                setOnlineUserIds((prev) => new Set([...prev, event.userId]));
                break;
            case "user_left_board":
                setOnlineUserIds((prev) => {
                    const next = new Set(prev);
                    next.delete(event.userId);
                    return next;
                });
                break;
            // ── Events the board used to ignore ──────────────────────────────
            case "card_assigned":
                setLists((prev) => prev.map((l) => ({
                    ...l,
                    cards: l.cards.map((c) =>
                        c.id === event.cardId && !(c.assignedTo ?? []).some((a) => a.userId === event.assignment.userId)
                            ? { ...c, assignedTo: [...(c.assignedTo ?? []), event.assignment] }
                            : c),
                })));
                break;
            case "card_unassigned":
                setLists((prev) => prev.map((l) => ({
                    ...l,
                    cards: l.cards.map((c) =>
                        c.id === event.cardId ? { ...c, assignedTo: (c.assignedTo ?? []).filter((a) => a.userId !== event.userId) } : c),
                })));
                break;
            case "member_added":
                setBoard((prev) => prev && !prev.members.some((m) => m.memberId === event.member.memberId)
                    ? { ...prev, members: [...prev.members, event.member] }
                    : prev);
                break;
            case "member_role_updated":
                setBoard((prev) => prev ? {
                    ...prev,
                    members: prev.members.map((m) => m.memberId === event.member.memberId ? { ...m, role: event.member.role } : m),
                } : prev);
                break;
            case "member_removed":
                // If *I* was removed, I no longer have access to this board
                if (event.memberId === userIdRef.current) {
                    navigate("/dashboard");
                    break;
                }
                setBoard((prev) => prev ? { ...prev, members: prev.members.filter((m) => m.memberId !== event.memberId) } : prev);
                break;
            case "join_denied":
                navigate("/dashboard");
                break;
        }
    }, [navigate]);

    const wsStatus = useWebSocket(boardId, handleWsEvent, { onReconnect: loadBoard });

    // ─── Helpers ────────────────────────────────────────────────────────────────

    // dnd-kit ids are namespaced ("list-3", "card-3") so a list and a card with the same
    // numeric id can't collide; the real numeric ids travel in `data`.
    type DragData = { type?: "list" | "card"; listId?: number; cardId?: number } | undefined;

    const findListByCardId = (source: ListType[], cardId: number) =>
        source.find((l) => l.cards.some((c) => c.id === cardId));

    /** Which list is the pointer over: a list column, a list's card area, or a card inside a list? */
    const resolveTargetList = (source: ListType[], data: DragData) => {
        if (data?.type === "list") return source.find((l) => l.id === data.listId);
        if (data?.type === "card" && data.cardId !== undefined) return findListByCardId(source, data.cardId);
        return undefined;
    };

    // ─── DnD Handlers ───────────────────────────────────────────────────────────

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DragData;
        setListsSnapshot(lists); // restored if the drop fails or lands outside
        if (data?.type === "list") setActiveListId(data.listId ?? null);
        if (data?.type === "card") setActiveCardId(data.cardId ?? null);
    };

    // While a card is dragged over ANOTHER list, move it there right away (optimistic preview)
    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        const activeData = active.data.current as DragData;
        if (!over || activeData?.type !== "card" || activeData.cardId === undefined) return;
        const cardId = activeData.cardId;
        const overData = over.data.current as DragData;

        setLists((prev) => {
            const source = findListByCardId(prev, cardId);
            const target = resolveTargetList(prev, overData);
            if (!source || !target || source.id === target.id) return prev;
            const card = source.cards.find((c) => c.id === cardId)!;
            return prev.map((l) => {
                if (l.id === source.id) return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
                if (l.id === target.id) {
                    const overIdx = overData?.type === "card" ? l.cards.findIndex((c) => c.id === overData.cardId) : -1;
                    const cards = [...l.cards];
                    cards.splice(overIdx >= 0 ? overIdx : cards.length, 0, { ...card, listId: target.id });
                    return { ...l, cards };
                }
                return l;
            });
        });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        const activeData = active.data.current as DragData;
        const overData = over?.data.current as DragData;
        setActiveListId(null);
        setActiveCardId(null);
        if (!over) {
            setLists(listsSnapshot); // dropped outside — undo the preview
            return;
        }

        // ── List reorder ────────────────────────────────────────────────────────
        if (activeData?.type === "list") {
            const target = resolveTargetList(lists, overData); // over a list, its card area, or one of its cards
            const oldIndex = lists.findIndex((l) => l.id === activeData.listId);
            const newIndex = target ? lists.findIndex((l) => l.id === target.id) : -1;
            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

            const reordered = arrayMove(lists, oldIndex, newIndex);
            setLists(reordered);
            const moved = reordered[newIndex]!;
            try {
                const { list } = await api.lists.reorder(boardId, moved.id, {
                    afterListId: reordered[newIndex - 1]?.id,
                    beforeListId: reordered[newIndex + 1]?.id,
                });
                setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, order: list.order } : l)));
            } catch {
                setLists(listsSnapshot);
            }
            return;
        }

        // ── Card move / reorder ─────────────────────────────────────────────────
        if (activeData?.type !== "card" || activeData.cardId === undefined) return;
        const cardId = activeData.cardId;
        const current = findListByCardId(lists, cardId); // where it is now (after any cross-list preview)
        const target = resolveTargetList(lists, overData);
        if (!current || !target) {
            setLists(listsSnapshot);
            return;
        }
        const card = current.cards.find((c) => c.id === cardId)!;

        // 1. Work out the FINAL order of the target list first. Same rule as dnd-kit's sortable
        //    animation: dropping on a card takes that card's slot (so moving down lands after it).
        let finalCards: Card[];
        if (current.id === target.id && overData?.type === "card") {
            const from = target.cards.findIndex((c) => c.id === cardId);
            const to = target.cards.findIndex((c) => c.id === overData.cardId);
            finalCards = arrayMove(target.cards, from, to);
        } else if (overData?.type === "card") {
            const rest = target.cards.filter((c) => c.id !== cardId);
            const at = rest.findIndex((c) => c.id === overData.cardId);
            finalCards = [...rest.slice(0, at), { ...card, listId: target.id }, ...rest.slice(at)];
        } else {
            // Dropped on the list area: keep the preview position, or append if it isn't there yet
            finalCards = current.id === target.id
                ? target.cards
                : [...target.cards.filter((c) => c.id !== cardId), { ...card, listId: target.id }];
        }

        // Nothing actually moved → no request
        const original = findListByCardId(listsSnapshot, cardId);
        if (original?.id === target.id &&
            original.cards.map((c) => c.id).join() === finalCards.map((c) => c.id).join()) {
            setLists(listsSnapshot);
            return;
        }

        // 2. Show it, then 3. derive the neighbours from the final order (never the card itself)
        const index = finalCards.findIndex((c) => c.id === cardId);
        setLists((prev) => prev.map((l) =>
            l.id === target.id ? { ...l, cards: finalCards } : { ...l, cards: l.cards.filter((c) => c.id !== cardId) }));

        try {
            const { card: saved } = await api.cards.move(cardId, {
                targetListId: target.id,
                afterCardId: finalCards[index - 1]?.id,
                beforeCardId: finalCards[index + 1]?.id,
            });
            // Keep the server's order value so the next move computes from the same numbers
            setLists((prev) => prev.map((l) => ({
                ...l,
                cards: l.cards.map((c) => (c.id === cardId ? { ...c, order: saved.order, listId: saved.listId } : c)),
            })));
        } catch {
            setLists(listsSnapshot);
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

    const handleAssigneesChanged = (cardId: number, assignedTo: Card["assignedTo"]) => {
        setLists((prev) => prev.map((l) => ({
            ...l,
            cards: l.cards.map((c) => (c.id === cardId ? { ...c, assignedTo } : c)),
        })));
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
                    {/* Live-updates status: tells the user when changes from others aren't arriving */}
                    {wsStatus !== "live" && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-400" title="Live updates paused — reconnecting">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            {wsStatus === "connecting" ? "Connecting…" : "Reconnecting…"}
                        </span>
                    )}

                    {/* Members avatars */}
                    <div className="flex items-center">
                        {(board?.members ?? []).slice(0, 5).map((m, i) => (
                            <button
                                key={m.memberId}
                                onClick={() => setSelectedUserId(m.memberId)}
                                className="relative w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-accent/50 transition-all"
                                style={{
                                    background: stringToColor(m.user?.name || String(m.memberId)),
                                    marginLeft: i > 0 ? "-6px" : 0,
                                }}
                                title={m.user?.name}
                            >
                                {m.user?.name[0]?.toUpperCase() ?? "?"}
                                {onlineUserIds.has(m.memberId) && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 border-2 border-bg rounded-full" />
                                )}
                            </button>
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
                                            <button
                                                onClick={() => { setShowMembers(false); setSelectedUserId(m.memberId); }}
                                                className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 hover:ring-2 hover:ring-accent/50 transition-all"
                                                style={{ background: stringToColor(m.user?.name || String(m.memberId)) }}
                                                title="View profile"
                                            >
                                                {m.user?.name[0]?.toUpperCase() ?? "?"}
                                                {onlineUserIds.has(m.memberId) && (
                                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 border-2 border-elevated rounded-full" />
                                                )}
                                            </button>
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
                            items={lists.map((l) => `list-${l.id}`)}
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
                    boardMembers={board?.members ?? []}
                    onAssigneesChanged={handleAssigneesChanged}
                    subscribeCardEvents={subscribeCardEvents}
                />
            )}

            {/* User Card Modal */}
            {selectedUserId !== null && (
                <UserCardModal
                    userId={selectedUserId}
                    boardId={boardId}
                    workspaceId={board?.workspaceId ?? 0}
                    isOnline={onlineUserIds.has(selectedUserId)}
                    onClose={() => setSelectedUserId(null)}
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
