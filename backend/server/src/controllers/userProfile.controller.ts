import { Request, Response } from "express";
import * as userProfileService from "../services/userProfile.service";
import { handleError } from "../utils/handleError";

// GET /api/boards/:boardId/members/:memberId/profile
export const getBoardProfile = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const targetUserId = parseInt(req.params["memberId"] as string);
        const viewerId = req.userId!;
        const profile = await userProfileService.getBoardProfile(boardId, targetUserId, viewerId);
        return res.status(200).json({ profile });
    } catch (error) {
        return handleError(res, error);
    }
};

// GET /api/workspaces/:workspaceId/members/:memberId/profile
export const getWorkspaceProfile = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const targetUserId = parseInt(req.params["memberId"] as string);
        const viewerId = req.userId!;
        const profile = await userProfileService.getWorkspaceProfile(workspaceId, targetUserId, viewerId);
        return res.status(200).json({ profile });
    } catch (error) {
        return handleError(res, error);
    }
};
