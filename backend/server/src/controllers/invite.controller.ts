import { Request, Response } from "express";
import { SendInviteSchema } from "../schemas/invite.schemas";
import * as inviteService from "../services/invite.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

// POST /api/workspaces/:workspaceId/invites
export const sendInvite = async (req: Request, res: Response) => {
    try {
        const parsed = SendInviteSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const { email, role } = parsed.data.body;
        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

        const result = await inviteService.sendInvite(workspaceId, email, memberRole);

        if (result.direct) {
            return res.status(201).json({ message: "Member added" });
        }
        return res.status(200).json({ message: "Invite sent", inviteUrl: result.inviteUrl });
    } catch (error) {
        return handleError(res, error);
    }
};

// GET /api/invites/:token
export const getInviteDetails = async (req: Request, res: Response) => {
    try {
        const details = await inviteService.getInviteDetails(req.params["token"] as string);
        return res.status(200).json(details);
    } catch (error) {
        return handleError(res, error);
    }
};

// POST /api/invites/:token/accept
export const acceptInvite = async (req: Request, res: Response) => {
    try {
        const result = await inviteService.acceptInvite(req.params["token"] as string, req.userId!);
        const message = result.alreadyMember ? "Already a member" : "Joined workspace";
        return res.status(200).json({ message, workspaceId: result.workspaceId });
    } catch (error) {
        return handleError(res, error);
    }
};
