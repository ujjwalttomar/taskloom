import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { publishBoardEvent } from "../redis";

export const getAllBoards = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const userId = req.userId!;
        const boards = await prisma.board.findMany({
            where: { workspaceId, members: { some: { memberId: userId } } },
        });
        return res.status(200).json({ boards });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const createBoard = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        const userId = req.userId!;
        const { title, description } = req.body;
        if (!title) return res.status(400).json({ message: "Board title is missing" });

        const board = await prisma.board.create({
            data: {
                title,
                description,
                workspaceId,
                members: { create: { memberId: userId, role: "ADMIN" } },
            },
        });
        return res.status(201).json({ message: "Board created", board });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const getSpecificBoard = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const board = await prisma.board.findUnique({
            where: { id: boardId },
            include: {
                lists: {
                    orderBy: { order: "asc" },
                    include: { cards: { orderBy: { order: "asc" } } },
                },
                members: { include: { user: true } },
            },
        });
        if (!board) return res.status(404).json({ message: "Board not found" });
        return res.status(200).json({ board });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const editBoard = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const { title, description } = req.body;
        const board = await prisma.board.update({
            where: { id: boardId },
            data: { title, description },
        });
        publishBoardEvent(boardId, req.userId!, { type: "board_edited", board });
        return res.status(200).json({ board });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteBoard = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        await prisma.board.delete({ where: { id: boardId } });
        publishBoardEvent(boardId, req.userId!, { type: "board_deleted", boardId });
        return res.status(200).json({ message: "Board deleted", boardId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const addMember = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const { email, role } = req.body;
        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: "User not found" });

        const board = await prisma.board.findUnique({ where: { id: boardId } });
        const workspaceMembership = await prisma.workspaceMember.findUnique({
            where: {
                workspaceId_memberId: { workspaceId: board!.workspaceId, memberId: user.id },
            },
        });
        if (!workspaceMembership) {
            return res.status(403).json({ message: "User is not a workspace member" });
        }

        const existing = await prisma.boardMember.findUnique({
            where: { boardId_memberId: { boardId, memberId: user.id } },
        });
        if (existing) return res.status(409).json({ message: "Already a board member" });

        const member = await prisma.boardMember.create({
            data: { boardId, memberId: user.id, role: memberRole },
            include: { user: true },
        });
        publishBoardEvent(boardId, req.userId!, { type: "member_added", member });
        return res.status(201).json({ message: "Member added", member });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateBoardMemberRole = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const memberId = parseInt(req.params.memberId as string);
        const { role } = req.body;

        if (role !== "ADMIN" && role !== "EMPLOYEE") {
            return res.status(400).json({ message: "Invalid role" });
        }
        if (role === "EMPLOYEE") {
            const adminCount = await prisma.boardMember.count({ where: { boardId, role: "ADMIN" } });
            if (adminCount <= 1 && memberId === req.userId) {
                return res.status(400).json({ message: "Cannot demote the last admin" });
            }
        }

        const updated = await prisma.boardMember.update({
            where: { boardId_memberId: { boardId, memberId } },
            data: { role },
        });
        publishBoardEvent(boardId, req.userId!, { type: "member_role_updated", member: updated });
        return res.status(200).json({ message: "Role updated", member: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteMember = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const memberId = parseInt(req.params.memberId as string);

        if (memberId === req.userId) {
            const adminCount = await prisma.boardMember.count({ where: { boardId, role: "ADMIN" } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: "Cannot remove the last admin" });
            }
        }

        await prisma.boardMember.delete({ where: { boardId_memberId: { boardId, memberId } } });
        publishBoardEvent(boardId, req.userId!, { type: "member_removed", memberId });
        return res.status(200).json({ message: "Member removed", memberId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
