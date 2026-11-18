import { describe, it, expect } from "vitest";
import { as, createBoardFixture, cardTitles, prisma } from "./helpers";

// The fixture list holds cards A, B, C (in that order).

describe("moving cards (M3, N3)", () => {
    it("between two neighbours", async () => {
        const { list, admin, cards: [a, b, c] } = await createBoardFixture();
        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: list.id, afterCardId: b!.id, beforeCardId: c!.id }).expect(200);
        expect(await cardTitles(list.id)).toEqual(["B", "A", "C"]);
    });

    it("to the top (only a 'before' neighbour)", async () => {
        const { list, admin, cards: [a, , c] } = await createBoardFixture();
        await as(admin).patch(`/api/cards/${c!.id}/move`, { targetListId: list.id, beforeCardId: a!.id }).expect(200);
        expect(await cardTitles(list.id)).toEqual(["C", "A", "B"]);
    });

    it("after a single neighbour lands BETWEEN it and the next card, not on top of it (N3)", async () => {
        const { list, admin, cards: [a, b, c] } = await createBoardFixture();
        // A after B only: the old code used B.order + 1, which equals C.order (orders are 1, 2, 3)
        const moved = (await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: list.id, afterCardId: b!.id }).expect(200)).body.card;
        expect(moved.order).toBeGreaterThan(b!.order);
        expect(moved.order).toBeLessThan(c!.order);
        expect(await cardTitles(list.id)).toEqual(["B", "A", "C"]);
    });

    it("with no neighbours → appended to the end (was order = 1, colliding with the first card)", async () => {
        const { list, admin, cards: [a] } = await createBoardFixture();
        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: list.id }).expect(200);
        expect(await cardTitles(list.id)).toEqual(["B", "C", "A"]);
    });

    it("to another list on the same board", async () => {
        const { board, list, admin, cards: [a] } = await createBoardFixture();
        const done = (await as(admin).post(`/api/boards/${board.id}/lists`, { title: "Done" }).expect(201)).body.list;
        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: done.id }).expect(200);
        expect(await cardTitles(done.id)).toEqual(["A"]);
        expect(await cardTitles(list.id)).toEqual(["B", "C"]);
    });

    it("rejects a card as its own neighbour, a neighbour from another list, and a list from another board", async () => {
        const { board, list, admin, cards: [a, b] } = await createBoardFixture();
        const other = await createBoardFixture();
        const done = (await as(admin).post(`/api/boards/${board.id}/lists`, { title: "Done" }).expect(201)).body.list;

        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: list.id, afterCardId: a!.id }).expect(400);
        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: done.id, afterCardId: b!.id }).expect(400);
        await as(admin).patch(`/api/cards/${a!.id}/move`, { targetListId: other.list.id }).expect(400);
        expect(await cardTitles(list.id)).toEqual(["A", "B", "C"]); // nothing moved
    });
});

describe("assigning cards (L3)", () => {
    it("employees can assign and unassign only themselves", async () => {
        const { admin, employee, cards: [a] } = await createBoardFixture();
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: admin.id }).expect(403);
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: employee.id }).expect(201);
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: employee.id }).expect(409);

        await as(admin).post(`/api/cards/${a!.id}/assign`, { userId: admin.id }).expect(201);
        await as(employee).delete(`/api/cards/${a!.id}/assign/${admin.id}`).expect(403);
        await as(employee).delete(`/api/cards/${a!.id}/assign/${employee.id}`).expect(200);
    });

    it("admins can unassign anyone; unassigning someone who isn't assigned → 404 (was a 500)", async () => {
        const { admin, employee, cards: [a] } = await createBoardFixture();
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: employee.id }).expect(201);
        await as(admin).delete(`/api/cards/${a!.id}/assign/${employee.id}`).expect(200);
        await as(admin).delete(`/api/cards/${a!.id}/assign/${employee.id}`).expect(404);
    });

    it("only board members can be assigned", async () => {
        const { admin, outsider, cards: [a] } = await createBoardFixture();
        await as(admin).post(`/api/cards/${a!.id}/assign`, { userId: outsider.id }).expect(403);
    });
});

describe("cards: access and validation", () => {
    it("outsiders can't read, edit or delete cards", async () => {
        const { outsider, cards: [a] } = await createBoardFixture();
        await as(outsider).get(`/api/cards/${a!.id}`).expect(403);
        await as(outsider).patch(`/api/cards/${a!.id}`, { title: "x" }).expect(403);
        await as(outsider).delete(`/api/cards/${a!.id}`).expect(403);
    });

    it("titles are trimmed, required and at most 200 characters (L4)", async () => {
        const { list, admin, cards: [a] } = await createBoardFixture();
        await as(admin).post(`/api/lists/${list.id}/cards`, { title: "x".repeat(201) }).expect(400);
        await as(admin).patch(`/api/cards/${a!.id}`, { title: "  " }).expect(400);
        await as(admin).patch(`/api/cards/${a!.id}`, { description: "only the description" }).expect(200);
        expect((await prisma.card.findUnique({ where: { id: a!.id } }))?.title).toBe("A");
    });
});

describe("cards: user data in payloads (L1)", () => {
    it("the card, its creator, comment creators and assignees expose only id / name / email", async () => {
        const { admin, employee, cards: [a] } = await createBoardFixture();
        await as(employee).post(`/api/cards/${a!.id}/assign`, { userId: employee.id }).expect(201);
        const created = (await as(employee).post(`/api/cards/${a!.id}/comments`, { text: "hi" }).expect(201)).body.comment;

        const card = (await as(admin).get(`/api/cards/${a!.id}`).expect(200)).body.card;
        const comments = (await as(admin).get(`/api/cards/${a!.id}/comments`).expect(200)).body.comments;
        const users = [card.creator, card.comments[0].creator, card.assignedTo[0].user, comments[0].creator, created.creator];
        for (const u of users) expect(Object.keys(u).sort()).toEqual(["email", "id", "name"]); // no googleId, no timestamps
    });
});

