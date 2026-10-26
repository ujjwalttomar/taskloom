import prisma from "../../../../shared/db/client";

export const findInviteByToken = (token: string) =>
    prisma.workspaceInvite.findUnique({ where: { token } });

export const findInviteByTokenWithWorkspace = (token: string) =>
    prisma.workspaceInvite.findUnique({
        where: { token },
        include: { workspace: { select: { name: true, description: true } } },
    });

export const deletePendingInvites = (workspaceId: number, email: string) =>
    prisma.workspaceInvite.deleteMany({ where: { workspaceId, email, accepted: false } });

export const createInvite = (data: {
    token: string;
    workspaceId: number;
    email: string;
    role: "ADMIN" | "EMPLOYEE";
    expiresAt: Date;
}) => prisma.workspaceInvite.create({ data });

export const markInviteAccepted = (token: string) =>
    prisma.workspaceInvite.update({ where: { token }, data: { accepted: true } });

export const findWorkspace = (workspaceId: number) =>
    prisma.workspace.findUnique({ where: { id: workspaceId } });

export const findWorkspaceMember = (workspaceId: number, memberId: number) =>
    prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId } },
    });

export const createWorkspaceMember = (workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") =>
    prisma.workspaceMember.create({ data: { workspaceId, memberId, role } });

export const acceptInviteTransaction = (workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE", token: string) =>
    prisma.$transaction([
        prisma.workspaceMember.create({ data: { workspaceId, memberId, role } }),
        prisma.workspaceInvite.update({ where: { token }, data: { accepted: true } }),
    ]);
