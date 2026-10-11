import { Request, Response } from "express";
import prisma from "../../../shared/db/client";

export const getAllWorkspaces = async (req: Request, res: Response) => {
    try {
        const userId = req.userId!;
        const workspaces = await prisma.workspace.findMany({
            where: { members: { some: { memberId: userId } } },
            include: { members: { include: { member: true } } },
        });
        return res.status(200).json({ workspaces });
    } catch (error) {
        console.error("[getAllWorkspaces error]", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const getSpecificWorkspace = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                boards: true,
                members: { include: { member: true } },
            },
        });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });
        return res.status(200).json({ workspace });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const createWorkspace = async (req: Request, res: Response) => {
    try {
        const userId = req.userId!;
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ message: "Workspace name is required" });

        const workspace = await prisma.workspace.create({
            data: {
                name,
                description,
                members: { create: { memberId: userId, role: "ADMIN" } },
            },
        });
        return res.status(201).json({ message: "workspace created", workspace });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const editWorkspace = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const { name, description } = req.body;
        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { name, description },
        });
        return res.status(200).json({ workspace });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteWorkspace = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        await prisma.workspace.delete({ where: { id: workspaceId } });
        return res.status(200).json({ message: "Workspace deleted" });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const addMembers = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const { email, role } = req.body;
        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: "User not found" });

        const existing = await prisma.workspaceMember.findUnique({
            where: { workspaceId_memberId: { workspaceId, memberId: user.id } },
        });
        if (existing) return res.status(409).json({ message: "Already a member" });

        const member = await prisma.workspaceMember.create({
            data: { workspaceId, memberId: user.id, role: memberRole },
        });
        return res.status(201).json({ message: "Member added", member });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateMemberRole = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const memberId = parseInt(req.params.memberId as string);
        const { role } = req.body;

        if (role !== "ADMIN" && role !== "EMPLOYEE") {
            return res.status(400).json({ message: "Invalid role" });
        }

        if (role === "EMPLOYEE") {
            const adminCount = await prisma.workspaceMember.count({
                where: { workspaceId, role: "ADMIN" },
            });
            if (adminCount <= 1) {
                return res.status(400).json({ message: "Cannot demote the last admin" });
            }
        }

        const updated = await prisma.workspaceMember.update({
            where: { workspaceId_memberId: { workspaceId, memberId } },
            data: { role },
        });
        return res.status(200).json({ message: "Role updated", member: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteMember = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const memberId = parseInt(req.params.memberId as string);

        if (memberId === req.userId) {
            const adminCount = await prisma.workspaceMember.count({
                where: { workspaceId, role: "ADMIN" },
            });
            if (adminCount <= 1) {
                return res.status(400).json({ message: "Cannot remove the last admin" });
            }
        }

        await prisma.workspaceMember.delete({
            where: { workspaceId_memberId: { workspaceId, memberId } },
        });
        return res.status(200).json({ message: "Member removed", memberId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
