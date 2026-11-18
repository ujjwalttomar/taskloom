import { describe, it, expect } from "vitest";
import { as, createBoardFixture, prisma } from "./helpers";

/** An attacker with their own workspace + board, so they pass the board-admin checks there. */
async function attackerWithOwnBoard(attacker: { id: number }) {
    const ws = (await as(attacker).post("/api/workspaces", { name: "Evil Corp" }).expect(201)).body.workspace;
    return (await as(attacker).post(`/api/workspaces/${ws.id}/boards`, { title: "Evil board" }).expect(201)).body.board;
}

describe("lists can only be changed through their own board (C3)", () => {
    it("rename / reorder / delete of another board's list through your own board → 404, list untouched", async () => {
        const { list, outsider } = await createBoardFixture();
        const evil = await attackerWithOwnBoard(outsider);

        await as(outsider).patch(`/api/boards/${evil.id}/lists/${list.id}`, { title: "pwned" }).expect(404);
        // A valid body (a neighbour on the attacker's own board), so the request gets past validation
        const evilList = (await as(outsider).post(`/api/boards/${evil.id}/lists`, { title: "mine" }).expect(201)).body.list;
        await as(outsider).patch(`/api/boards/${evil.id}/lists/${list.id}/order`, { afterListId: evilList.id }).expect(404);
        await as(outsider).delete(`/api/boards/${evil.id}/lists/${list.id}`).expect(404);

        const after = await prisma.list.findUnique({ where: { id: list.id } });
        expect(after?.title).toBe("Todo");
    });

    it("a neighbour list from another board → 400", async () => {
        const { board, list, admin, outsider } = await createBoardFixture();
        const evil = await attackerWithOwnBoard(outsider);
        const foreign = (await as(outsider).post(`/api/boards/${evil.id}/lists`, { title: "x" }).expect(201)).body.list;
        await as(admin).patch(`/api/boards/${board.id}/lists/${list.id}/order`, { afterListId: foreign.id }).expect(400);
    });
});

describe("lists: roles and ordering", () => {
    it("members can rename a list, only board admins can delete it", async () => {
        const { board, list, admin, employee } = await createBoardFixture();
        await as(employee).patch(`/api/boards/${board.id}/lists/${list.id}`, { title: "Doing" }).expect(200);
        await as(employee).delete(`/api/boards/${board.id}/lists/${list.id}`).expect(403);
        await as(admin).delete(`/api/boards/${board.id}/lists/${list.id}`).expect(200);
        expect(await prisma.card.count({ where: { listId: list.id } })).toBe(0); // cards go with it
    });

    it("new lists go at the end, and reorder moves one before another", async () => {
        const { board, list: todo, admin } = await createBoardFixture();
        const done = (await as(admin).post(`/api/boards/${board.id}/lists`, { title: "Done" }).expect(201)).body.list;
        expect(done.order).toBeGreaterThan(todo.order);

        await as(admin).patch(`/api/boards/${board.id}/lists/${done.id}/order`, { beforeListId: todo.id }).expect(200);
        const titles = (await prisma.list.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } })).map((l) => l.title);
        expect(titles).toEqual(["Done", "Todo"]);
    });
});
