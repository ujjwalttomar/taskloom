import * as repo from "../repositories/board.repository";
import * as userRepo from "../repositories/user.repository";
import { publishBoardEvent } from "../redis";
import { AppError } from "../utils/AppError";

export async function getAllBoards(workspaceId: number, userId: number) {
    return repo.findAllBoardsForUser(workspaceId, userId);
}

export async function getBoard(boardId: number) {
    const board = await repo.findBoardById(boardId);
    if (!board) throw new AppError(404, "Board not found");
    return board;
}

export async function createBoard(workspaceId: number, userId: number, title: string, description?: string) {
    return repo.createBoard({ title, description, workspaceId, userId });
}

export async function editBoard(boardId: number, senderId: number, data: { title?: string; description?: string }) {
    const board = await repo.updateBoard(boardId, data);
    publishBoardEvent(boardId, senderId, { type: "board_edited", board });
    return board;
}

export async function deleteBoard(boardId: number, senderId: number) {
    await repo.deleteBoard(boardId);
    publishBoardEvent(boardId, senderId, { type: "board_deleted", boardId });
}

export async function addMember(boardId: number, senderId: number, email: string, role: "ADMIN" | "EMPLOYEE") {
    const user = await userRepo.findUserByEmail(email);
    if (!user) throw new AppError(404, "User not found");

    const board = await repo.findBoardRaw(boardId);
    if (!board) throw new AppError(404, "Board not found");

    const workspaceMembership = await repo.findWorkspaceMember(board.workspaceId, user.id);
    if (!workspaceMembership) throw new AppError(403, "User is not a workspace member");

    const existing = await repo.findBoardMember(boardId, user.id);
    if (existing) throw new AppError(409, "Already a board member");

    const member = await repo.createBoardMember(boardId, user.id, role);
    publishBoardEvent(boardId, senderId, { type: "member_added", member });
    return member;
}

export async function updateBoardMemberRole(boardId: number, memberId: number, senderId: number, role: "ADMIN" | "EMPLOYEE") {
    if (role === "EMPLOYEE") {
        const adminCount = await repo.countBoardAdmins(boardId);
        if (adminCount <= 1 && memberId === senderId) {
            throw new AppError(400, "Cannot demote the last admin");
        }
    }
    const updated = await repo.updateBoardMemberRole(boardId, memberId, role);
    publishBoardEvent(boardId, senderId, { type: "member_role_updated", member: updated });
    return updated;
}

export async function deleteBoardMember(boardId: number, memberId: number, senderId: number) {
    if (memberId === senderId) {
        const adminCount = await repo.countBoardAdmins(boardId);
        if (adminCount <= 1) throw new AppError(400, "Cannot remove the last admin");
    }
    await repo.deleteBoardMember(boardId, memberId);
    publishBoardEvent(boardId, senderId, { type: "member_removed", memberId });
}
