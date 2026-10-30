
import { Request, Response, NextFunction } from "express-serve-static-core";
import prisma from "../../../shared/db/client";
import { AppError } from "../utils/AppError";

export const isBoardMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        if (isNaN(boardId)) throw new AppError(400, "Invalid board ID");

        const boardMembership = await prisma.boardMember.findUnique({
            where: { boardId_memberId: { boardId, memberId: req.userId! } }
        });
        if (!boardMembership) throw new AppError(403, "Not a board member");

        req.boardMembership = boardMembership;
        next();
    } catch (error) {
        next(error);
    }
};

export const isBoardAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.boardMembership!.role !== "ADMIN") return next(new AppError(403, "Board admin only"));
    next();
};
