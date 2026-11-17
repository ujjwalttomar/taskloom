import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { parseId } from "../utils/parseId";

export const isBoardMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const boardId = parseId(req.params.boardId, "board id");
        const membership = await prisma.boardMember.findUnique({
            where: { boardId_memberId: { boardId, memberId: req.userId! } },
        });
        if (!membership) {
            res.status(403).json({ message: "Not a member of this board" });
            return;
        }
        req.boardMembership = membership;
        next();
    } catch (error) {
        next(error);
    }
};

export const isBoardAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.boardMembership?.role !== "ADMIN") {
        res.status(403).json({ message: "Only board admins can do this" });
        return;
    }
    next();
};
