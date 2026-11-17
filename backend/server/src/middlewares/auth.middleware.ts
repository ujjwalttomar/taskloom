import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../../../shared/auth/token";
import prisma from "../../../shared/db/client";
import { parseId } from "../utils/parseId";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies["accessToken"];
    if (!token) {
        res.status(401).json({ message: "token missing!" });
        return;
    }
    try {
        const decoded = verifyAccessToken(token);
        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ message: "Invalid or expired token" });
    }
};

export const isMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = parseId(req.params.workspaceId, "workspace id");
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_memberId: { workspaceId, memberId: req.userId! } },
        });
        if (!membership) {
            res.status(403).json({ message: "Not a member of this workspace" });
            return;
        }
        req.membership = membership;
        next();
    } catch (error) {
        next(error);
    }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.membership?.role !== "ADMIN") {
        res.status(403).json({ message: "Only workspace admins can do this" });
        return;
    }
    next();
};
