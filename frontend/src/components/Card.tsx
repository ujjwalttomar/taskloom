import { useState } from "react";
import type { Card as CardType } from "../types";

interface CardProps {
    card: CardType;
    onClick: () => void;
}

export function Card({ card, onClick }: CardProps) {
    const [hovered, setHovered] = useState(false);
    const commentCount = card.comments?.length ?? 0;
    const assigneeCount = card.assignedTo?.length ?? 0;

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="bg-elevated border border-border hover:border-accent/30 rounded-xl p-3 cursor-pointer transition-all duration-150 group"
            style={{
                boxShadow: hovered ? "0 4px 20px rgba(99,102,241,0.08)" : "none",
            }}
        >
            <p className="text-white text-sm font-medium leading-snug mb-2 group-hover:text-slate-100">
                {card.title}
            </p>

            {card.description && (
                <p className="text-slate-500 text-xs line-clamp-2 mb-2">{card.description}</p>
            )}

            {(commentCount > 0 || assigneeCount > 0) && (
                <div className="flex items-center gap-3 mt-2">
                    {commentCount > 0 && (
                        <div className="flex items-center gap-1 text-slate-500">
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                            </svg>
                            <span className="text-xs">{commentCount}</span>
                        </div>
                    )}
                    {assigneeCount > 0 && (
                        <div className="flex items-center gap-1">
                            {card.assignedTo!.slice(0, 3).map((a) => (
                                <div
                                    key={a.userId}
                                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                    style={{ background: stringToColor(a.user?.name || String(a.userId)) }}
                                    title={a.user?.name}
                                >
                                    {a.user?.name[0]?.toUpperCase() ?? "?"}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 60%, 40%)`;
}
