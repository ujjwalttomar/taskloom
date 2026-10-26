import { Request, Response } from "express";
import {
    CreateWorkspaceSchema,
    EditWorkspaceSchema,
    AddWorkspaceMemberSchema,
    UpdateWorkspaceMemberRoleSchema,
} from "../schemas/workspace.schemas";
import * as workspaceService from "../services/workspace.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

export const getAllWorkspaces = async (req: Request, res: Response) => {
    try {
        const workspaces = await workspaceService.getAllWorkspaces(req.userId!);
        return res.status(200).json({ workspaces });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getSpecificWorkspace = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const workspace = await workspaceService.getWorkspace(workspaceId);
        return res.status(200).json({ workspace });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createWorkspace = async (req: Request, res: Response) => {
    try {
        const parsed = CreateWorkspaceSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const { name, description } = parsed.data.body;
        const workspace = await workspaceService.createWorkspace(req.userId!, name, description);
        return res.status(201).json({ message: "workspace created", workspace });
    } catch (error) {
        return handleError(res, error);
    }
};

export const editWorkspace = async (req: Request, res: Response) => {
    try {
        const parsed = EditWorkspaceSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const workspace = await workspaceService.editWorkspace(workspaceId, parsed.data.body);
        return res.status(200).json({ workspace });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteWorkspace = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params["workspaceId"] as string);
        await workspaceService.deleteWorkspace(workspaceId);
        return res.status(200).json({ message: "Workspace deleted" });
    } catch (error) {
        return handleError(res, error);
    }
};

export const addMembers = async (req: Request, res: Response) => {
    try {
        const parsed = AddWorkspaceMemberSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const { email, role } = parsed.data.body;
        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
        const member = await workspaceService.addMember(workspaceId, email, memberRole);
        return res.status(201).json({ message: "Member added", member });
    } catch (error) {
        return handleError(res, error);
    }
};

export const updateMemberRole = async (req: Request, res: Response) => {
    try {
        const parsed = UpdateWorkspaceMemberRoleSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const memberId = parseInt(req.params["memberId"] as string);
        const { role } = parsed.data.body;
        const updated = await workspaceService.updateMemberRole(workspaceId, memberId, role);
        return res.status(200).json({ message: "Role updated", member: updated });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteMember = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const memberId = parseInt(req.params["memberId"] as string);
        await workspaceService.deleteMember(workspaceId, memberId, req.userId!);
        return res.status(200).json({ message: "Member removed", memberId });
    } catch (error) {
        return handleError(res, error);
    }
};
