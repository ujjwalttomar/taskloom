import { describe, it, expect, vi } from "vitest";
import { as, createUser, createBoardFixture, joinWorkspace, prisma } from "./helpers";
import { publishBoardEvent } from "../src/redis";

// Workspace admins reach every board in their workspace, implicitly (shared/db/access.ts):
// no BoardMember row needed, and it follows their workspace role the moment it changes.

/** The fixture plus "boss": a workspace ADMIN who was never added to the board. */
async function withBoss() {
    const f = await createBoardFixture();
    const boss = await createUser("Boss");
    await joinWorkspace(f.admin, f.workspace.id, boss, "ADMIN");
    return { ...f, boss };
}

describe("workspace admins and boards they never joined", () => {
    it("can open the board as a board ADMIN without being in its member list", async () => {
        const { board, boss } = await withBoss();
        const b = (await as(boss).get(`/api/boards/${board.id}`).expect(200)).body.board;
        expect(b.myRole).toBe("ADMIN");
        expect(b.members.map((m: { memberId: number }) => m.memberId)).not.toContain(boss.id);
    });

    it("can manage it: rename the board, delete a list, open member profiles", async () => {
        const { board, list, boss, employee } = await withBoss();
        await as(boss).patch(`/api/boards/${board.id}`, { title: "Renamed by the boss" }).expect(200);
        await as(boss).get(`/api/boards/${board.id}/members/${employee.id}/profile`).expect(200);
        await as(boss).delete(`/api/boards/${board.id}/lists/${list.id}`).expect(200);
    });

    it("sees every board of the workspace in the lists; an employee only sees their own", async () => {
        const { workspace, board, admin, employee, boss } = await withBoss();
        const secret = (await as(admin).post(`/api/workspaces/${workspace.id}/boards`, { title: "Leadership" }).expect(201)).body.board;
        const ids = (u: { id: number }) => as(u).get(`/api/workspaces/${workspace.id}/boards`).then((r) => r.body.boards.map((b: { id: number }) => b.id).sort());

        expect(await ids(boss)).toEqual([board.id, secret.id].sort());
        expect(await ids(employee)).toEqual([board.id]);
        expect((await as(boss).get(`/api/workspaces/${workspace.id}`).expect(200)).body.workspace.boards).toHaveLength(2);
        await as(employee).get(`/api/boards/${secret.id}`).expect(403);   // employees still need to be added
    });

    it("an admin of ANOTHER workspace gets nothing", async () => {
        const { board } = await withBoss();
        const stranger = await createUser("OtherAdmin");
        await as(stranger).post("/api/workspaces", { name: "Elsewhere" }).expect(201);
        await as(stranger).get(`/api/boards/${board.id}`).expect(403);
    });
});

describe("access follows the workspace role immediately", () => {
    it("a board EMPLOYEE promoted to workspace ADMIN becomes board ADMIN", async () => {
        const { workspace, board, admin, employee } = await createBoardFixture();
        expect((await as(employee).get(`/api/boards/${board.id}`)).body.board.myRole).toBe("EMPLOYEE");
        await as(employee).patch(`/api/boards/${board.id}`, { title: "x" }).expect(403);

        vi.mocked(publishBoardEvent).mockClear();
        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${employee.id}`, { role: "ADMIN" }).expect(200);
        expect((await as(employee).get(`/api/boards/${board.id}`)).body.board.myRole).toBe("ADMIN");
        await as(employee).patch(`/api/boards/${board.id}`, { title: "Promoted" }).expect(200);
        // they're on the board: open pages are told to refetch their role
        expect(publishBoardEvent).toHaveBeenCalledWith(board.id, 0, expect.objectContaining({ type: "member_role_updated" }));
    });

    it("a demoted admin loses boards they never joined, and those boards are told", async () => {
        const { workspace, board, admin, boss } = await withBoss();
        await as(boss).get(`/api/boards/${board.id}`).expect(200);

        vi.mocked(publishBoardEvent).mockClear();
        await as(admin).patch(`/api/workspaces/${workspace.id}/members/${boss.id}`, { role: "EMPLOYEE" }).expect(200);
        await as(boss).get(`/api/boards/${board.id}`).expect(403);
        expect(publishBoardEvent).toHaveBeenCalledWith(board.id, 0, { type: "member_removed", memberId: boss.id });
    });

    it("no BoardMember rows are created for implicit access (nothing to clean up on demotion)", async () => {
        const { board, boss } = await withBoss();
        await as(boss).patch(`/api/boards/${board.id}`, { title: "Touched" }).expect(200);
        expect(await prisma.boardMember.count({ where: { boardId: board.id, memberId: boss.id } })).toBe(0);
    });
});
