
import { verifyAccessToken } from "../../../shared/auth/token";
import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { AppError } from "../utils/AppError";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.accessToken;
        if (!token) throw new AppError(401, "Authentication required");

        const decoded = verifyAccessToken(token);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        // verifyAccessToken throws on invalid/expired — forward as 401
        if (error instanceof AppError) return next(error);
        return next(new AppError(401, "Invalid or expired token"));
    }
};

export const isMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId as string);
        if (isNaN(workspaceId)) throw new AppError(400, "Invalid workspace ID");

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_memberId: { workspaceId, memberId: req.userId! } }
        });
        if (!membership) throw new AppError(403, "Not a workspace member");

        req.membership = membership;
        next();
    } catch (error) {
        next(error);
    }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.membership!.role !== "ADMIN") return next(new AppError(403, "Admin only"));
    next();
};
