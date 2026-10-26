import prisma from "../../../../shared/db/client";

export const findAllWorkspacesForUser = (userId: number) =>
    prisma.workspace.findMany({
        where: { members: { some: { memberId: userId } } },
        include: { members: { include: { user: true } } },
    });

export const findWorkspaceById = (workspaceId: number) =>
    prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { boards: true, members: { include: { user: true } } },
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

export const deleteWorkspaceMember = (workspaceId: number, memberId: number) =>
    prisma.workspaceMember.delete({
        where: { workspaceId_memberId: { workspaceId, memberId } },
    });

export const countWorkspaceAdmins = (workspaceId: number) =>
    prisma.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
