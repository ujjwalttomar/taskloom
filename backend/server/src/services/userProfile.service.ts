import * as repo from "../repositories/userProfile.repository";
import { AppError } from "../utils/AppError";

// Board-context profile: any board member can view any other board member's card
export async function getBoardProfile(boardId: number, targetUserId: number, viewerId: number) {
    // Verify viewer is a board member
    const viewerMembership = await repo.findBoardMember(boardId, viewerId);
    if (!viewerMembership) throw new AppError(403, "You are not a member of this board");

    // Get target user's membership in this board
    const targetMembership = await repo.findBoardMember(boardId, targetUserId);
    if (!targetMembership) throw new AppError(404, "User is not a member of this board");

    // Get their assigned cards in this board
    const assignments = await repo.findAssignedCardsInBoard(boardId, targetUserId);

    return {
        user: {
            id: targetMembership.user.id,
            name: targetMembership.user.name,
            email: targetMembership.user.email,
        },
        role: targetMembership.role,
        joinedAt: (targetMembership as any).createdAt ?? null,
        assignedCards: assignments.map((a: any) => ({
            cardId: a.card.id,
            title: a.card.title,
            description: a.card.description,
            listId: a.card.list.id,
            listTitle: a.card.list.title,
        })),
    };
}

// Workspace-context profile: only workspace admins can call this
export async function getWorkspaceProfile(workspaceId: number, targetUserId: number, viewerId: number) {
    // Verify viewer is a workspace admin
    const viewerMembership = await repo.findViewerWorkspaceMembership(workspaceId, viewerId);
    if (!viewerMembership) throw new AppError(403, "You are not a member of this workspace");
    if (viewerMembership.role !== "ADMIN") throw new AppError(403, "Only workspace admins can view full profiles");

    // Get target's workspace membership
    const targetMembership = await repo.findWorkspaceMembership(workspaceId, targetUserId);
    if (!targetMembership) throw new AppError(404, "User is not a member of this workspace");

    // Get all boards in this workspace they belong to
    const boardMemberships = await repo.findBoardMembershipsInWorkspace(workspaceId, targetUserId);

    // Get all assigned cards across the workspace
    const assignments = await repo.findAssignedCardsInWorkspace(workspaceId, targetUserId);

    return {
        user: {
            id: targetMembership.user.id,
            name: targetMembership.user.name,
            email: targetMembership.user.email,
        },
        workspaceRole: targetMembership.role,
        workspaceJoinedAt: (targetMembership as any).createdAt ?? null,
        boards: boardMemberships.map((bm: any) => ({
            boardId: bm.board.id,
            title: bm.board.title,
            role: bm.role,
        })),
        assignedCards: assignments.map((a: any) => ({
            cardId: a.card.id,
            title: a.card.title,
            description: a.card.description,
            listId: a.card.list.id,
            listTitle: a.card.list.title,
            boardId: a.card.list.board.id,
            boardTitle: a.card.list.board.title,
        })),
    };
}
