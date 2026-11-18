import { describe, it, expect, vi } from "vitest";
import { as, createUser, createBoardFixture, prisma } from "./helpers";
import { publishBoardEvent } from "../src/redis";

describe("workspaces: roles", () => {
    it("the creator becomes ADMIN, and sees the workspace in their list", async () => {
        const user = await createUser();
        const ws = (await as(user).post("/api/workspaces", { name: "  Acme  " }).expect(201)).body.workspace;
        expect(ws.name).toBe("Acme"); // trimmed (L4)
        const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_memberId: { workspaceId: ws.id, memberId: user.id } } });
        expect(member?.role).toBe("ADMIN");
        const list = (await as(user).get("/api/workspaces").expect(200)).body.workspaces;
        expect(list.map((w: { id: number }) => w.id)).toContain(ws.id);
    });

    it("an outsider can't read it; an employee can read but not edit or delete", async () => {
        const { workspace, employee, outsider } = await createBoardFixture();
        await as(outsider).get(`/api/workspaces/${workspace.id}`).expect(403);
        await as(employee).get(`/api/workspaces/${workspace.id}`).expect(200);
        await as(employee).patch(`/api/workspaces/${workspace.id}`, { name: "Mine now" }).expect(403);
        await as(employee).delete(`/api/workspaces/${workspace.id}`).expect(403);
    });

    it("a blank name is rejected on create and on edit (L4)", async () => {
        const { workspace, admin } = await createBoardFixture();
        await as(admin).post("/api/workspaces", { name: "   " }).expect(400);
        await as(admin).patch(`/api/workspaces/${workspace.id}`, { name: "" }).expect(400);
    });
});

describe("workspaces: last-admin guard (M12)", () => {
    it("the only admin can't demote or remove themselves", async () => {
        const { workspace, admin } = await createBoardFixture();
        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${admin.id}`, { role: "EMPLOYEE" }).expect(400);
        await as(admin).delete(`/api/workspaces/${workspace.id}/members/${admin.id}`).expect(400);
    });

    it("but setting an employee to EMPLOYEE is fine (it used to be blocked too)", async () => {
        const { workspace, admin, employee } = await createBoardFixture();
        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${employee.id}`, { role: "EMPLOYEE" }).expect(200);
    });

    it("changing or removing someone who isn't a member → 404 (was a 500)", async () => {
        const { workspace, admin, outsider } = await createBoardFixture();
        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${outsider.id}`, { role: "ADMIN" }).expect(404);
        await as(admin).delete(`/api/workspaces/${workspace.id}/members/${outsider.id}`).expect(404);
    });
});

describe("removing a workspace member revokes their board access (C4)", () => {
    it("board access, board memberships and assignments all go, and the board is told", async () => {
        const { workspace, board, admin, employee, cards } = await createBoardFixture();
        await as(employee).post(`/api/cards/${cards[0]!.id}/assign`, { userId: employee.id }).expect(201);
        await as(employee).get(`/api/boards/${board.id}`).expect(200);

        vi.mocked(publishBoardEvent).mockClear();
        await as(admin).delete(`/api/workspaces/${workspace.id}/members/${employee.id}`).expect(200);

        await as(employee).get(`/api/boards/${board.id}`).expect(403);
        await as(employee).post(`/api/lists/${(await prisma.list.findFirst({ where: { boardId: board.id } }))!.id}/cards`, { title: "sneaky" }).expect(403);
        expect(await prisma.boardMember.count({ where: { memberId: employee.id, boardId: board.id } })).toBe(0);
        expect(await prisma.assignedCard.count({ where: { userId: employee.id } })).toBe(0);
        expect(publishBoardEvent).toHaveBeenCalledWith(board.id, admin.id, expect.objectContaining({ type: "member_removed", memberId: employee.id }));
    });
});

describe("workspaces: payloads (L1)", () => {
    it("member users expose only id / name / email, and a workspace lists only the boards you're on", async () => {
        const { workspace, board, admin, employee } = await createBoardFixture();
        const adminOnly = (await as(admin).post(`/api/workspaces/${workspace.id}/boards`, { title: "Admins only" }).expect(201)).body.board;

        const all = (await as(employee).get("/api/workspaces").expect(200)).body.workspaces;
        const mine = all.find((w: { id: number }) => w.id === workspace.id);
        for (const m of mine.members) expect(Object.keys(m.user).sort()).toEqual(["email", "id", "name"]);

        const one = (await as(employee).get(`/api/workspaces/${workspace.id}`).expect(200)).body.workspace;
        for (const m of one.members) expect(Object.keys(m.user).sort()).toEqual(["email", "id", "name"]);
        expect(one.boards.map((b: { id: number }) => b.id)).toEqual([board.id]);          // not adminOnly

        const asAdmin = (await as(admin).get(`/api/workspaces/${workspace.id}`).expect(200)).body.workspace;
        expect(asAdmin.boards.map((b: { id: number }) => b.id).sort()).toEqual([board.id, adminOnly.id].sort());
    });
});


describe("leaving a workspace", () => {
    it("an employee can leave: workspace, boards and assignments go, and the boards are told", async () => {
        const { workspace, board, employee, cards: [a] } = await createBoardFixture();
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: employee.id }).expect(201);

        vi.mocked(publishBoardEvent).mockClear();
        await as(employee).post(`/api/workspaces/${workspace.id}/leave`).expect(200);

        await as(employee).get(`/api/workspaces/${workspace.id}`).expect(403);
        await as(employee).get(`/api/boards/${board.id}`).expect(403);
        expect(await prisma.assignedCard.count({ where: { userId: employee.id } })).toBe(0);
        // senderId 0, so the leaver's own open tabs hear it too
        expect(publishBoardEvent).toHaveBeenCalledWith(board.id, 0, { type: "member_removed", memberId: employee.id });
    });

    it("the last admin can't leave; with a second admin they can", async () => {
        const { workspace, admin, employee } = await createBoardFixture();
        const res = await as(admin).post(`/api/workspaces/${workspace.id}/leave`).expect(400);
        expect(res.body.message).toMatch(/last admin/);

        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${employee.id}`, { role: "ADMIN" }).expect(200);
        await as(admin).post(`/api/workspaces/${workspace.id}/leave`).expect(200);
    });

    it("someone who isn't a member can't 'leave'", async () => {
        const { workspace, outsider } = await createBoardFixture();
        await as(outsider).post(`/api/workspaces/${workspace.id}/leave`).expect(403);
    });
});
