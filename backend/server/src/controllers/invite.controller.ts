
import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { sendEmail } from "../utils/sendEmail";

// POST /api/workspaces/:workspaceId/invites
export const sendInvite = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);
    const { email, role } = req.body;

    if (!email) throw new AppError(400, "Email is required");

    const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new AppError(404, "Workspace not found");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        const alreadyMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_memberId: { workspaceId, memberId: existingUser.id } },
        });
        if (alreadyMember) throw new AppError(409, "User is already a member");
    }

    await prisma.workspaceInvite.deleteMany({ where: { workspaceId, email, accepted: false } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.workspaceInvite.create({
        data: { token, workspaceId, email, role: memberRole, expiresAt },
    });

    const inviteUrl = `${process.env.FRONTEND_URL}/invite/${token}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #6366f1;">You're invited to join ${workspace.name}</h2>
            <p>You've been invited as <strong>${memberRole.toLowerCase()}</strong>.</p>
            <p>Click the button below to accept. This link expires in 48 hours.</p>
            <a href="${inviteUrl}"
               style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
               Accept Invite
            </a>
            <p style="color:#888;font-size:12px;">If you weren't expecting this, ignore this email.</p>
        </div>
    `;

    await sendEmail(email, `Invite to join ${workspace.name} on Taskloom`, html);

    return res.status(200).json({ message: "Invite sent" });
});


// GET /api/invites/:token
export const getInviteDetails = asyncHandler(async (req, res) => {
    const { token } = req.params;

    const invite = await prisma.workspaceInvite.findUnique({
        where: { token },
        include: { workspace: { select: { name: true, description: true } } },
    });

    if (!invite) throw new AppError(404, "Invite not found");
    if (invite.accepted) throw new AppError(410, "Invite already used");
    if (invite.expiresAt < new Date()) throw new AppError(410, "Invite has expired");

    return res.status(200).json({
        workspace: invite.workspace,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
    });
});


// POST /api/invites/:token/accept
export const acceptInvite = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const userId = req.userId!;

    const invite = await prisma.workspaceInvite.findUnique({ where: { token } });

    if (!invite) throw new AppError(404, "Invite not found");
    if (invite.accepted) throw new AppError(410, "Invite already used");
    if (invite.expiresAt < new Date()) throw new AppError(410, "Invite has expired");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");

    if (user.email !== invite.email) {
        throw new AppError(403, `This invite was sent to ${invite.email}. You're logged in as ${user.email}.`);
    }

    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId: invite.workspaceId, memberId: userId } },
    });
    if (existing) {
        await prisma.workspaceInvite.update({ where: { token }, data: { accepted: true } });
        return res.status(200).json({ message: "Already a member", workspaceId: invite.workspaceId });
    }

    await prisma.$transaction([
        prisma.workspaceMember.create({
            data: { workspaceId: invite.workspaceId, memberId: userId, role: invite.role },
        }),
        prisma.workspaceInvite.update({ where: { token }, data: { accepted: true } }),
    ]);

    return res.status(200).json({ message: "Joined workspace", workspaceId: invite.workspaceId });
});
