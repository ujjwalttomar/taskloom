import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../../../shared/db/client";
import { sendEmail } from "../utils/sendEmail";

// POST /api/workspaces/:workspaceId/invites
export const sendInvite = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const { email, role } = req.body;

        if (!email) return res.status(400).json({ message: "Email is required" });

        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
        });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });

        // check if already a member
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            const alreadyMember = await prisma.workspaceMember.findUnique({
                where: { workspaceId_memberId: { workspaceId, memberId: existingUser.id } },
            });
            if (alreadyMember) {
                return res.status(409).json({ message: "User is already a member" });
            }
        }

        // delete any existing pending invite for this email+workspace
        await prisma.workspaceInvite.deleteMany({
            where: { workspaceId, email, accepted: false },
        });

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

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
    } catch (error) {
        return res.status(500).json({ message: "Server error", error });
    }
};

// GET /api/invites/:token  — public, used by the frontend invite page
export const getInviteDetails = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        const invite = await prisma.workspaceInvite.findUnique({
            where: { token },
            include: { workspace: { select: { name: true, description: true } } },
        });

        if (!invite) return res.status(404).json({ message: "Invite not found" });
        if (invite.accepted) return res.status(410).json({ message: "Invite already used" });
        if (invite.expiresAt < new Date()) return res.status(410).json({ message: "Invite has expired" });

        return res.status(200).json({
            workspace: invite.workspace,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

// POST /api/invites/:token/accept — authenticated
export const acceptInvite = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const userId = req.userId!;

        const invite = await prisma.workspaceInvite.findUnique({ where: { token } });

        if (!invite) return res.status(404).json({ message: "Invite not found" });
        if (invite.accepted) return res.status(410).json({ message: "Invite already used" });
        if (invite.expiresAt < new Date()) return res.status(410).json({ message: "Invite has expired" });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: "User not found" });

        // email must match the invited email
        if (user.email !== invite.email) {
            return res.status(403).json({
                message: `This invite was sent to ${invite.email}. You're logged in as ${user.email}.`,
            });
        }

        // check not already a member
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
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
