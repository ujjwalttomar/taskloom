import * as repo from "../repositories/workspace.repository";
import * as userRepo from "../repositories/user.repository";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export async function getAllWorkspaces(userId: number) {
    return repo.findAllWorkspacesForUser(userId);
}

export async function getWorkspace(workspaceId: number) {
    const workspace = await repo.findWorkspaceById(workspaceId);
    if (!workspace) throw new AppError(404, "Workspace not found");
    return workspace;
}

export async function createWorkspace(userId: number, name: string, description?: string) {
    return repo.createWorkspace({ name, description, userId });
}

export async function editWorkspace(workspaceId: number, data: { name?: string; description?: string }) {
    return repo.updateWorkspace(workspaceId, data);
}

export async function deleteWorkspace(workspaceId: number) {
    return repo.deleteWorkspace(workspaceId);
}

export async function addMember(workspaceId: number, email: string, role: "ADMIN" | "EMPLOYEE") {
    const user = await userRepo.findUserByEmail(email);
    if (!user) throw new AppError(404, "User not found");

    const existing = await repo.findWorkspaceMember(workspaceId, user.id);
    if (existing) throw new AppError(409, "Already a member");

    return repo.createWorkspaceMember(workspaceId, user.id, role);
}

/** Throws if this change would leave the workspace with no admin at all. */
async function assertNotLastAdmin(workspaceId: number, target: { role: string }, message: string) {
    if (target.role !== "ADMIN") return;
    const adminCount = await repo.countWorkspaceAdmins(workspaceId);
    if (adminCount <= 1) throw new AppError(400, message);
}

export async function updateMemberRole(workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") {
    const target = await repo.findWorkspaceMember(workspaceId, memberId);
    if (!target) throw new AppError(404, "Member not found");
    if (role === "EMPLOYEE") await assertNotLastAdmin(workspaceId, target, "Cannot demote the last admin");
    return repo.updateWorkspaceMemberRole(workspaceId, memberId, role);
}

export async function deleteMember(workspaceId: number, memberId: number, requesterId: number) {
    const target = await repo.findWorkspaceMember(workspaceId, memberId);
    if (!target) throw new AppError(404, "Member not found");
    await assertNotLastAdmin(workspaceId, target, "Cannot remove the last admin");

    const boardIds = await repo.removeMemberFromWorkspace(workspaceId, memberId);
    // Tell anyone viewing those boards; the removed user's own client leaves the board
    for (const boardId of boardIds) {
        publishBoardEvent(boardId, requesterId, { type: "member_removed", memberId });
    }
}
