
import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";

export const getAllWorkspaces = asyncHandler(async (req, res) => {
    const userId = req.userId!;

    const workspaces = await prisma.workspace.findMany({
        where: { members: { some: { memberId: userId } } }
    });

    return res.status(200).json({ workspaces });
});


export const getSpecificWorkspace = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { boards: true, members: { include: { user: true } } }
    });

    if (!workspace) throw new AppError(404, "Workspace not found");

    return res.status(200).json({ workspace });
});


export const createWorkspace = asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const userId = req.userId!;

    if (!name) throw new AppError(400, "Workspace name is required");

    const workspace = await prisma.workspace.create({
        data: {
            name,
            description,
            members: { create: { memberId: userId, role: "ADMIN" } },
        },
    });

    return res.status(201).json({ message: "Workspace created", workspace });
});


export const editWorkspace = asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const workspaceId = parseInt(req.params.workspaceId as string);

    const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name, description },
    });

    return res.status(200).json({ workspace });
});


export const deleteWorkspace = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);

    await prisma.workspace.delete({ where: { id: workspaceId } });

    return res.status(200).json({ message: "Workspace deleted" });
});


export const addMembers = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);
    const { email, role } = req.body;
    const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(404, "User not found");

    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId: user.id } }
    });
    if (existing) throw new AppError(409, "Already a member");

    const member = await prisma.workspaceMember.create({
        data: { workspaceId, memberId: user.id, role: memberRole }
    });

    return res.status(201).json({ message: "Member added", member });
});


export const updateMemberRole = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);
    const memberId = parseInt(req.params.memberId as string);
    const { role } = req.body;

    if (role !== "ADMIN" && role !== "EMPLOYEE") throw new AppError(400, "Invalid role");

    if (role === "EMPLOYEE") {
        const adminCount = await prisma.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
        if (adminCount <= 1 && memberId === req.userId) {
            throw new AppError(400, "Cannot demote the last admin");
        }
    }

    const updated = await prisma.workspaceMember.update({
        where: { workspaceId_memberId: { workspaceId, memberId } },
        data: { role },
    });

    return res.status(200).json({ message: "Role updated", member: updated });
});


export const deleteMember = asyncHandler(async (req, res) => {
    const memberId = parseInt(req.params.memberId as string);
    const workspaceId = parseInt(req.params.workspaceId as string);

    if (memberId === req.userId) {
        const adminCount = await prisma.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
        if (adminCount <= 1) throw new AppError(400, "Cannot remove the last admin");
    }

    await prisma.workspaceMember.delete({
        where: { workspaceId_memberId: { workspaceId, memberId } }
    });

    return res.status(200).json({ message: "Member removed" });
});
