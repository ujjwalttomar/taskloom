// ──────────────────────────────────────────────────────────────────────────────
// Integration tests for the Taskloom backend
// Uses the REAL database — creates test data, tests, then cleans up.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { signAccessToken } from "../../../shared/auth/token";
import prisma from "../../../shared/db/client";
import app from "../app";

// ── Helpers ──────────────────────────────────────────────────────────────────
function authed(userId: number) {
    const token = signAccessToken(userId);
    return supertest(app)
        .set("Cookie", `accessToken=${token}`) as unknown as ReturnType<typeof supertest>;
}

function authedReq(userId: number) {
    const token = signAccessToken(userId);
    return { token, cookie: `accessToken=${token}` };
}

// ── Test state ───────────────────────────────────────────────────────────────
let user1Id: number;
let user2Id: number;
let workspaceId: number;
let boardId: number;
let listId1: number;
let listId2: number;
let cardId1: number;
let cardId2: number;
let commentId: number;

const user1Email = `test-user1-${Date.now()}@taskloom-test.com`;
const user2Email = `test-user2-${Date.now()}@taskloom-test.com`;

// ── Setup: create two test users directly in DB ──────────────────────────────
beforeAll(async () => {
    const u1 = await prisma.user.create({
        data: { name: "Test User 1", email: user1Email, googleId: `google-test-${Date.now()}-1` },
    });
    const u2 = await prisma.user.create({
        data: { name: "Test User 2", email: user2Email, googleId: `google-test-${Date.now()}-2` },
    });
    user1Id = u1.id;
    user2Id = u2.id;
});

