import prisma from "../../../shared/db/client";
import { publicUser } from "./select";

export const findAllBoardsForUser = (workspaceId: number, userId: number, allBoards = false) =>
    prisma.board.findMany({
        where: allBoards ? { workspaceId } : { workspaceId, members: { some: { memberId: userId } } },
        include: { members: { include: { user: publicUser } } }, // dashboard shows member avatars
    });

export const findBoardById = (boardId: number) =>
    prisma.board.findUnique({
        where: { id: boardId },
        include: {
            lists: {
                orderBy: { order: "asc" },
                include: {
                    cards: {
                        orderBy: { order: "asc" },
                        include: { assignedTo: { include: { user: publicUser } } }, // assignee avatars on cards
                    },
                },
            },
            members: { include: { user: publicUser } },
        },
    });

export const findBoardRaw = (boardId: number) =>
    prisma.board.findUnique({ where: { id: boardId } });

export const createBoard = (data: { title: string; description?: string; workspaceId: number; userId: number }) =>
    prisma.board.create({
        data: {
            title: data.title,
            description: data.description,
            workspaceId: data.workspaceId,
            members: { create: { memberId: data.userId, role: "ADMIN" } },
        },
        include: { members: { include: { user: publicUser } } },
    });

export const updateBoard = (boardId: number, data: { title?: string; description?: string }) =>
    prisma.board.update({ where: { id: boardId }, data });

export const deleteBoard = (boardId: number) =>
    prisma.board.delete({ where: { id: boardId } });

export const findBoardMember = (boardId: number, memberId: number) =>
    prisma.boardMember.findUnique({
        where: { boardId_memberId: { boardId, memberId } },
    });

export const createBoardMember = (boardId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") =>
    prisma.boardMember.create({
        data: { boardId, memberId, role },
        include: { user: publicUser },
    });

export const updateBoardMemberRole = (boardId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") =>
    prisma.boardMember.update({
        where: { boardId_memberId: { boardId, memberId } },
        data: { role },
    });

export const deleteBoardMember = (boardId: number, memberId: number) =>
    prisma.boardMember.delete({
        where: { boardId_memberId: { boardId, memberId } },
    });

export const countBoardAdmins = (boardId: number) =>
    prisma.boardMember.count({ where: { boardId, role: "ADMIN" } });

export const findWorkspaceMember = (workspaceId: number, memberId: number) =>
    prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId } },
    });
