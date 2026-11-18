import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { as, anon, createBoardFixture } from "./helpers";

// The limiters skip every request while NODE_ENV === "test" (so the other test files can
// fire hundreds of requests). This file turns them back on. Each test file gets fresh
// modules, so the counters here start at zero and never leak into other files.
//
// Order matters: the tests share one IP (127.0.0.1), and the invites below also count
// toward the general /api limit, which is exhausted last.

let fixture: Awaited<ReturnType<typeof createBoardFixture>>;
let apiRequestsSoFar = 0;

beforeAll(async () => {
    fixture = await createBoardFixture(); // built while limits are still off, so it doesn't count
    process.env.NODE_ENV = "development";
});
afterAll(() => {
    process.env.NODE_ENV = "test";
});

describe("rate limiting", () => {
    it("invites: 20 per hour, then 429 with Retry-After", async () => {
        const { admin, workspace } = fixture;
        const send = (i: number) => as(admin).post(`/api/workspaces/${workspace.id}/invites`, { email: `rl-${Date.now()}-${i}@test.dev` });
        for (let i = 0; i < 20; i++) await send(i).expect(200);
        const res = await send(20).expect(429);
        apiRequestsSoFar += 21;
        expect(res.body.message).toMatch(/Too many invites/);
        expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("login: 30 starts per 15 minutes, then 429, and /auth/me is not affected", async () => {
        for (let i = 0; i < 30; i++) await anon().get("/auth/google").expect(302);
        await anon().get("/auth/google").expect(429);
        await as(fixture.admin).get("/auth/me").expect(200);
    });

    it("everything under /api: 300 per 15 minutes; the 429 keeps CORS headers; /health is never limited", async () => {
        const { admin } = fixture;
        for (let i = apiRequestsSoFar; i < 300; i++) await as(admin).get("/api/workspaces").expect(200);
        const res = await as(admin).get("/api/workspaces").set("Origin", "http://localhost:5173").expect(429);
        expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173"); // so the browser can read the message
        expect(res.body.message).toMatch(/Too many requests/);
        await anon().get("/health").expect(200);
    });
});
