import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";

export const isBoardMember = async (req: Request, res: Response, next: NextFunction) => {
    const boardId = parseInt(req.params.boardId as string);
    const userId = req.userId!;

    const membership = await prisma.boardMember.findUnique({
        where: { boardId_memberId: { boardId, memberId: userId } },
    });

    if (!membership) {
        res.status(403).json({ error: "Not a member!" });
        return;
    }

    req.boardMembership = membership;
    next();
};

export const isBoardAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.boardMembership?.role !== "ADMIN") {
        res.status(403).json({ error: "Not a board admin!" });
        return;
    }
    next();
};
