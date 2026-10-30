
import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export const getAllBoards = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);
    const userId = req.userId!;

    const boards = await prisma.board.findMany({
        where: {
            workspaceId,
            members: { some: { memberId: userId } }
        }
    });

    return res.status(200).json({ boards });
});


export const createBoard = asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId as string);
    const userId = req.userId!;
    const { title, description } = req.body;

    if (!title) throw new AppError(400, "Board title is required");

    const board = await prisma.board.create({
        data: {
            title,
            description,
            workspaceId,
            members: {
                create: { memberId: userId, role: "ADMIN" }
            }
        }
    });

    return res.status(201).json({ message: "Board created", board });
});


export const getSpecificBoard = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);

    const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
            lists: {
                orderBy: { order: "asc" },
                include: {
                    cards: { orderBy: { order: "asc" } }
                }
            },
            members: { include: { user: true } }
        }
    });

    if (!board) throw new AppError(404, "Board not found");

    return res.status(200).json({ board });
});


export const editBoard = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const { title, description } = req.body;

    const board = await prisma.board.update({
        where: { id: boardId },
        data: { title, description }
    });

    publishBoardEvent(boardId, req.userId!, { type: "board_edited", board });

    return res.status(200).json({ board });
});


export const deleteBoard = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);

    await prisma.board.delete({ where: { id: boardId } });

    publishBoardEvent(boardId, req.userId!, { type: "board_deleted", boardId });

    return res.status(200).json({ message: "Board deleted", boardId });
});


export const addMember = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const { email, role } = req.body;
    const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(404, "User not found");

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw new AppError(404, "Board not found");

    const workspaceMembership = await prisma.workspaceMember.findUnique({
        where: {
            workspaceId_memberId: {
                workspaceId: board.workspaceId,
                memberId: user.id
            }
        }
    });
    if (!workspaceMembership) throw new AppError(403, "User is not a workspace member");

    const existing = await prisma.boardMember.findUnique({
        where: { boardId_memberId: { boardId, memberId: user.id } }
    });
    if (existing) throw new AppError(409, "Already a board member");

    const member = await prisma.boardMember.create({
        data: { boardId, memberId: user.id, role: memberRole },
        include: { user: true },
    });

    publishBoardEvent(boardId, req.userId!, { type: "member_added", member });

    return res.status(201).json({ message: "Member added", member });
});


export const updateBoardMemberRole = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const memberId = parseInt(req.params.memberId as string);
    const { role } = req.body;

    if (role !== "ADMIN" && role !== "EMPLOYEE") throw new AppError(400, "Invalid role");

    if (role === "EMPLOYEE") {
        const adminCount = await prisma.boardMember.count({ where: { boardId, role: "ADMIN" } });
        if (adminCount <= 1 && memberId === req.userId) {
            throw new AppError(400, "Cannot demote the last admin");
        }
    }

    const updated = await prisma.boardMember.update({
        where: { boardId_memberId: { boardId, memberId } },
        data: { role },
    });

    publishBoardEvent(boardId, req.userId!, { type: "member_role_updated", member: updated });

    return res.status(200).json({ message: "Role updated", member: updated });
});


export const deleteMember = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const memberId = parseInt(req.params.memberId as string);

    if (memberId === req.userId) {
        const adminCount = await prisma.boardMember.count({ where: { boardId, role: "ADMIN" } });
        if (adminCount <= 1) throw new AppError(400, "Cannot remove the last admin");
    }

    await prisma.boardMember.delete({
        where: { boardId_memberId: { boardId, memberId } }
    });

    publishBoardEvent(boardId, req.userId!, { type: "member_removed", memberId });

    return res.status(200).json({ message: "Member removed", memberId });
});
