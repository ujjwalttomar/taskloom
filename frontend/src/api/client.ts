const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Fired when the session can't be refreshed; AuthProvider listens and logs the user out. */
export const SESSION_EXPIRED_EVENT = "taskloom:session-expired";

/** Error carrying the HTTP status, so callers can react to e.g. 403/404 specifically. */
export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function send(path: string, options?: RequestInit) {
    return fetch(`${BASE}${path}`, {
        ...options,
        credentials: "include",
        // Only JSON bodies need Content-Type; setting it on GET/DELETE forces an extra CORS preflight
        headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers },
    });
}

async function toError(res: Response): Promise<ApiError> {
    const body = await res.json().catch(() => null);
    // The API answers { message }; older/edge responses may use { error }
    const message = body?.message ?? body?.error ?? (res.status === 429 ? "Too many requests, please slow down" : "Request failed");
    return new ApiError(res.status, message);
}

// Single-flight refresh: if several requests get a 401 at once, they all wait on ONE refresh call
let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
    refreshing ??= send("/auth/refresh", { method: "POST" })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => { refreshing = null; });
    return refreshing;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    let res = await send(path, options);

    // Access token (15 min) expired → refresh once and retry. Never for the auth endpoints themselves.
    if (res.status === 401 && !path.startsWith("/auth/refresh") && !path.startsWith("/auth/logout")) {
        if (!(await refreshSession())) {
            window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
            throw new ApiError(401, "Session expired. Please log in again.");
        }
        res = await send(path, options);
    }

    if (!res.ok) throw await toError(res); // the server's real message, not a generic one
    return res.json();
}

// ─── Auth ────────────────────────────────────────────────

export const api = {
    auth: {
        me: () => request<{ user: import("../types").User }>("/auth/me"),
        logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
        // Short-lived token for the WebSocket server (the auth cookie never reaches its host)
        wsTicket: () => request<{ ticket: string }>("/auth/ws-ticket"),
    },

    // ─── Workspaces ─────────────────────────────────────

    workspaces: {
        getAll: () => request<{ workspaces: import("../types").Workspace[] }>("/api/workspaces"),
        create: (data: { name: string; description?: string }) =>
            request<{ workspace: import("../types").Workspace }>("/api/workspaces", {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (id: number, data: { name?: string; description?: string }) =>
            request<{ workspace: import("../types").Workspace }>(`/api/workspaces/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        delete: (id: number) => request(`/api/workspaces/${id}`, { method: "DELETE" }),
        updateMemberRole: (id: number, memberId: number, role: string) =>
            request(`/api/workspaces/${id}/members/${memberId}`, {
                method: "PATCH",
                body: JSON.stringify({ role }),
            }),
        removeMember: (id: number, memberId: number) =>
            request(`/api/workspaces/${id}/members/${memberId}`, { method: "DELETE" }),
    },

    // ─── Boards ──────────────────────────────────────────

    boards: {
        getAll: (workspaceId: number) =>
            request<{ boards: import("../types").Board[] }>(`/api/workspaces/${workspaceId}/boards`),
        getOne: (boardId: number) =>
            request<{ board: import("../types").Board }>(`/api/boards/${boardId}`),
        create: (workspaceId: number, data: { title: string; description?: string }) =>
            request<{ board: import("../types").Board }>(`/api/workspaces/${workspaceId}/boards`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (boardId: number, data: { title?: string; description?: string }) =>
            request<{ board: import("../types").Board }>(`/api/boards/${boardId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        delete: (boardId: number) => request(`/api/boards/${boardId}`, { method: "DELETE" }),
        addMember: (boardId: number, data: { email: string; role?: string }) =>
            request<{ member: import("../types").BoardMember }>(`/api/boards/${boardId}/members`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        updateMemberRole: (boardId: number, memberId: number, role: string) =>
            request(`/api/boards/${boardId}/members/${memberId}`, {
                method: "PATCH",
                body: JSON.stringify({ role }),
            }),
        removeMember: (boardId: number, memberId: number) =>
            request(`/api/boards/${boardId}/members/${memberId}`, { method: "DELETE" }),
    },

    // ─── Lists ───────────────────────────────────────────

    lists: {
        create: (boardId: number, data: { title: string }) =>
            request<{ list: import("../types").List }>(`/api/boards/${boardId}/lists`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (boardId: number, listId: number, data: { title: string }) =>
            request<{ list: import("../types").List }>(`/api/boards/${boardId}/lists/${listId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        delete: (boardId: number, listId: number) =>
            request<{ listId: number }>(`/api/boards/${boardId}/lists/${listId}`, { method: "DELETE" }),
        reorder: (boardId: number, listId: number, data: { afterListId?: number; beforeListId?: number }) =>
            request<{ list: import("../types").List }>(`/api/boards/${boardId}/lists/${listId}/order`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
    },

    // ─── Cards ───────────────────────────────────────────

    cards: {
        getOne: (cardId: number) =>
            request<{ card: import("../types").Card }>(`/api/cards/${cardId}`),
        create: (listId: number, data: { title: string; description?: string }) =>
            request<{ card: import("../types").Card }>(`/api/lists/${listId}/cards`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (cardId: number, data: { title?: string; description?: string }) =>
            request<{ card: import("../types").Card }>(`/api/cards/${cardId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        delete: (cardId: number) =>
            request<{ cardId: number }>(`/api/cards/${cardId}`, { method: "DELETE" }),
        move: (cardId: number, data: { targetListId: number; afterCardId?: number; beforeCardId?: number }) =>
            request<{ card: import("../types").Card }>(`/api/cards/${cardId}/move`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        assign: (cardId: number, userId: number) =>
            request<{ assignment: import("../types").AssignedCard }>(`/api/cards/${cardId}/assign`, {
                method: "POST",
                body: JSON.stringify({ userId }),
            }),
        unassign: (cardId: number, userId: number) =>
            request(`/api/cards/${cardId}/assign/${userId}`, { method: "DELETE" }),
    },

    // ─── Comments ────────────────────────────────────────

    comments: {
        create: (cardId: number, data: { text: string }) =>
            request<{ comment: import("../types").Comment }>(`/api/cards/${cardId}/comments`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (commentId: number, data: { text: string }) =>
            request<{ comment: import("../types").Comment }>(`/api/comments/${commentId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        delete: (commentId: number) =>
            request<{ commentId: number }>(`/api/comments/${commentId}`, { method: "DELETE" }),
    },

    // ─── User Profiles ───────────────────────────────────

    userProfiles: {
        getBoardProfile: (boardId: number, memberId: number) =>
            request<{ profile: import("../types").BoardProfile }>(`/api/boards/${boardId}/members/${memberId}/profile`),
        getWorkspaceProfile: (workspaceId: number, memberId: number) =>
            request<{ profile: import("../types").WorkspaceProfile }>(`/api/workspaces/${workspaceId}/members/${memberId}/profile`),
    },

    // ─── Invites ─────────────────────────────────────────

    invites: {
        send: (workspaceId: number, data: { email: string; role?: string }) =>
            request<{ message: string; inviteUrl?: string }>(`/api/workspaces/${workspaceId}/invites`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        getDetails: (token: string) =>
            request<{
                workspace: { name: string; description?: string };
                email: string;
                role: string;
                expiresAt: string;
            }>(`/api/invites/${token}`),
        accept: (token: string) =>
            request<{ message: string; workspaceId: number }>(`/api/invites/${token}/accept`, {
                method: "POST",
            }),
    },
};
