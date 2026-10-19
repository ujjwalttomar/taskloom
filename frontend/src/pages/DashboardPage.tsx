import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Workspace, Board } from "../types";

export function DashboardPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
    const [boards, setBoards] = useState<Board[]>([]);
    const [loading, setLoading] = useState(true);
    const [boardsLoading, setBoardsLoading] = useState(false);
    const [tab, setTab] = useState<"boards" | "members">("boards");

    // Create workspace modal
    const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
    const [showCreateBoard, setShowCreateBoard] = useState(false);
    const [wsName, setWsName] = useState("");
    const [boardTitle, setBoardTitle] = useState("");
    const [creating, setCreating] = useState(false);

    // Edit workspace
    const [editingWsName, setEditingWsName] = useState(false);
    const [editWsNameValue, setEditWsNameValue] = useState("");
    const [savingWsName, setSavingWsName] = useState(false);
    const [deletingWs, setDeletingWs] = useState(false);

    // Add member state
    const [addMemberEmail, setAddMemberEmail] = useState("");
    const [addMemberRole, setAddMemberRole] = useState("EMPLOYEE");
    const [addMemberLoading, setAddMemberLoading] = useState(false);
    const [addMemberError, setAddMemberError] = useState("");

    // Remove member state
    const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

    const refreshWorkspaces = async (selectId?: number) => {
        const data = await api.workspaces.getAll();
        setWorkspaces(data.workspaces);
        const target = selectId
            ? data.workspaces.find((w) => w.id === selectId) ?? data.workspaces[0]
            : data.workspaces.find((w) => w.id === selectedWorkspace?.id) ?? data.workspaces[0];
        setSelectedWorkspace(target ?? null);
    };

    useEffect(() => {
        api.workspaces.getAll().then((data) => {
            setWorkspaces(data.workspaces);
            if (data.workspaces.length > 0) {
                setSelectedWorkspace(data.workspaces[0]!);
            }
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (!selectedWorkspace) return;
        setBoardsLoading(true);
        api.boards.getAll(selectedWorkspace.id).then((data) => {
            setBoards(data.boards);
            setBoardsLoading(false);
        });
    }, [selectedWorkspace]);

    // Reset tab when switching workspace
    const selectWorkspace = (ws: Workspace) => {
        setSelectedWorkspace(ws);
        setTab("boards");
        setAddMemberEmail("");
        setAddMemberError("");
    };

    const createWorkspace = async () => {
        if (!wsName.trim()) return;
        setCreating(true);
        const data = await api.workspaces.create({ name: wsName.trim() });
        setWsName("");
        setShowCreateWorkspace(false);
        setCreating(false);
        await refreshWorkspaces(data.workspace.id);
    };

    const createBoard = async () => {
        if (!boardTitle.trim() || !selectedWorkspace) return;
        setCreating(true);
        const data = await api.boards.create(selectedWorkspace.id, { title: boardTitle.trim() });
        setBoards((prev) => [...prev, data.board]);
        setBoardTitle("");
        setShowCreateBoard(false);
        setCreating(false);
    };

    const handleAddMember = async () => {
        if (!addMemberEmail.trim() || !selectedWorkspace) return;
        setAddMemberLoading(true);
        setAddMemberError("");
        try {
            await api.workspaces.addMember(selectedWorkspace.id, {
                email: addMemberEmail.trim(),
                role: addMemberRole,
            });
            setAddMemberEmail("");
            await refreshWorkspaces();
        } catch (e: any) {
            setAddMemberError(e.message || "Failed to add member");
        } finally {
            setAddMemberLoading(false);
        }
    };

    const handleRemoveMember = async (memberId: number) => {
        if (!selectedWorkspace) return;
        setRemovingMemberId(memberId);
        try {
            await api.workspaces.removeMember(selectedWorkspace.id, memberId);
            await refreshWorkspaces();
        } catch (e: any) {
            alert(e.message || "Failed to remove member");
        } finally {
            setRemovingMemberId(null);
        }
    };

    const handleSaveWsName = async () => {
        if (!selectedWorkspace || !editWsNameValue.trim()) { setEditingWsName(false); return; }
        setSavingWsName(true);
        try {
            await api.workspaces.update(selectedWorkspace.id, { name: editWsNameValue.trim() });
            await refreshWorkspaces();
        } catch (e: any) {
            alert(e.message || "Failed to update workspace");
        } finally {
            setSavingWsName(false);
            setEditingWsName(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!selectedWorkspace) return;
        if (!confirm(`Delete workspace "${selectedWorkspace.name}"? This will delete all boards and cards inside it.`)) return;
        setDeletingWs(true);
        try {
            await api.workspaces.delete(selectedWorkspace.id);
            await refreshWorkspaces();
            setTab("boards");
        } catch (e: any) {
            alert(e.message || "Failed to delete workspace");
        } finally {
            setDeletingWs(false);
        }
    };

    const handleChangeMemberRole = async (memberId: number, currentRole: string) => {
        if (!selectedWorkspace) return;
        const newRole = currentRole === "ADMIN" ? "EMPLOYEE" : "ADMIN";
        try {
            await api.workspaces.updateMemberRole(selectedWorkspace.id, memberId, newRole);
            await refreshWorkspaces();
        } catch (e: any) {
            alert(e.message || "Failed to change role");
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate("/");
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const members = selectedWorkspace?.members ?? [];
    const isCurrentUserAdmin = members.find((m) => m.memberId === user?.id)?.role === "ADMIN";

    return (
        <div className="min-h-screen bg-bg flex">
            {/* Sidebar */}
            <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
                {/* Logo */}
                <div className="p-4 border-b border-border flex items-center gap-2">
                    <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
                        </svg>
                    </div>
                    <span className="font-semibold text-white text-sm">Taskloom</span>
                </div>

                {/* Workspaces */}
                <div className="flex-1 overflow-y-auto p-3">
                    <div className="flex items-center justify-between px-2 mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Workspaces</span>
                        <button
                            onClick={() => setShowCreateWorkspace(true)}
                            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-elevated rounded transition-colors"
                            title="New workspace"
                        >
                            <svg width="12" height="12" fill="none" viewBox="0 0 12 12">
                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>

                    {workspaces.length === 0 ? (
                        <p className="text-slate-600 text-xs px-2 py-4">No workspaces yet</p>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            {workspaces.map((ws) => (
                                <button
                                    key={ws.id}
                                    onClick={() => selectWorkspace(ws)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                        selectedWorkspace?.id === ws.id
                                            ? "bg-elevated text-white font-medium"
                                            : "text-slate-400 hover:text-white hover:bg-elevated/50"
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold shrink-0"
                                            style={{ background: stringToColor(ws.name) }}
                                        >
                                            {ws.name[0]?.toUpperCase()}
                                        </div>
                                        <span className="truncate">{ws.name}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* User footer */}
                <div className="p-3 border-t border-border">
                    <div className="flex items-center gap-2 px-2 py-2">
                        <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {user?.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{user?.name}</p>
                            <p className="text-slate-500 text-xs truncate">{user?.email}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-slate-500 hover:text-white transition-colors p-1 rounded"
                            title="Logout"
                        >
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-auto">
                {!selectedWorkspace ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="w-16 h-16 bg-elevated rounded-2xl flex items-center justify-center">
                            <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
                                <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="#6366f1" strokeWidth="1.5" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <h2 className="text-white font-semibold mb-1">No workspace selected</h2>
                            <p className="text-slate-500 text-sm">Create a workspace to get started</p>
                        </div>
                        <button
                            onClick={() => setShowCreateWorkspace(true)}
                            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Create workspace
                        </button>
                    </div>
                ) : (
                    <div className="p-8">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex-1 min-w-0 mr-4">
                                {editingWsName ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            autoFocus
                                            value={editWsNameValue}
                                            onChange={(e) => setEditWsNameValue(e.target.value)}
                                            onBlur={handleSaveWsName}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSaveWsName();
                                                if (e.key === "Escape") { setEditingWsName(false); }
                                            }}
                                            className="text-2xl font-bold bg-elevated border border-accent/50 rounded-xl px-3 py-1 text-white outline-none"
                                        />
                                        <button onClick={handleSaveWsName} disabled={savingWsName} className="text-accent text-sm">
                                            {savingWsName ? "Saving..." : "Save"}
                                        </button>
                                        <button onClick={() => setEditingWsName(false)} className="text-slate-500 text-sm">Cancel</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group">
                                        <h1 className="text-2xl font-bold text-white truncate">{selectedWorkspace.name}</h1>
                                        {isCurrentUserAdmin && (
                                            <button
                                                onClick={() => { setEditWsNameValue(selectedWorkspace.name); setEditingWsName(true); }}
                                                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white transition-all p-1 rounded"
                                                title="Rename workspace"
                                            >
                                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                                <p className="text-slate-500 text-sm mt-0.5">
                                    {members.length} member{members.length !== 1 ? "s" : ""}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {isCurrentUserAdmin && (
                                    <button
                                        onClick={handleDeleteWorkspace}
                                        disabled={deletingWs}
                                        className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-red-400 hover:bg-elevated border border-transparent hover:border-red-400/20 rounded-lg text-xs transition-colors disabled:opacity-50"
                                        title="Delete workspace"
                                    >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        {deletingWs ? "Deleting..." : "Delete"}
                                    </button>
                                )}
                                {tab === "boards" && (
                                    <button
                                        onClick={() => setShowCreateBoard(true)}
                                        className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <svg width="14" height="14" fill="none" viewBox="0 0 12 12">
                                            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                        New Board
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 mb-6 border-b border-border">
                            <button
                                onClick={() => setTab("boards")}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                    tab === "boards"
                                        ? "border-accent text-white"
                                        : "border-transparent text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                Boards
                            </button>
                            <button
                                onClick={() => setTab("members")}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                    tab === "members"
                                        ? "border-accent text-white"
                                        : "border-transparent text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                Members
                            </button>
                        </div>

                        {/* Boards tab */}
                        {tab === "boards" && (
                            boardsLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : boards.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="w-14 h-14 bg-elevated rounded-2xl flex items-center justify-center">
                                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                                            <rect x="3" y="3" width="7" height="11" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
                                            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
                                            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#64748b" strokeWidth="1.5" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <h2 className="text-white font-semibold mb-1">No boards yet</h2>
                                        <p className="text-slate-500 text-sm">Create your first board to organize work</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCreateBoard(true)}
                                        className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Create board
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {boards.map((board) => (
                                        <button
                                            key={board.id}
                                            onClick={() => navigate(`/boards/${board.id}`)}
                                            className="group bg-surface hover:bg-elevated border border-border hover:border-accent/30 rounded-xl p-5 text-left transition-all duration-150"
                                        >
                                            <div
                                                className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center text-sm font-bold text-white"
                                                style={{ background: stringToColor(board.title) }}
                                            >
                                                {board.title[0]?.toUpperCase()}
                                            </div>
                                            <h3 className="text-white font-medium text-sm mb-1 group-hover:text-accent transition-colors">
                                                {board.title}
                                            </h3>
                                            {board.description && (
                                                <p className="text-slate-500 text-xs line-clamp-2 mb-3">{board.description}</p>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                {(board.members ?? []).slice(0, 4).map((m) => (
                                                    <div
                                                        key={m.memberId}
                                                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                                        style={{ background: stringToColor(m.user?.name || String(m.memberId)) }}
                                                        title={m.user?.name}
                                                    >
                                                        {m.user?.name[0]?.toUpperCase() || "?"}
                                                    </div>
                                                ))}
                                                {(board.members ?? []).length > 4 && (
                                                    <span className="text-slate-500 text-xs">+{(board.members ?? []).length - 4}</span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )
                        )}

                        {/* Members tab */}
                        {tab === "members" && (
                            <div className="max-w-2xl">
                                {/* Add member form — only admins */}
                                {isCurrentUserAdmin && (
                                    <div className="bg-surface border border-border rounded-xl p-4 mb-6">
                                        <p className="text-white text-sm font-medium mb-3">Add member</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                placeholder="Email address"
                                                value={addMemberEmail}
                                                onChange={(e) => { setAddMemberEmail(e.target.value); setAddMemberError(""); }}
                                                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                                                className="flex-1 bg-elevated border border-border rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 outline-none focus:border-accent/50 transition-colors"
                                            />
                                            <select
                                                value={addMemberRole}
                                                onChange={(e) => setAddMemberRole(e.target.value)}
                                                className="bg-elevated border border-border rounded-lg px-3 py-2 text-white text-sm outline-none"
                                            >
                                                <option value="EMPLOYEE">Employee</option>
                                                <option value="ADMIN">Admin</option>
                                            </select>
                                            <button
                                                onClick={handleAddMember}
                                                disabled={addMemberLoading || !addMemberEmail.trim()}
                                                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                            >
                                                {addMemberLoading ? "Adding..." : "Add"}
                                            </button>
                                        </div>
                                        {addMemberError && (
                                            <p className="text-red-400 text-xs mt-2">{addMemberError}</p>
                                        )}
                                    </div>
                                )}

                                {/* Member list */}
                                <div className="flex flex-col gap-2">
                                    {members.map((m) => (
                                        <div
                                            key={m.memberId}
                                            className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3"
                                        >
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                                                style={{ background: stringToColor(m.user?.name || String(m.memberId)) }}
                                            >
                                                {m.user?.name[0]?.toUpperCase() ?? "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-medium truncate">
                                                    {m.user?.name ?? `User #${m.memberId}`}
                                                    {m.memberId === user?.id && (
                                                        <span className="text-slate-500 text-xs ml-1">(you)</span>
                                                    )}
                                                </p>
                                                <p className="text-slate-500 text-xs truncate">{m.user?.email}</p>
                                            </div>
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                    m.role === "ADMIN"
                                                        ? "bg-accent/20 text-accent"
                                                        : "bg-elevated text-slate-400"
                                                }`}
                                            >
                                                {m.role === "ADMIN" ? "Admin" : "Employee"}
                                            </span>
                                            {isCurrentUserAdmin && m.memberId !== user?.id && (
                                                <button
                                                    onClick={() => handleChangeMemberRole(m.memberId, m.role)}
                                                    className="text-slate-600 hover:text-slate-300 text-xs transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                                                    title={m.role === "ADMIN" ? "Demote to Employee" : "Promote to Admin"}
                                                >
                                                    {m.role === "ADMIN" ? "↓" : "↑"}
                                                </button>
                                            )}
                                            {isCurrentUserAdmin && m.memberId !== user?.id && (
                                                <button
                                                    onClick={() => handleRemoveMember(m.memberId)}
                                                    disabled={removingMemberId === m.memberId}
                                                    className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50 p-1 rounded"
                                                    title="Remove member"
                                                >
                                                    {removingMemberId === m.memberId ? (
                                                        <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Create Workspace Modal */}
            {showCreateWorkspace && (
                <Modal title="New workspace" onClose={() => setShowCreateWorkspace(false)}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="Workspace name"
                        value={wsName}
                        onChange={(e) => setWsName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                        className="w-full bg-elevated border border-border rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm outline-none focus:border-accent/50 transition-colors"
                    />
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setShowCreateWorkspace(false)}
                            className="flex-1 bg-elevated hover:bg-border text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={createWorkspace}
                            disabled={creating || !wsName.trim()}
                            className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {creating ? "Creating..." : "Create"}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Create Board Modal */}
            {showCreateBoard && (
                <Modal title="New board" onClose={() => setShowCreateBoard(false)}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="Board title"
                        value={boardTitle}
                        onChange={(e) => setBoardTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createBoard()}
                        className="w-full bg-elevated border border-border rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm outline-none focus:border-accent/50 transition-colors"
                    />
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setShowCreateBoard(false)}
                            className="flex-1 bg-elevated hover:bg-border text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={createBoard}
                            disabled={creating || !boardTitle.trim()}
                            className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {creating ? "Creating..." : "Create"}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold">{title}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
                {children}
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
