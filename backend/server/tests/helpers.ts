import request from "supertest";
import app from "../src/app";
import prisma from "../../shared/db/client";
import { signAccessToken } from "../../shared/auth/token";

export { app, prisma };

let counter = 0;

/** A user row with a unique email. Google login can't run in tests, so users are created directly. */
export async function createUser(name = "User") {
    counter++;
    const tag = `${name.toLowerCase()}-${Date.now()}-${counter}`;
    return prisma.user.create({ data: { name, email: `${tag}@test.dev`, googleId: tag } });
}

/** Requests made as `user`: the same signed `accessToken` cookie the real login sets. */
export function as(user: { id: number }) {
    const cookie = `accessToken=${signAccessToken(user.id)}`;
    return {
        get: (url: string) => request(app).get(url).set("Cookie", cookie),
        post: (url: string, body?: object) => request(app).post(url).set("Cookie", cookie).send(body),
        patch: (url: string, body?: object) => request(app).patch(url).set("Cookie", cookie).send(body),
        delete: (url: string) => request(app).delete(url).set("Cookie", cookie),
    };
}

/** The only way into a workspace: an admin invites, the person accepts. Returns the invite token. */
export async function joinWorkspace(admin: { id: number }, workspaceId: number, user: { id: number; email: string }, role?: "ADMIN" | "EMPLOYEE") {
    const res = await as(admin).post(`/api/workspaces/${workspaceId}/invites`, { email: user.email, role }).expect(200);
    const token = res.body.inviteUrl.split("/invite/")[1] as string;
    await as(user).post(`/api/invites/${token}/accept`).expect(200);
    return token;
}

/** Requests with no cookie at all. */
export const anon = () => request(app);

/**
 * The usual cast, built through the real API:
 * - admin:    workspace ADMIN, board ADMIN (created both)
 * - employee: workspace EMPLOYEE, board EMPLOYEE
 * - outsider: logged in, but not a member of anything here
 * One list ("Todo") with cards A, B, C in that order.
 */
export async function createBoardFixture() {
    const [admin, employee, outsider] = await Promise.all([createUser("Admin"), createUser("Employee"), createUser("Outsider")]);

    const workspace = (await as(admin).post("/api/workspaces", { name: "Team" }).expect(201)).body.workspace;
    await joinWorkspace(admin, workspace.id, employee);
    const board = (await as(admin).post(`/api/workspaces/${workspace.id}/boards`, { title: "Roadmap" }).expect(201)).body.board;
    await as(admin).post(`/api/boards/${board.id}/members`, { email: employee.email }).expect(201);

    const list = (await as(admin).post(`/api/boards/${board.id}/lists`, { title: "Todo" }).expect(201)).body.list;
    const cards: { id: number; title: string; order: number }[] = [];
    for (const title of ["A", "B", "C"]) {
        cards.push((await as(admin).post(`/api/lists/${list.id}/cards`, { title }).expect(201)).body.card);
    }
    return { admin, employee, outsider, workspace, board, list, cards };
}

/** Card titles of a list, in display order. */
export async function cardTitles(listId: number) {
    const cards = await prisma.card.findMany({ where: { listId }, orderBy: { order: "asc" } });
    return cards.map((c) => c.title);
}
