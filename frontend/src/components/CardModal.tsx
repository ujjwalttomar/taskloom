import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { Card, Comment, BoardMember } from "../types";

interface CardModalProps {
    cardId: number;
    boardId: number;
    onClose: () => void;
    onCardUpdated: (card: Card) => void;
    onCardDeleted: (cardId: number) => void;
}

export function CardModal({ cardId, boardId, onClose, onCardUpdated, onCardDeleted }: CardModalProps) {
    const { user } = useAuth();
    const [card, setCard] = useState<Card | null>(null);
    const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState("");
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState("");

    const [newComment, setNewComment] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editCommentText, setEditCommentText] = useState("");

    const [assignLoading, setAssignLoading] = useState<number | null>(null);

    useEffect(() => {
        Promise.all([
            api.cards.getOne(cardId),
            api.boards.getOne(boardId),
        ]).then(([cardData, boardData]) => {
            setCard(cardData.card);
            setTitleValue(cardData.card.title);
            setDescValue(cardData.card.description || "");
            setBoardMembers(boardData.board.members ?? []);
            setLoading(false);
        });
    }, [cardId, boardId]);

    const handleSaveTitle = async () => {
        if (!card || !titleValue.trim() || titleValue === card.title) {
            setEditingTitle(false);
            return;
        }
        const data = await api.cards.update(cardId, { title: titleValue.trim() });
        setCard(data.card);
        onCardUpdated(data.card);
        setEditingTitle(false);
    };

    const handleSaveDesc = async () => {
        if (!card) return;
        const data = await api.cards.update(cardId, { title: card.title, description: descValue });
        setCard(data.card);
        onCardUpdated(data.card);
        setEditingDesc(false);
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !card) return;
        setSubmittingComment(true);
        const data = await api.comments.create(cardId, { text: newComment.trim() });
        setCard((prev) => prev ? {
            ...prev,
            comments: [data.comment, ...(prev.comments || [])],
        } : prev);
        setNewComment("");
        setSubmittingComment(false);
    };

    const handleEditComment = async (commentId: number) => {
        if (!editCommentText.trim()) return;
        const data = await api.comments.update(commentId, { text: editCommentText.trim() });
        setCard((prev) => prev ? {
            ...prev,
            comments: prev.comments?.map((c) => c.id === commentId ? data.comment : c),
        } : prev);
        setEditingCommentId(null);
    };

    const handleDeleteComment = async (commentId: number) => {
        await api.comments.delete(commentId);
        setCard((prev) => prev ? {
            ...prev,
            comments: prev.comments?.filter((c) => c.id !== commentId),
        } : prev);
    };

    const handleDeleteCard = async () => {
        if (!confirm("Delete this card?")) return;
        await api.cards.delete(cardId);
        onCardDeleted(cardId);
        onClose();
    };

    const handleToggleAssign = async (memberId: number) => {
        if (!card) return;
        const isAssigned = (card.assignedTo ?? []).some((a) => a.userId === memberId);
        setAssignLoading(memberId);
        try {
            if (isAssigned) {
                await api.cards.unassign(cardId, memberId);
                setCard((prev) => prev ? {
                    ...prev,
                    assignedTo: prev.assignedTo?.filter((a) => a.userId !== memberId),
                } : prev);
            } else {
                const data = await api.cards.assign(cardId, memberId);
                setCard((prev) => prev ? {
                    ...prev,
                    assignedTo: [...(prev.assignedTo ?? []), data.assignment],
                } : prev);
            }
        } catch (e: any) {
            alert(e.message || "Failed");
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
                ) : !card ? null : (
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
                                            return (
                                                <button
                                                    key={m.memberId}
                                                    onClick={() => handleToggleAssign(m.memberId)}
                                                    disabled={isLoading}
                                                    className={`flex items-center gap-2 border rounded-full px-3 py-1 text-xs transition-all ${
                                                        isAssigned
                                                            ? "bg-accent/20 border-accent text-white"
                                                            : "bg-elevated border-border text-slate-400 hover:border-slate-500 hover:text-white"
                                                    }`}
                                                    title={isAssigned ? "Click to unassign" : "Click to assign"}
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
    editingId: number | null;
    editText: string;
    onEdit: (id: number, text: string) => void;
    onEditChange: (text: string) => void;
    onEditSave: (id: number) => void;
    onEditCancel: () => void;
    onDelete: (id: number) => void;
}

function CommentItem({ comment, currentUserId, editingId, editText, onEdit, onEditChange, onEditSave, onEditCancel, onDelete }: CommentItemProps) {
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
                        {isOwner && (
                            <div className="flex gap-2 mt-1">
                                <button
                                    onClick={() => onEdit(comment.id, comment.text)}
                                    className="text-slate-600 hover:text-slate-400 text-xs transition-colors"
                                >
                                    Edit
                                </button>
                                <span className="text-slate-700">·</span>
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

function stringToColor(str: string): string {
    const palette = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#3b82f6","#f97316"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length]!;
}
