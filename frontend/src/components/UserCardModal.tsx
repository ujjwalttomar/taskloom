import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BoardProfile, WorkspaceProfile } from "../types";

interface Props {
    userId: number;
    boardId: number;
    workspaceId: number;
    isOnline: boolean;
    onClose: () => void;
}

function stringToColor(str: string): string {
    const palette = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#3b82f6","#f97316"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length]!;
}

export function UserCardModal({ userId, boardId, workspaceId, isOnline, onClose }: Props) {
    const [boardProfile, setBoardProfile] = useState<BoardProfile | null>(null);
    const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingWorkspace, setLoadingWorkspace] = useState(false);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoading(true);
        api.userProfiles.getBoardProfile(boardId, userId)
            .then((data) => setBoardProfile(data.profile))
            .catch((e) => setError(e.message || "Failed to load profile"))
            .finally(() => setLoading(false));
    }, [boardId, userId]);

    const handleViewFullProfile = async () => {
        if (workspaceProfile) { setShowWorkspace(true); return; }
        setLoadingWorkspace(true);
        try {
            const data = await api.userProfiles.getWorkspaceProfile(workspaceId, userId);
            setWorkspaceProfile(data.profile);
            setShowWorkspace(true);
        } catch (e: any) {
            alert(e.message || "Cannot load full profile");
        } finally {
            setLoadingWorkspace(false);
        }
    };

    const name = boardProfile?.user.name ?? "...";
    const email = boardProfile?.user.email ?? "";
    const role = boardProfile?.role ?? "EMPLOYEE";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-elevated border border-border rounded-2xl shadow-2xl w-full max-w-md z-10">

                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        {/* Avatar with online indicator */}
                        <div className="relative">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                                style={{ background: name !== "..." ? stringToColor(name) : "#374151" }}
                            >
                                {name[0]?.toUpperCase() ?? "?"}
                            </div>
                            {isOnline && (
                                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-elevated rounded-full" title="Online" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-base leading-tight">{name}</h2>
                            <p className="text-slate-400 text-xs mt-0.5">{email}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${role === "ADMIN" ? "bg-accent/20 text-accent" : "bg-bg text-slate-400"}`}>
                                    {role === "ADMIN" ? "Admin" : "Employee"}
                                </span>
                                {isOnline ? (
                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
                                        Online
                                    </span>
                                ) : (
                                    <span className="text-xs text-slate-500">Offline</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5">
                    {loading ? (
                        <div className="flex justify-center py-6">
                            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : error ? (
                        <p className="text-red-400 text-sm text-center py-4">{error}</p>
                    ) : showWorkspace && workspaceProfile ? (
                        /* Workspace full profile view */
                        <div className="space-y-4">
                            <button
                                onClick={() => setShowWorkspace(false)}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs transition-colors"
                            >
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                    <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Back to board profile
                            </button>

                            <div>
                                <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Workspace Role</p>
                                <span className={`text-xs px-2 py-1 rounded font-medium ${workspaceProfile.workspaceRole === "ADMIN" ? "bg-accent/20 text-accent" : "bg-bg text-slate-400"}`}>
                                    {workspaceProfile.workspaceRole === "ADMIN" ? "Admin" : "Employee"}
                                </span>
                            </div>

                            <div>
                                <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Boards ({workspaceProfile.boards.length})</p>
                                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                    {workspaceProfile.boards.length === 0 ? (
                                        <p className="text-slate-500 text-xs">No boards joined yet</p>
                                    ) : workspaceProfile.boards.map((b) => (
                                        <div key={b.boardId} className="flex items-center justify-between px-2.5 py-1.5 bg-bg rounded-lg">
                                            <span className="text-slate-200 text-xs truncate">{b.title}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ml-2 shrink-0 ${b.role === "ADMIN" ? "bg-accent/20 text-accent" : "text-slate-500"}`}>
                                                {b.role === "ADMIN" ? "Admin" : "Employee"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">All Assigned Tasks ({workspaceProfile.assignedCards.length})</p>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {workspaceProfile.assignedCards.length === 0 ? (
                                        <p className="text-slate-500 text-xs">No tasks assigned</p>
                                    ) : workspaceProfile.assignedCards.map((c) => (
                                        <div key={c.cardId} className="px-2.5 py-2 bg-bg rounded-lg">
                                            <p className="text-slate-200 text-xs font-medium truncate">{c.title}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">{c.boardTitle} · {c.listTitle}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Board profile view (default) */
                        <div className="space-y-4">
                            <div>
                                <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">
                                    Assigned Cards in this board ({boardProfile?.assignedCards.length ?? 0})
                                </p>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                    {(boardProfile?.assignedCards.length ?? 0) === 0 ? (
                                        <p className="text-slate-500 text-xs">No cards assigned in this board</p>
                                    ) : boardProfile?.assignedCards.map((c) => (
                                        <div key={c.cardId} className="px-2.5 py-2 bg-bg rounded-lg">
                                            <p className="text-slate-200 text-xs font-medium truncate">{c.title}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">{c.listTitle}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Full profile button — tries workspace profile API; silently absent if no access */}
                            <button
                                onClick={handleViewFullProfile}
                                disabled={loadingWorkspace}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-slate-400 hover:text-white hover:border-accent/50 text-xs transition-colors disabled:opacity-50"
                            >
                                {loadingWorkspace ? (
                                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 110 8 4 4 0 010-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                                View full workspace profile
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
