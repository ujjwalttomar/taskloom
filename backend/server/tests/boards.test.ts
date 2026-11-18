import { describe, it, expect } from "vitest";
import { as, createBoardFixture } from "./helpers";

describe("boards: access", () => {
    it("members can open the board; outsiders get 403", async () => {
        const { board, employee, outsider } = await createBoardFixture();
        await as(employee).get(`/api/boards/${board.id}`).expect(200);
        const res = await as(outsider).get(`/api/boards/${board.id}`).expect(403);
        expect(res.body.message).toBeDefined(); // { message }, not { error } (M1)
    });

    it("only board admins can rename or delete the board", async () => {
        const { board, admin, employee } = await createBoardFixture();
        await as(employee).patch(`/api/boards/${board.id}`, { title: "Hijacked" }).expect(403);
        await as(employee).delete(`/api/boards/${board.id}`).expect(403);
        await as(admin).patch(`/api/boards/${board.id}`, { title: "Renamed" }).expect(200);
    });

    it("only workspace members can be added to a board", async () => {
        const { board, admin, outsider } = await createBoardFixture();
        await as(admin).post(`/api/boards/${board.id}/members`, { email: outsider.email }).expect(403);
    });
});

describe("boards: payloads (M9, L1)", () => {
    it("cards come with their assignees, and users expose only id / name / email", async () => {
        const { board, admin, employee, cards } = await createBoardFixture();
        await as(admin).post(`/api/cards/${cards[1]!.id}/assign`, { userId: employee.id }).expect(201);

        const b = (await as(admin).get(`/api/boards/${board.id}`).expect(200)).body.board;
        const cardB = b.lists[0].cards.find((c: { id: number }) => c.id === cards[1]!.id);
        expect(cardB.assignedTo.map((a: { user: { id: number } }) => a.user.id)).toEqual([employee.id]);
        for (const m of b.members) expect(Object.keys(m.user).sort()).toEqual(["email", "id", "name"]);
    });

    it("the workspace's board list includes members (dashboard avatars)", async () => {
        const { workspace, admin } = await createBoardFixture();
        const boards = (await as(admin).get(`/api/workspaces/${workspace.id}/boards`).expect(200)).body.boards;
        expect(boards[0].members.length).toBe(2);
    });
});

describe("boards: validation (L4)", () => {
    it("rejects blank and over-long titles", async () => {
        const { workspace, board, admin } = await createBoardFixture();
        await as(admin).patch(`/api/boards/${board.id}`, { title: "   " }).expect(400);
        const res = await as(admin).post(`/api/workspaces/${workspace.id}/boards`, { title: "x".repeat(121) }).expect(400);
        expect(res.body.message).toMatch(/at most 120/);
    });
});
