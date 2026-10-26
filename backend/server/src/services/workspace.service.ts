import * as repo from "../repositories/workspace.repository";
import * as userRepo from "../repositories/user.repository";
import { AppError } from "../utils/AppError";

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

export async function updateMemberRole(workspaceId: number, memberId: number, role: "ADMIN" | "EMPLOYEE") {
    if (role === "EMPLOYEE") {
        const adminCount = await repo.countWorkspaceAdmins(workspaceId);
        if (adminCount <= 1) throw new AppError(400, "Cannot demote the last admin");
    }
    return repo.updateWorkspaceMemberRole(workspaceId, memberId, role);
}

export async function deleteMember(workspaceId: number, memberId: number, requesterId: number) {
    if (memberId === requesterId) {
        const adminCount = await repo.countWorkspaceAdmins(workspaceId);
        if (adminCount <= 1) throw new AppError(400, "Cannot remove the last admin");
    }
    return repo.deleteWorkspaceMember(workspaceId, memberId);
}
