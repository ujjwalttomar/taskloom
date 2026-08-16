import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../../../shared/auth/token";
import prisma from "../../../shared/db/client";

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
    const workspaceId = parseInt(req.params.workspaceId as string);
    const userId = req.userId!;

    const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_memberId: { workspaceId, memberId: userId } },
    });

    if (!membership) {
        res.status(403).json({ error: "Not a member!" });
        return;
    }

    req.membership = membership;
    next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.membership?.role !== "ADMIN") {
        res.status(403).json({ error: "Not an admin!" });
        return;
    }
    next();
};
