const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...options?.headers },
        ...options,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Request failed");
    }

    return res.json();
}

// ─── Auth ────────────────────────────────────────────────

export const api = {
    auth: {
        me: () => request<{ user: import("../types").User }>("/auth/me"),
        refresh: () => request<{ message: string }>("/auth/refresh", { method: "POST" }),
        logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
    },

    // ─── Workspaces ─────────────────────────────────────

    workspaces: {
        getAll: () => request<{ workspaces: import("../types").Workspace[] }>("/api/workspaces"),
        getOne: (id: number) => request<{ workspace: import("../types").Workspace }>(`/api/workspaces/${id}`),
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
        addMember: (id: number, data: { email: string; role?: string }) =>
            request(`/api/workspaces/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
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

    // ─── Invites ─────────────────────────────────────────

    invites: {
        send: (workspaceId: number, data: { email: string; role?: string }) =>
            request<{ message: string }>(`/api/workspaces/${workspaceId}/invites`, {
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
