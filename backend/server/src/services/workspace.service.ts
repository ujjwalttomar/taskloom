import * as repo from "../repositories/workspace.repository";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export async function getAllWorkspaces(userId: number) {
    return repo.findAllWorkspacesForUser(userId);
}

export async function getWorkspace(workspaceId: number, userId: number, role: "ADMIN" | "EMPLOYEE") {
    const workspace = await repo.findWorkspaceById(workspaceId, userId, role === "ADMIN");
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
    const updated = await repo.updateWorkspaceMemberRole(workspaceId, memberId, role);

    // Workspace admins reach every board implicitly, so a workspace role change changes board
    // access too. Tell open boards (senderId 0: nobody is skipped, the person's own tabs must hear it):
    if (target.role !== role) {
        for (const board of await repo.findBoardsWithMembership(workspaceId, memberId)) {
            const explicit = board.members[0];
            if (explicit) {
                // still on the board: their effective role changed (open pages refetch it)
                publishBoardEvent(board.id, 0, { type: "member_role_updated", member: explicit });
            } else if (role === "EMPLOYEE") {
                // only had access as an admin: it's gone (the WS server re-checks and evicts)
                publishBoardEvent(board.id, 0, { type: "member_removed", memberId });
            }
        }
    }
    return updated;
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
