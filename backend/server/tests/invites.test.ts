import { describe, it, expect } from "vitest";
import { as, anon, createUser, createBoardFixture, prisma } from "./helpers";
import { sendEmail } from "../src/utils/sendEmail";

describe("sending invites (M10)", () => {
    it("an existing user is matched case-insensitively and added directly", async () => {
        const { workspace, admin } = await createBoardFixture();
        const bob = await createUser("Bob");
        await as(admin).post(`/api/workspaces/${workspace.id}/invites`, { email: `  ${bob.email.toUpperCase()} ` }).expect(201);
        await as(admin).post(`/api/workspaces/${workspace.id}/invites`, { email: bob.email }).expect(409); // already a member
    });

    it("a new email gets an invite link, stored lower-cased, and an email is sent", async () => {
        const { workspace, admin } = await createBoardFixture();
        const email = `New.Person-${Date.now()}@Example.COM`;
        const res = await as(admin).post(`/api/workspaces/${workspace.id}/invites`, { email }).expect(200);
        expect(res.body.inviteUrl).toMatch(/^http:\/\/localhost:5173\/invite\/[0-9a-f]{64}$/);
        const invite = await prisma.workspaceInvite.findFirst({ where: { workspaceId: workspace.id } });
        expect(invite?.email).toBe(email.toLowerCase());
        expect(sendEmail).toHaveBeenCalledWith(email.toLowerCase(), expect.stringContaining("Team"), expect.any(String));
    });

    it("only workspace admins can invite; bad emails are rejected", async () => {
        const { workspace, admin, employee } = await createBoardFixture();
        await as(employee).post(`/api/workspaces/${workspace.id}/invites`, { email: "x@test.dev" }).expect(403);
        await as(admin).post(`/api/workspaces/${workspace.id}/invites`, { email: "not-an-email" }).expect(400);
    });
});

describe("accepting invites", () => {
    async function invite(email: string) {
        const f = await createBoardFixture();
        const res = await as(f.admin).post(`/api/workspaces/${f.workspace.id}/invites`, { email }).expect(200);
        return { ...f, token: res.body.inviteUrl.split("/invite/")[1] as string };
    }

    it("details are public (the token is the secret); unknown tokens → 404", async () => {
        const { token } = await invite(`d-${Date.now()}@test.dev`);
        const res = await anon().get(`/api/invites/${token}`).expect(200);
        expect(res.body.workspace.name).toBe("Team");
        await anon().get("/api/invites/doesnotexist").expect(404);
    });

    it("only the invited email can accept, it works once, and the user joins as EMPLOYEE", async () => {
        const email = `carol-${Date.now()}@test.dev`;
        const { token, workspace } = await invite(email);
        const stranger = await createUser("Stranger");
        await as(stranger).post(`/api/invites/${token}/accept`).expect(403);

        const carol = await prisma.user.create({ data: { name: "Carol", email: email.toUpperCase() } }); // stored with different case
        await as(carol).post(`/api/invites/${token}/accept`).expect(200);
        const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_memberId: { workspaceId: workspace.id, memberId: carol.id } } });
        expect(member?.role).toBe("EMPLOYEE");
        await as(carol).post(`/api/invites/${token}/accept`).expect(410); // already used
    });

    it("an expired invite → 410", async () => {
        const email = `late-${Date.now()}@test.dev`;
        const { token } = await invite(email);
        await prisma.workspaceInvite.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });
        await anon().get(`/api/invites/${token}`).expect(410);
    });
});
