import prisma from "../../../shared/db/client";
import { publicUser } from "./select";

export const findAllWorkspacesForUser = (userId: number) =>
    prisma.workspace.findMany({
        where: { members: { some: { memberId: userId } } },
        include: { members: { include: { user: publicUser } } },
    });

/** Only the boards `userId` is a member of: board access is per board, even inside one workspace. */
export const findWorkspaceById = (workspaceId: number, userId: number) =>
    prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
            boards: { where: { members: { some: { memberId: userId } } } },
            members: { include: { user: publicUser } },
        },
    });

export const createWorkspace = (data: { name: string; description?: string; userId: number }) =>
    prisma.workspace.create({
        data: {
            name: data.name,
            description: data.description,
            members: { create: { memberId: data.userId, role: "ADMIN" } },
        },
    });

export const updateWorkspace = (workspaceId: number, data: { name?: string; description?: string }) =>
    prisma.workspace.update({ where: { id: workspaceId }, data });

export const deleteWorkspace = (workspaceId: number) =>
    prisma.workspace.delete({ where: { id: workspaceId } });

export const findWorkspaceMember = (workspaceId: number, memberId: number) =>
    prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId } },
    });

export const createWorkspaceMember = (workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") =>
    prisma.workspaceMember.create({ data: { workspaceId, memberId, role } });

export const updateWorkspaceMemberRole = (workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") =>
    prisma.workspaceMember.update({
        where: { workspaceId_memberId: { workspaceId, memberId } },
        data: { role },
    });

/**
 * Removes a user from a workspace AND from every board / card assignment inside it,
 * in one transaction. Board access is checked only via BoardMember, so leaving those
 * rows behind would let a removed user keep using the boards.
 * Returns the ids of the boards they were removed from.
 */
export const removeMemberFromWorkspace = (workspaceId: number, memberId: number) =>
    prisma.$transaction(async (tx) => {
        const boards = await tx.boardMember.findMany({
            where: { memberId, board: { workspaceId } },
            select: { boardId: true },
        });
        await tx.assignedCard.deleteMany({ where: { userId: memberId, card: { list: { board: { workspaceId } } } } });
        await tx.boardMember.deleteMany({ where: { memberId, board: { workspaceId } } });
        await tx.workspaceMember.delete({ where: { workspaceId_memberId: { workspaceId, memberId } } });
        return boards.map((b) => b.boardId);
    });

export const countWorkspaceAdmins = (workspaceId: number) =>
    prisma.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
