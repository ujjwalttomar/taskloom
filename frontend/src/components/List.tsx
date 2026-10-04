import { useState } from "react";
import type { List as ListType, Card as CardType } from "../types";
import { Card } from "./Card";
import { api } from "../api/client";

interface ListProps {
    list: ListType;
    boardId: number;
    onCardCreated: (listId: number, card: CardType) => void;
    onCardClick: (card: CardType) => void;
    onListDeleted: (listId: number) => void;
    onListRenamed: (listId: number, title: string) => void;
}

export function List({ list, boardId, onCardCreated, onCardClick, onListDeleted, onListRenamed }: ListProps) {
    const [addingCard, setAddingCard] = useState(false);
    const [newCardTitle, setNewCardTitle] = useState("");
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(list.title);
    const [submitting, setSubmitting] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const handleAddCard = async () => {
        if (!newCardTitle.trim()) return;
        setSubmitting(true);
        try {
            const data = await api.cards.create(list.id, { title: newCardTitle.trim() });
            onCardCreated(list.id, data.card);
            setNewCardTitle("");
            setAddingCard(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRenameList = async () => {
        if (!titleValue.trim() || titleValue === list.title) {
            setTitleValue(list.title);
            setEditingTitle(false);
            return;
        }
        await api.lists.update(boardId, list.id, { title: titleValue.trim() });
        onListRenamed(list.id, titleValue.trim());
        setEditingTitle(false);
    };

    const handleDeleteList = async () => {
        if (!confirm(`Delete list "${list.title}" and all its cards?`)) return;
        setMenuOpen(false);
        await api.lists.delete(boardId, list.id);
        onListDeleted(list.id);
    };

    return (
        <div className="flex flex-col w-72 shrink-0 bg-surface border border-border rounded-2xl max-h-full">
            {/* List header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                {editingTitle ? (
                    <input
                        autoFocus
                        value={titleValue}
                        onChange={(e) => setTitleValue(e.target.value)}
                        onBlur={handleRenameList}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameList();
                            if (e.key === "Escape") {
                                setTitleValue(list.title);
                                setEditingTitle(false);
                            }
                        }}
                        className="flex-1 bg-elevated border border-accent/50 rounded-lg px-2 py-1 text-white text-sm outline-none font-semibold"
                    />
                ) : (
                    <button
                        onClick={() => setEditingTitle(true)}
                        className="flex-1 text-left text-white font-semibold text-sm hover:text-slate-300 transition-colors"
                    >
                        {list.title}
                    </button>
                )}

                <div className="relative ml-2">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white hover:bg-elevated rounded-lg transition-colors"
                    >
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                        </svg>
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-8 bg-elevated border border-border rounded-xl shadow-2xl py-1 z-10 w-40">
                            <button
                                onClick={() => { setMenuOpen(false); setEditingTitle(true); }}
                                className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-border/50 text-xs transition-colors"
                            >
                                Rename list
                            </button>
                            <button
                                onClick={handleDeleteList}
                                className="w-full text-left px-3 py-2 text-red-400 hover:text-red-300 hover:bg-border/50 text-xs transition-colors"
                            >
                                Delete list
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <span className="px-4 pb-2 text-xs text-slate-600">
                {list.cards.length} card{list.cards.length !== 1 ? "s" : ""}
            </span>

            {/* Cards */}
            <div className="flex flex-col gap-2 px-3 overflow-y-auto flex-1 pb-2">
                {list.cards.map((card) => (
                    <Card key={card.id} card={card} onClick={() => onCardClick(card)} />
                ))}
            </div>

            {/* Add card */}
            <div className="p-3 pt-1">
                {addingCard ? (
                    <div className="flex flex-col gap-2">
                        <textarea
                            autoFocus
                            rows={2}
                            placeholder="Card title..."
                            value={newCardTitle}
                            onChange={(e) => setNewCardTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddCard();
                                }
                                if (e.key === "Escape") {
                                    setAddingCard(false);
                                    setNewCardTitle("");
                                }
                            }}
                            className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm outline-none focus:border-accent/50 transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleAddCard}
                                disabled={submitting || !newCardTitle.trim()}
                                className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            >
                                {submitting ? "Adding..." : "Add card"}
                            </button>
                            <button
                                onClick={() => { setAddingCard(false); setNewCardTitle(""); }}
                                className="flex-1 bg-elevated hover:bg-border text-slate-400 px-3 py-1.5 rounded-lg text-xs transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingCard(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-300 hover:bg-elevated rounded-xl text-xs transition-colors"
                    >
                        <svg width="12" height="12" fill="none" viewBox="0 0 12 12">
                            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Add card
                    </button>
                )}
            </div>
        </div>
    );
}