// ── Cleanup: remove all test data ────────────────────────────────────────────
afterAll(async () => {
    // Delete in dependency order
    await prisma.comment.deleteMany({ where: { creator: { email: { in: [user1Email, user2Email] } } } });
    await prisma.assignedCard.deleteMany({ where: { user: { email: { in: [user1Email, user2Email] } } } });
    await prisma.workspaceInvite.deleteMany({ where: { email: { in: [user1Email, user2Email, "invite-test@taskloom-test.com"] } } });
    // Delete workspaces created by user1 (cascades to boards, lists, cards, comments)
    const workspaces = await prisma.workspace.findMany({
        where: { members: { some: { memberId: user1Id } } },
    });
    for (const ws of workspaces) {
        await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [user1Id, user2Id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
    await prisma.$disconnect();
});

// ══════════════════════════════════════════════════════════════════════════════
//  1. HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════════════
describe("Health", () => {
    it("GET /health returns 200", async () => {
        const res = await supertest(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ok");
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  2. AUTHENTICATION
// ══════════════════════════════════════════════════════════════════════════════
describe("Auth", () => {
    it("GET /auth/me without token → 401", async () => {
        const res = await supertest(app).get("/auth/me");
        expect(res.status).toBe(401);
    });

    it("GET /auth/me with valid token → 200 + user", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app).get("/auth/me").set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(user1Id);
        expect(res.body.user.email).toBe(user1Email);
    });

    it("GET /auth/me with invalid token → 401", async () => {
        const res = await supertest(app).get("/auth/me").set("Cookie", "accessToken=garbage-token");
        expect(res.status).toBe(401);
    });

    it("POST /auth/refresh without cookie → 401", async () => {
        const res = await supertest(app).post("/auth/refresh");
        expect(res.status).toBe(401);
        expect(res.body.message).toContain("No refresh token");
    });

    it("POST /auth/refresh with invalid cookie → 401", async () => {
        const res = await supertest(app)
            .post("/auth/refresh")
            .set("Cookie", "refreshToken=invalid-token");
        expect(res.status).toBe(401);
        expect(res.body.message).toContain("Invalid refresh token");
    });

    it("POST /auth/logout clears cookies", async () => {
        const res = await supertest(app).post("/auth/logout");
        expect(res.status).toBe(200);
        expect(res.body.message).toContain("Logged out");
    });

    it("GET /auth/google redirects to Google", async () => {
        const res = await supertest(app).get("/auth/google");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("accounts.google.com");
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  3. WORKSPACES
// ══════════════════════════════════════════════════════════════════════════════
describe("Workspaces", () => {
    it("POST /api/workspaces — create workspace", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post("/api/workspaces")
            .set("Cookie", cookie)
            .send({ name: "Test Workspace", description: "Integration test" });
        expect(res.status).toBe(201);
        expect(res.body.workspace.name).toBe("Test Workspace");
        workspaceId = res.body.workspace.id;
    });

    it("POST /api/workspaces without name → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post("/api/workspaces")
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });

    it("POST /api/workspaces without auth → 401", async () => {
        const res = await supertest(app)
            .post("/api/workspaces")
            .send({ name: "No Auth" });
        expect(res.status).toBe(401);
    });

    it("GET /api/workspaces — list my workspaces", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app).get("/api/workspaces").set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.workspaces.length).toBeGreaterThanOrEqual(1);
        expect(res.body.workspaces.some((w: any) => w.id === workspaceId)).toBe(true);
    });

    it("GET /api/workspaces/:id — get specific workspace", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app).get(`/api/workspaces/${workspaceId}`).set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.workspace.id).toBe(workspaceId);
        expect(res.body.workspace.members).toBeDefined();
    });

    it("GET /api/workspaces/:id — non-member gets 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app).get(`/api/workspaces/${workspaceId}`).set("Cookie", cookie);
        expect(res.status).toBe(403);
    });

    it("PATCH /api/workspaces/:id — edit workspace", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/workspaces/${workspaceId}`)
            .set("Cookie", cookie)
            .send({ name: "Renamed Workspace" });
        expect(res.status).toBe(200);
        expect(res.body.workspace.name).toBe("Renamed Workspace");
    });

    it("POST /api/workspaces/:id/members — add user2 as EMPLOYEE", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/members`)
            .set("Cookie", cookie)
            .send({ email: user2Email, role: "EMPLOYEE" });
        expect(res.status).toBe(201);
    });

    it("POST /api/workspaces/:id/members — duplicate → 409", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/members`)
            .set("Cookie", cookie)
            .send({ email: user2Email, role: "EMPLOYEE" });
        expect(res.status).toBe(409);
    });

    it("PATCH /api/workspaces/:id/members/:mid — update role", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/workspaces/${workspaceId}/members/${user2Id}`)
            .set("Cookie", cookie)
            .send({ role: "ADMIN" });
        expect(res.status).toBe(200);
        expect(res.body.member.role).toBe("ADMIN");
    });

    it("PATCH /api/workspaces/:id/members/:mid — demote back to EMPLOYEE", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/workspaces/${workspaceId}/members/${user2Id}`)
            .set("Cookie", cookie)
            .send({ role: "EMPLOYEE" });
        expect(res.status).toBe(200);
        expect(res.body.member.role).toBe("EMPLOYEE");
    });

    it("PATCH — cannot demote last admin (self)", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/workspaces/${workspaceId}/members/${user1Id}`)
            .set("Cookie", cookie)
            .send({ role: "EMPLOYEE" });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain("last admin");
    });

    it("PATCH — employee cannot edit workspace → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .patch(`/api/workspaces/${workspaceId}`)
            .set("Cookie", cookie)
            .send({ name: "Hacked" });
        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  4. BOARDS
// ══════════════════════════════════════════════════════════════════════════════
describe("Boards", () => {
    it("POST /api/workspaces/:wsId/boards — create board", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/boards`)
            .set("Cookie", cookie)
            .send({ title: "Test Board", description: "Board for testing" });
        expect(res.status).toBe(201);
        expect(res.body.board.title).toBe("Test Board");
        boardId = res.body.board.id;
    });

    it("POST /api/workspaces/:wsId/boards — employee cannot create → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/boards`)
            .set("Cookie", cookie)
            .send({ title: "Unauthorized Board" });
        expect(res.status).toBe(403);
    });

    it("POST /api/workspaces/:wsId/boards — no title → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/boards`)
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });

    it("GET /api/workspaces/:wsId/boards — list boards", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/workspaces/${workspaceId}/boards`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.boards.some((b: any) => b.id === boardId)).toBe(true);
    });

    it("GET /api/boards/:boardId — get specific board with lists+members", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/boards/${boardId}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.board.id).toBe(boardId);
        expect(res.body.board.lists).toBeDefined();
        expect(res.body.board.members).toBeDefined();
    });

    it("GET /api/boards/:boardId — non-member gets 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .get(`/api/boards/${boardId}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(403);
    });

    it("POST /api/boards/:boardId/members — add user2 to board", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/boards/${boardId}/members`)
            .set("Cookie", cookie)
            .send({ email: user2Email, role: "EMPLOYEE" });
        expect(res.status).toBe(201);
        expect(res.body.member).toBeDefined();
    });

    it("POST /api/boards/:boardId/members — duplicate → 409", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/boards/${boardId}/members`)
            .set("Cookie", cookie)
            .send({ email: user2Email, role: "EMPLOYEE" });
        expect(res.status).toBe(409);
    });

    it("PATCH /api/boards/:boardId — edit board title", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/boards/${boardId}`)
            .set("Cookie", cookie)
            .send({ title: "Renamed Board" });
        expect(res.status).toBe(200);
        expect(res.body.board.title).toBe("Renamed Board");
    });

    it("PATCH /api/boards/:boardId — employee cannot edit → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .patch(`/api/boards/${boardId}`)
            .set("Cookie", cookie)
            .send({ title: "Hacked Board" });
        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  5. LISTS
// ══════════════════════════════════════════════════════════════════════════════
describe("Lists", () => {
    it("POST /api/boards/:boardId/lists — create list 1", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/boards/${boardId}/lists`)
            .set("Cookie", cookie)
            .send({ title: "To Do" });
        expect(res.status).toBe(201);
        expect(res.body.list.title).toBe("To Do");
        expect(res.body.list.order).toBe(1);
        listId1 = res.body.list.id;
    });

    it("POST /api/boards/:boardId/lists — create list 2 (order auto-increments)", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/boards/${boardId}/lists`)
            .set("Cookie", cookie)
            .send({ title: "In Progress" });
        expect(res.status).toBe(201);
        expect(res.body.list.order).toBe(2);
        listId2 = res.body.list.id;
    });

    it("POST /api/boards/:boardId/lists — no title → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/boards/${boardId}/lists`)
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });

    it("GET /api/boards/:boardId/lists — lists returned in order", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/boards/${boardId}/lists`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.lists.length).toBe(2);
        expect(res.body.lists[0].order).toBeLessThan(res.body.lists[1].order);
    });

    it("PATCH /api/boards/:boardId/lists/:listId — rename list", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/boards/${boardId}/lists/${listId1}`)
            .set("Cookie", cookie)
            .send({ title: "Done" });
        expect(res.status).toBe(200);
        expect(res.body.list.title).toBe("Done");
    });

    it("PATCH /api/boards/:boardId/lists/:listId/order — reorder list (move to end)", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/boards/${boardId}/lists/${listId1}/order`)
            .set("Cookie", cookie)
            .send({ afterListId: listId2 });
        expect(res.status).toBe(200);
        expect(res.body.list.order).toBeGreaterThan(2);
    });

    it("PATCH /api/boards/:boardId/lists/:listId/order — no params → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/boards/${boardId}/lists/${listId1}/order`)
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  6. CARDS
// ══════════════════════════════════════════════════════════════════════════════
describe("Cards", () => {
    it("POST /api/lists/:listId/cards — create card 1", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/lists/${listId1}/cards`)
            .set("Cookie", cookie)
            .send({ title: "Test Card 1", description: "First card" });
        expect(res.status).toBe(201);
        expect(res.body.card.title).toBe("Test Card 1");
        cardId1 = res.body.card.id;
    });

    it("POST /api/lists/:listId/cards — create card 2", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/lists/${listId1}/cards`)
            .set("Cookie", cookie)
            .send({ title: "Test Card 2" });
        expect(res.status).toBe(201);
        expect(res.body.card.order).toBeGreaterThan(1);
        cardId2 = res.body.card.id;
    });

    it("POST /api/lists/:listId/cards — no title → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/lists/${listId1}/cards`)
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });

    it("GET /api/lists/:listId/cards — list cards", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/lists/${listId1}/cards`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.cards.length).toBeGreaterThanOrEqual(2);
    });

    it("GET /api/cards/:cardId — get specific card with comments/assignees", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/cards/${cardId1}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.card.id).toBe(cardId1);
        expect(res.body.card.comments).toBeDefined();
        expect(res.body.card.assignedTo).toBeDefined();
        expect(res.body.card.list).toBeDefined();
    });

    it("PATCH /api/cards/:cardId — edit card", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/cards/${cardId1}`)
            .set("Cookie", cookie)
            .send({ title: "Updated Card", description: "New description" });
        expect(res.status).toBe(200);
        expect(res.body.card.title).toBe("Updated Card");
    });

    it("PATCH /api/cards/:cardId/move — move card to list2", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/cards/${cardId1}/move`)
            .set("Cookie", cookie)
            .send({ targetListId: listId2 });
        expect(res.status).toBe(200);
        expect(res.body.card.listId).toBe(listId2);
    });

    it("POST /api/cards/:cardId/assignees — self-assign (employee)", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/assignees`)
            .set("Cookie", cookie)
            .send({ userId: user2Id });
        expect(res.status).toBe(201);
    });

    it("POST /api/cards/:cardId/assignees — duplicate → 409", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/assignees`)
            .set("Cookie", cookie)
            .send({ userId: user2Id });
        expect(res.status).toBe(409);
    });

    it("POST /api/cards/:cardId/assignees — employee cannot assign others → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/assignees`)
            .set("Cookie", cookie)
            .send({ userId: user1Id });
        expect(res.status).toBe(403);
    });

    it("POST /api/cards/:cardId/assignees — admin can assign others", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/assignees`)
            .set("Cookie", cookie)
            .send({ userId: user1Id });
        expect(res.status).toBe(201);
    });

    it("DELETE /api/cards/:cardId/assignees/:userId — unassign", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .delete(`/api/cards/${cardId1}/assignees/${user2Id}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  7. COMMENTS
// ══════════════════════════════════════════════════════════════════════════════
describe("Comments", () => {
    it("POST /api/cards/:cardId/comments — create comment", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/comments`)
            .set("Cookie", cookie)
            .send({ text: "This is a test comment" });
        expect(res.status).toBe(201);
        expect(res.body.comment.text).toBe("This is a test comment");
        expect(res.body.comment.creator).toBeDefined();
        commentId = res.body.comment.id;
    });

    it("POST /api/cards/:cardId/comments — no text → 400", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/cards/${cardId1}/comments`)
            .set("Cookie", cookie)
            .send({});
        expect(res.status).toBe(400);
    });

    it("GET /api/cards/:cardId/comments — list comments", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/cards/${cardId1}/comments`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
        expect(res.body.comments.length).toBeGreaterThanOrEqual(1);
    });

    it("PATCH /api/comments/:commentId — edit own comment", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .patch(`/api/comments/${commentId}`)
            .set("Cookie", cookie)
            .send({ text: "Updated comment" });
        expect(res.status).toBe(200);
        expect(res.body.comment.text).toBe("Updated comment");
    });

    it("PATCH /api/comments/:commentId — other user cannot edit → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .patch(`/api/comments/${commentId}`)
            .set("Cookie", cookie)
            .send({ text: "Hacked comment" });
        expect(res.status).toBe(403);
    });

    it("DELETE /api/comments/:commentId — other non-admin cannot delete → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .delete(`/api/comments/${commentId}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(403);
    });

    it("DELETE /api/comments/:commentId — creator can delete", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .delete(`/api/comments/${commentId}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  8. INVITES
// ══════════════════════════════════════════════════════════════════════════════
describe("Invites", () => {
    let inviteToken: string;
    const inviteEmail = "invite-test@taskloom-test.com";

    it("POST /api/workspaces/:wsId/invites — send invite (admin)", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/invites`)
            .set("Cookie", cookie)
            .send({ email: inviteEmail, role: "EMPLOYEE" });
        expect(res.status).toBe(200);
        expect(res.body.message).toContain("Invite sent");

        // Fetch the invite token from the DB for subsequent tests
        const invite = await prisma.workspaceInvite.findFirst({
            where: { workspaceId, email: inviteEmail, accepted: false },
        });
        expect(invite).not.toBeNull();
        inviteToken = invite!.token;
    });

    it("POST /api/workspaces/:wsId/invites — employee cannot invite → 403", async () => {
        const { cookie } = authedReq(user2Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/invites`)
            .set("Cookie", cookie)
            .send({ email: "someone@test.com" });
        expect(res.status).toBe(403);
    });

    it("POST /api/workspaces/:wsId/invites — already a member → 409", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/workspaces/${workspaceId}/invites`)
            .set("Cookie", cookie)
            .send({ email: user2Email });
        expect(res.status).toBe(409);
    });

    it("GET /api/invites/:token — get invite details (public)", async () => {
        const res = await supertest(app).get(`/api/invites/${inviteToken}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(inviteEmail);
        expect(res.body.workspace).toBeDefined();
    });

    it("GET /api/invites/:token — invalid token → 404", async () => {
        const res = await supertest(app).get("/api/invites/nonexistent-token");
        expect(res.status).toBe(404);
    });

    it("POST /api/invites/:token/accept — wrong email → 403", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .post(`/api/invites/${inviteToken}/accept`)
            .set("Cookie", cookie);
        expect(res.status).toBe(403);
        expect(res.body.message).toContain("sent to");
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  9. DELETION CASCADE & CLEANUP
// ══════════════════════════════════════════════════════════════════════════════
describe("Deletions", () => {
    it("DELETE /api/cards/:cardId — delete card", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .delete(`/api/cards/${cardId2}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
    });

    it("GET /api/cards/:cardId — deleted card → 404", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .get(`/api/cards/${cardId2}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(404);
    });

    it("DELETE /api/boards/:boardId/lists/:listId — delete list", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .delete(`/api/boards/${boardId}/lists/${listId2}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
    });

    it("DELETE /api/boards/:boardId — delete board", async () => {
        const { cookie } = authedReq(user1Id);
        const res = await supertest(app)
            .delete(`/api/boards/${boardId}`)
            .set("Cookie", cookie);
        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  10. 404 CATCH-ALL
// ══════════════════════════════════════════════════════════════════════════════
describe("404", () => {
    it("GET /nonexistent → 404 JSON", async () => {
        const res = await supertest(app).get("/nonexistent-route");
        expect(res.status).toBe(404);
        expect(res.body.status).toBe("error");
    });
});
