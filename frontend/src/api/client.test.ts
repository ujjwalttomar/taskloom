import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError, SESSION_EXPIRED_EVENT } from "./client";

// The API client runs here against a fake `fetch`, so every server answer is scripted.
// `routes` maps "METHOD path" to a queue of responses; each call takes the next one.

type Scripted = { status: number; body?: unknown };
let routes: Record<string, Scripted[]>;
let calls: { method: string; path: string; init: RequestInit }[];
let sessionExpiredEvents: number;

const respond = ({ status, body }: Scripted) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
    routes = {};
    calls = [];
    sessionExpiredEvents = 0;
    const win = new EventTarget();
    win.addEventListener(SESSION_EXPIRED_EVENT, () => sessionExpiredEvents++);
    vi.stubGlobal("window", win);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = new URL(url).pathname;
        const method = init.method ?? "GET";
        calls.push({ method, path, init });
        const next = routes[`${method} ${path}`]?.shift();
        if (!next) throw new Error(`No scripted response for ${method} ${path}`);
        await new Promise((r) => setTimeout(r, 5)); // let concurrent requests overlap, like a real network
        return respond(next);
    }));
});

const script = (key: string, ...responses: Scripted[]) => {
    routes[key] = [...(routes[key] ?? []), ...responses];
};
const count = (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length;

describe("requests", () => {
    it("send cookies, and only set Content-Type when there is a body (no CORS preflight on GET)", async () => {
        script("GET /api/workspaces", { status: 200, body: { workspaces: [] } });
        script("POST /api/workspaces", { status: 201, body: { workspace: { id: 1 } } });
        await api.workspaces.getAll();
        await api.workspaces.create({ name: "Team" });

        const [get, post] = calls;
        expect(get!.init.credentials).toBe("include");
        expect(get!.init.headers).toEqual({});
        expect(post!.init.headers).toEqual({ "Content-Type": "application/json" });
        expect(post!.init.body).toBe(JSON.stringify({ name: "Team" }));
    });
});

describe("error messages (M6: show the server's real message)", () => {
    it.each([
        [{ status: 403, body: { message: "Not a member of this board" } }, "Not a member of this board"],
        [{ status: 403, body: { error: "Not a board admin!" } }, "Not a board admin!"], // older { error } shape
        [{ status: 429 }, "Too many requests, please slow down"],
        [{ status: 500 }, "Request failed"],
    ])("%j → %s", async (response, message) => {
        script("GET /api/boards/1", response);
        const err = await api.boards.getOne(1).catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.message).toBe(message);
        expect(err.status).toBe(response.status);
    });
});

describe("expired access token (M6)", () => {
    it("refreshes once and retries the request", async () => {
        script("GET /api/boards/1", { status: 401 }, { status: 200, body: { board: { id: 1 } } });
        script("POST /auth/refresh", { status: 200, body: {} });
        expect((await api.boards.getOne(1)).board.id).toBe(1);
        expect(count("POST /auth/refresh")).toBe(1);
    });

    it("three requests failing at once share ONE refresh (single-flight)", async () => {
        for (const id of [1, 2, 3]) script(`GET /api/boards/${id}`, { status: 401 }, { status: 200, body: { board: { id } } });
        script("POST /auth/refresh", { status: 200, body: {} });
        const boards = await Promise.all([1, 2, 3].map((id) => api.boards.getOne(id)));
        expect(boards.map((b) => b.board.id)).toEqual([1, 2, 3]);
        expect(count("POST /auth/refresh")).toBe(1);
    });

    it("refresh fails → 'Session expired' error and the session-expired event (AuthContext logs out)", async () => {
        script("GET /api/boards/1", { status: 401 });
        script("POST /auth/refresh", { status: 401 });
        const err = await api.boards.getOne(1).catch((e) => e);
        expect(err.message).toBe("Session expired. Please log in again.");
        expect(sessionExpiredEvents).toBe(1);
    });

    it("an error AFTER a successful refresh keeps its real message (it used to say 'Session expired')", async () => {
        script("GET /api/boards/1", { status: 401 }, { status: 403, body: { message: "Not a member of this board" } });
        script("POST /auth/refresh", { status: 200, body: {} });
        const err = await api.boards.getOne(1).catch((e) => e);
        expect(err.message).toBe("Not a member of this board");
        expect(sessionExpiredEvents).toBe(0);
    });

    it("never tries to refresh for /auth/logout", async () => {
        script("POST /auth/logout", { status: 401 });
        await api.auth.logout().catch(() => {});
        expect(count("POST /auth/refresh")).toBe(0);
    });
});
