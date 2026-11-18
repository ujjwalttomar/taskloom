import { describe, it, expect } from "vitest";
import { anon, as, createUser } from "./helpers";
import { signWsTicket, verifyWsTicket } from "../../shared/auth/token";

// The behaviour every endpoint shares: JSON errors, bad ids, authentication.

describe("errors are always JSON (M1)", () => {
    it("GET /health", async () => {
        await anon().get("/health").expect(200, { status: "ok" });
    });

    it("unknown route → JSON 404, not an HTML page", async () => {
        const res = await anon().get("/api/does-not-exist").expect(404);
        expect(res.headers["content-type"]).toMatch(/json/);
        expect(res.body.message).toBe("Cannot GET /api/does-not-exist");
    });

    it("non-numeric id → 400 with a message", async () => {
        const user = await createUser();
        const res = await as(user).get("/api/boards/abc").expect(400);
        expect(res.body).toEqual({ message: "Invalid board id" });
    });

    it("malformed JSON body → 400", async () => {
        const user = await createUser();
        const res = await as(user).post("/api/workspaces").set("Content-Type", "application/json").send("{ not json").expect(400);
        expect(res.body.message).toBeDefined();
    });
});

describe("authentication", () => {
    it("no cookie → 401", async () => {
        await anon().get("/api/workspaces").expect(401);
    });

    it("garbage token → 401", async () => {
        await anon().get("/api/workspaces").set("Cookie", "accessToken=not-a-jwt").expect(401);
    });

    it("a WS ticket used as the access cookie → 401", async () => {
        const user = await createUser();
        await anon().get("/api/workspaces").set("Cookie", `accessToken=${signWsTicket(user.id)}`).expect(401);
    });

    it("/auth/me returns the logged-in user", async () => {
        const user = await createUser("Me");
        const res = await as(user).get("/auth/me").expect(200);
        expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
    });

    it("/auth/ws-ticket needs login, and returns a ticket for the caller (H2)", async () => {
        await anon().get("/auth/ws-ticket").expect(401);
        const user = await createUser();
        const res = await as(user).get("/auth/ws-ticket").expect(200);
        expect(verifyWsTicket(res.body.ticket).userId).toBe(user.id);
    });
});
