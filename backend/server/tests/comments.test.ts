import { describe, it, expect } from "vitest";
import { as, createBoardFixture } from "./helpers";

describe("comments", () => {
    it("members can comment; outsiders can't", async () => {
        const { employee, outsider, cards: [a] } = await createBoardFixture();
        const c = (await as(employee).post(`/api/cards/${a!.id}/comments`, { text: "  hello  " }).expect(201)).body.comment;
        expect(c.text).toBe("hello");
        await as(outsider).post(`/api/cards/${a!.id}/comments`, { text: "hi" }).expect(403);
        await as(outsider).get(`/api/cards/${a!.id}/comments`).expect(403);
    });

    it("only the creator can edit a comment, even an admin can't", async () => {
        const { admin, employee, cards: [a] } = await createBoardFixture();
        const c = (await as(employee).post(`/api/cards/${a!.id}/comments`, { text: "mine" }).expect(201)).body.comment;
        await as(admin).patch(`/api/comments/${c.id}`, { text: "edited by admin" }).expect(403);
        await as(employee).patch(`/api/comments/${c.id}`, { text: "edited" }).expect(200);
    });

    it("the creator or a board admin can delete; another employee can't (M4: admin moderation)", async () => {
        const { admin, employee, cards: [a] } = await createBoardFixture();
        const byAdmin = (await as(admin).post(`/api/cards/${a!.id}/comments`, { text: "admin's" }).expect(201)).body.comment;
        const byEmployee = (await as(employee).post(`/api/cards/${a!.id}/comments`, { text: "employee's" }).expect(201)).body.comment;

        await as(employee).delete(`/api/comments/${byAdmin.id}`).expect(403);
        await as(admin).delete(`/api/comments/${byEmployee.id}`).expect(200);
        await as(admin).delete(`/api/comments/${byEmployee.id}`).expect(404);
    });

    it("blank and over-long comments are rejected (L4)", async () => {
        const { admin, cards: [a] } = await createBoardFixture();
        await as(admin).post(`/api/cards/${a!.id}/comments`, { text: "   " }).expect(400);
        const res = await as(admin).post(`/api/cards/${a!.id}/comments`, { text: "x".repeat(2001) }).expect(400);
        expect(res.body.message).toMatch(/at most 2000/);
    });
});
