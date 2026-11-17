import crypto from "crypto";
import * as repo from "../repositories/invite.repository";
import * as userRepo from "../repositories/user.repository";
import { sendEmail } from "../utils/sendEmail";
import { AppError } from "../utils/AppError";
import { escapeHtml } from "../utils/escapeHtml";

export async function sendInvite(workspaceId: number, email: string, role: "ADMIN" | "EMPLOYEE") {
    const workspace = await repo.findWorkspace(workspaceId);
    if (!workspace) throw new AppError(404, "Workspace not found");

    // If user already exists on Taskloom, add them directly — no invite needed
    const existingUser = await userRepo.findUserByEmail(email);
    if (existingUser) {
        const alreadyMember = await repo.findWorkspaceMember(workspaceId, existingUser.id);
        if (alreadyMember) throw new AppError(409, "User is already a member");
        await repo.createWorkspaceMember(workspaceId, existingUser.id, role);
        return { direct: true as const };
    }

    // User not on Taskloom — create an invite link
    await repo.deletePendingInvites(workspaceId, email);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await repo.createInvite({ token, workspaceId, email, role, expiresAt });

    const inviteUrl = `${process.env.FRONTEND_URL}/invite/${token}`;
    const html = buildInviteEmail(workspace.name, role, inviteUrl);
    // Subject is plain text, but strip line breaks so a name can't inject extra lines
    const subject = `Invite to join ${workspace.name.replace(/[\r\n]+/g, " ")} on Taskloom`;

    // Fire-and-forget — never block the response on email delivery
    sendEmail(email, subject, html)
        .then(() => console.log(`Email sent successfully to ${email}`))
        .catch((err) => console.error("Email send failed:", JSON.stringify(err?.message || err)));

    return { direct: false as const, inviteUrl };
}

export async function getInviteDetails(token: string) {
    const invite = await repo.findInviteByTokenWithWorkspace(token);
    if (!invite) throw new AppError(404, "Invite not found");
    if (invite.accepted) throw new AppError(410, "Invite already used");
    if (invite.expiresAt < new Date()) throw new AppError(410, "Invite has expired");
    return {
        workspace: invite.workspace,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
    };
}

export async function acceptInvite(token: string, userId: number) {
    const invite = await repo.findInviteByToken(token);
    if (!invite) throw new AppError(404, "Invite not found");
    if (invite.accepted) throw new AppError(410, "Invite already used");
    if (invite.expiresAt < new Date()) throw new AppError(410, "Invite has expired");

    const fullUser = await userRepo.findUserByIdFull(userId);
    if (!fullUser) throw new AppError(404, "User not found");

    if (fullUser.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new AppError(403, `This invite was sent to ${invite.email}. You're logged in as ${fullUser.email}.`);
    }

    // Check if already a member
    const existing = await repo.findWorkspaceMember(invite.workspaceId, userId);
    if (existing) {
        await repo.markInviteAccepted(token);
        return { workspaceId: invite.workspaceId, alreadyMember: true as const };
    }

    await repo.acceptInviteTransaction(invite.workspaceId, userId, invite.role, token);
    return { workspaceId: invite.workspaceId, alreadyMember: false as const };
}

/**
 * Invite email HTML. The workspace name is chosen by any workspace admin, so it is
 * escaped — otherwise a name like `<a href="https://evil">Reset password</a>` would be
 * rendered as a real link in an email sent from Taskloom's address.
 */
export function buildInviteEmail(workspaceName: string, role: string, inviteUrl: string): string {
    const name = escapeHtml(workspaceName);
    return `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #6366f1;">You're invited to join ${name}</h2>
            <p>You've been invited as <strong>${escapeHtml(role.toLowerCase())}</strong>.</p>
            <p>Click the button below to accept. This link expires in 48 hours.</p>
            <a href="${escapeHtml(inviteUrl)}"
               style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
               Accept Invite
            </a>
            <p style="color:#888;font-size:12px;">If you weren't expecting this, ignore this email.</p>
        </div>
    `;
}
