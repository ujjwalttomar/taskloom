import prisma from "../../../../shared/db/client";

// Get a user's board membership + their role in the board
export const findBoardMember = (boardId: number, userId: number) =>
    prisma.boardMember.findUnique({
        where: { boardId_memberId: { boardId, memberId: userId } },
        include: { user: true },
    });

// Get all cards assigned to a user in a specific board
export const findAssignedCardsInBoard = (boardId: number, userId: number) =>
    prisma.assignedCard.findMany({
        where: {
            userId,
            card: { list: { boardId } },
        },
        include: {
            card: {
                include: {
                    list: { select: { id: true, title: true } },
                },
            },
        },
    });

// Get workspace membership info for a user
export const findWorkspaceMembership = (workspaceId: number, userId: number) =>
    prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId: userId } },
        include: { user: true },
    });

// Get all boards in a workspace that a user is a member of, with their role in each
export const findBoardMembershipsInWorkspace = (workspaceId: number, userId: number) =>
    prisma.boardMember.findMany({
        where: {
            memberId: userId,
            board: { workspaceId },
        },
        include: {
            board: { select: { id: true, title: true, description: true } },
        },
    });

// Get all cards assigned to a user across an entire workspace
export const findAssignedCardsInWorkspace = (workspaceId: number, userId: number) =>
    prisma.assignedCard.findMany({
        where: {
            userId,
            card: { list: { board: { workspaceId } } },
        },
        include: {
            card: {
                include: {
                    list: {
                        include: {
                            board: { select: { id: true, title: true } },
                        },
                    },
                },
            },
        },
    });

// Check if viewer is a workspace admin
export const findViewerWorkspaceMembership = (workspaceId: number, viewerId: number) =>
    prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId: viewerId } },
    });
