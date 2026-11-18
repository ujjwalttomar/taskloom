import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { Card, Comment, BoardMember, AssignedCard, WsEvent } from "../types";
import { stringToColor } from "../utils/color";

interface CardModalProps {
    cardId: number;
    boardId: number;
    onClose: () => void;
    onCardUpdated: (card: Card) => void;
    onCardDeleted: (cardId: number) => void;
    /** Board members (already loaded by BoardPage) — used for the assignee chips */
    boardMembers: BoardMember[];
    /** Admins can assign anyone and delete any comment; employees only themselves / their own */
    isBoardAdmin: boolean;
    /** Tell the board when assignees change, so the avatars on the card update too */
    onAssigneesChanged: (cardId: number, assignedTo: AssignedCard[]) => void;
    /** Live events from the board's WebSocket; returns an unsubscribe function */
    subscribeCardEvents?: (listener: (event: WsEvent) => void) => () => void;
}

export function CardModal({ cardId, onClose, onCardUpdated, onCardDeleted, boardMembers, isBoardAdmin, onAssigneesChanged, subscribeCardEvents }: CardModalProps) {
    const { user } = useAuth();
    const [card, setCard] = useState<Card | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState("");
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState("");

    const [newComment, setNewComment] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editCommentText, setEditCommentText] = useState("");

    const [assignLoading, setAssignLoading] = useState<number | null>(null);
    const [actionError, setActionError] = useState("");

    /** Runs a modal action and shows its error inline (before: unhandled rejections, nothing shown) */
    const run = async (action: () => Promise<void>) => {
        setActionError("");
        try {
            await action();
        } catch (e) {
            setActionError((e as Error).message || "Something went wrong");
        }
    };

    // Only the card is fetched — members come from the board (this used to refetch the whole board)
    useEffect(() => {
        api.cards.getOne(cardId)
            .then((data) => {
                setCard(data.card);
                setTitleValue(data.card.title);
                setDescValue(data.card.description || "");
            })
            .catch((e) => setLoadError(e.message || "Couldn't load this card")) // was: spinner forever
            .finally(() => setLoading(false));
    }, [cardId]);

    // Keep the open card in sync with what other people do to it (comments, assignees, edits)
    useEffect(() => {
        if (!subscribeCardEvents) return;
        return subscribeCardEvents((event) => {
            switch (event.type) {
                case "comment_created":
                    if (event.comment.cardId !== cardId) return;
                    setCard((prev) => prev && !(prev.comments ?? []).some((c) => c.id === event.comment.id)
                        ? { ...prev, comments: [event.comment, ...(prev.comments ?? [])] }
                        : prev);
                    break;
                case "comment_edited":
                    if (event.comment.cardId !== cardId) return;
                    setCard((prev) => prev ? { ...prev, comments: prev.comments?.map((c) => c.id === event.comment.id ? event.comment : c) } : prev);
                    break;
                case "comment_deleted":
                    setCard((prev) => prev ? { ...prev, comments: prev.comments?.filter((c) => c.id !== event.commentId) } : prev);
                    break;
                case "card_assigned":
                    if (event.cardId !== cardId) return;
                    setCard((prev) => prev && !(prev.assignedTo ?? []).some((a) => a.userId === event.assignment.userId)
                        ? { ...prev, assignedTo: [...(prev.assignedTo ?? []), event.assignment] }
                        : prev);
                    break;
                case "card_unassigned":
                    if (event.cardId !== cardId) return;
                    setCard((prev) => prev ? { ...prev, assignedTo: prev.assignedTo?.filter((a) => a.userId !== event.userId) } : prev);
                    break;
                case "card_edited":
                    if (event.card.id !== cardId) return;
                    setCard((prev) => prev ? { ...prev, title: event.card.title, description: event.card.description } : prev);
                    break;
                case "card_deleted":
                    if (event.cardId === cardId) onClose(); // someone else deleted the card I'm looking at
                    break;
            }
        });
    }, [subscribeCardEvents, cardId, onClose]);

    const handleSaveTitle = () => run(async () => {
        if (!card || !titleValue.trim() || titleValue === card.title) {
            setEditingTitle(false);
            return;
        }
        const data = await api.cards.update(cardId, { title: titleValue.trim() });
        // Merge: the PATCH response has no comments/assignees/creator — replacing wiped them from the modal
        setCard((prev) => (prev ? { ...prev, ...data.card } : prev));
        onCardUpdated(data.card);
        setEditingTitle(false);
    });

    const handleSaveDesc = () => run(async () => {
        if (!card) return;
        const data = await api.cards.update(cardId, { description: descValue });
        setCard((prev) => (prev ? { ...prev, ...data.card } : prev));
        onCardUpdated(data.card);
        setEditingDesc(false);
    });

    const handleAddComment = async () => {
        if (!newComment.trim() || !card) return;
        setSubmittingComment(true);
        await run(async () => {
            const data = await api.comments.create(cardId, { text: newComment.trim() });
            setCard((prev) => prev ? {
                ...prev,
                comments: [data.comment, ...(prev.comments || [])],
            } : prev);
            setNewComment("");
        });
        setSubmittingComment(false); // always reset (was stuck on "Posting..." after an error)
    };

    const handleEditComment = (commentId: number) => run(async () => {
        if (!editCommentText.trim()) return;
        const data = await api.comments.update(commentId, { text: editCommentText.trim() });
        setCard((prev) => prev ? {
            ...prev,
            comments: prev.comments?.map((c) => c.id === commentId ? data.comment : c),
        } : prev);
        setEditingCommentId(null);
    });

    const handleDeleteComment = (commentId: number) => run(async () => {
        await api.comments.delete(commentId);
        setCard((prev) => prev ? {
            ...prev,
            comments: prev.comments?.filter((c) => c.id !== commentId),
        } : prev);
    });

    const handleDeleteCard = () => run(async () => {
        if (!confirm("Delete this card?")) return;
        await api.cards.delete(cardId);
        onCardDeleted(cardId);
        onClose();
    });

    const handleToggleAssign = async (memberId: number) => {
        if (!card) return;
        const isAssigned = (card.assignedTo ?? []).some((a) => a.userId === memberId);
        setAssignLoading(memberId);
        try {
            let assignedTo: AssignedCard[];
            if (isAssigned) {
                await api.cards.unassign(cardId, memberId);
                assignedTo = (card.assignedTo ?? []).filter((a) => a.userId !== memberId);
            } else {
                const data = await api.cards.assign(cardId, memberId);
                assignedTo = [...(card.assignedTo ?? []), data.assignment];
            }
            setCard((prev) => (prev ? { ...prev, assignedTo } : prev));
            onAssigneesChanged(cardId, assignedTo); // so the avatars on the board card update too
        } catch (e) {
            setActionError((e as Error).message || "Couldn't change the assignee");
        } finally {
            setAssignLoading(null);
        }
    };

    const formatDate = (str: string) => new Date(str).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : !card ? (
                    <div className="p-8 text-center">
                        <p className="text-red-400 text-sm mb-3">{loadError || "Card not found"}</p>
                        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">Close</button>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="p-6 pb-0">
                            <div className="flex items-start justify-between gap-4 mb-1">
                                {editingTitle ? (
                                    <input
                                        autoFocus
                                        value={titleValue}
                                        onChange={(e) => setTitleValue(e.target.value)}
                                        onBlur={handleSaveTitle}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveTitle();
                                            if (e.key === "Escape") { setEditingTitle(false); setTitleValue(card.title); }
                                        }}
                                        className="flex-1 bg-elevated border border-accent/50 rounded-xl px-3 py-2 text-white text-lg font-semibold outline-none"
                                    />
                                ) : (
                                    <button
                                        onClick={() => setEditingTitle(true)}
                                        className="flex-1 text-left text-white font-semibold text-lg hover:text-slate-300 transition-colors leading-snug"
                                    >
                                        {card.title}
                                    </button>
                                )}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={handleDeleteCard}
                                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-elevated rounded-lg transition-colors"
                                        title="Delete card"
                                    >
                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-elevated rounded-lg transition-colors"
                                    >
                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Meta */}
                            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                                {card.creator && (
                                    <span className="flex items-center gap-1">
                                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24">
                                            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
                                            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                        {card.creator.name}
                                    </span>
                                )}
                                <span>{formatDate(card.createdAt)}</span>
                            </div>
                        </div>

                        <div className="p-6 flex flex-col gap-6">
                            {actionError && (
                                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{actionError}</p>
                            )}

                            {/* Assignees */}
                            <section>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assignees</h3>
                                {boardMembers.length === 0 ? (
                                    <p className="text-slate-600 text-xs">No board members found</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {boardMembers.map((m) => {
                                            const isAssigned = (card.assignedTo ?? []).some((a) => a.userId === m.memberId);
                                            const isLoading = assignLoading === m.memberId;
                                            // Employees may only assign/unassign themselves (server rule)
                                            const canToggle = isBoardAdmin || m.memberId === user?.id;
                                            return (
                                                <button
                                                    key={m.memberId}
                                                    onClick={() => handleToggleAssign(m.memberId)}
                                                    disabled={isLoading || !canToggle}
                                                    className={`flex items-center gap-2 border rounded-full px-3 py-1 text-xs transition-all ${
                                                        isAssigned
                                                            ? "bg-accent/20 border-accent text-white"
                                                            : "bg-elevated border-border text-slate-400 hover:border-slate-500 hover:text-white"
                                                    }`}
                                                    title={!canToggle ? "Only board admins can assign other people" : isAssigned ? "Click to unassign" : "Click to assign"}
                                                >
                                                    <div
                                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                        style={{ background: stringToColor(m.user?.name || String(m.memberId)) }}
                                                    >
                                                        {m.user?.name[0]?.toUpperCase() ?? "?"}
                                                    </div>
                                                    {m.user?.name ?? `User #${m.memberId}`}
                                                    {isAssigned && (
                                                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24">
                                                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                    {isLoading && (
                                                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* Description */}
                            <section>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
                                {editingDesc ? (
                                    <div className="flex flex-col gap-2">
                                        <textarea
                                            autoFocus
                                            rows={4}
                                            value={descValue}
                                            onChange={(e) => setDescValue(e.target.value)}
                                            placeholder="Add a description..."
                                            className="w-full bg-elevated border border-accent/50 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm outline-none resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSaveDesc}
                                                className="bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => { setEditingDesc(false); setDescValue(card.description || ""); }}
                                                className="bg-elevated text-slate-400 hover:text-white px-4 py-1.5 rounded-lg text-xs transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setEditingDesc(true)}
                                        className="w-full text-left bg-elevated hover:bg-elevated/70 border border-border rounded-xl px-4 py-3 text-sm transition-colors min-h-[60px]"
                                    >
                                        {card.description ? (
                                            <span className="text-slate-300">{card.description}</span>
                                        ) : (
                                            <span className="text-slate-600">Add a description...</span>
                                        )}
                                    </button>
                                )}
                            </section>

                            {/* Comments */}
                            <section>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                    Comments {card.comments?.length ? `(${card.comments.length})` : ""}
                                </h3>

                                {/* New comment */}
                                <div className="flex gap-3 mb-4">
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                                        style={{ background: stringToColor(user?.name || "?") }}
                                    >
                                        {user?.name[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2">
                                        <textarea
                                            rows={2}
                                            placeholder="Write a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            className="w-full bg-elevated border border-border focus:border-accent/50 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm outline-none transition-colors resize-none"
                                        />
                                        {newComment.trim() && (
                                            <button
                                                onClick={handleAddComment}
                                                disabled={submittingComment}
                                                className="self-start bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                            >
                                                {submittingComment ? "Posting..." : "Post comment"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Comment list */}
                                {(card.comments?.length ?? 0) === 0 ? (
                                    <p className="text-slate-600 text-xs text-center py-4">No comments yet</p>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        {card.comments?.map((comment) => (
                                            <CommentItem
                                                key={comment.id}
                                                comment={comment}
                                                currentUserId={user?.id ?? 0}
                                                canDeleteAny={isBoardAdmin}
                                                editingId={editingCommentId}
                                                editText={editCommentText}
                                                onEdit={(id, text) => { setEditingCommentId(id); setEditCommentText(text); }}
                                                onEditChange={setEditCommentText}
                                                onEditSave={handleEditComment}
                                                onEditCancel={() => setEditingCommentId(null)}
                                                onDelete={handleDeleteComment}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

interface CommentItemProps {
    comment: Comment;
    currentUserId: number;
    /** Board admins can delete anyone's comment (editing stays creator-only) */
    canDeleteAny: boolean;
    editingId: number | null;
    editText: string;
    onEdit: (id: number, text: string) => void;
    onEditChange: (text: string) => void;
    onEditSave: (id: number) => void;
    onEditCancel: () => void;
    onDelete: (id: number) => void;
}

function CommentItem({ comment, currentUserId, canDeleteAny, editingId, editText, onEdit, onEditChange, onEditSave, onEditCancel, onDelete }: CommentItemProps) {
    const isOwner = comment.creatorId === currentUserId;

    return (
        <div className="flex gap-3">
            <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                style={{ background: stringToColor(comment.creator?.name || "?") }}
            >
                {comment.creator?.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-xs font-medium">{comment.creator?.name ?? "Unknown"}</span>
                    <span className="text-slate-600 text-xs">
                        {new Date(comment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                </div>
                {editingId === comment.id ? (
                    <div className="flex flex-col gap-2">
                        <textarea
                            autoFocus
                            rows={2}
                            value={editText}
                            onChange={(e) => onEditChange(e.target.value)}
                            className="w-full bg-elevated border border-accent/50 rounded-xl px-3 py-2 text-white text-sm outline-none resize-none"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEditSave(comment.id)}
                                className="bg-accent hover:bg-accent-hover text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                            >
                                Save
                            </button>
                            <button
                                onClick={onEditCancel}
                                className="bg-elevated text-slate-400 hover:text-white px-3 py-1 rounded-lg text-xs transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="group relative">
                        <p className="text-slate-300 text-sm leading-relaxed">{comment.text}</p>
                        {(isOwner || canDeleteAny) && (
                            <div className="flex gap-2 mt-1">
                                {isOwner && (<>
                                <button
                                    onClick={() => onEdit(comment.id, comment.text)}
                                    className="text-slate-600 hover:text-slate-400 text-xs transition-colors"
                                >
                                    Edit
                                </button>
                                <span className="text-slate-700">·</span>
                                </>)}
                                <button
                                    onClick={() => onDelete(comment.id)}
                                    className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
