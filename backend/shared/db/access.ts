import prisma from "./client";

export type BoardRole = "ADMIN" | "EMPLOYEE";

/**
 * THE board access rule, used by the REST middleware and the WebSocket server alike:
 * - a workspace ADMIN can reach every board in their workspace, as a board ADMIN,
 *   whether or not they were added to it (access is implicit, so promotions and demotions
 *   take effect immediately and there are no extra rows to keep in sync);
 * - everyone else needs a BoardMember row, and gets that row's role;
 * - otherwise null: no access.
 * One query.
 */
export async function getBoardRole(boardId: number, userId: number): Promise<BoardRole | null> {
    const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: {
            members: { where: { memberId: userId }, select: { role: true } },
            workspace: { select: { members: { where: { memberId: userId }, select: { role: true } } } },
        },
    });
    if (!board) return null;
    if (board.workspace.members[0]?.role === "ADMIN") return "ADMIN";
    return board.members[0]?.role ?? null;
}
