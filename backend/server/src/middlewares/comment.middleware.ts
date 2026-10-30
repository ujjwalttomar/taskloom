
import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { AppError } from "../utils/AppError";

export const resolveBoardFromComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const commentId = parseInt(req.params.commentId as string);
        if (isNaN(commentId)) throw new AppError(400, "Invalid comment ID");

        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
            include: { card: { include: { list: true } } },
        });
        if (!comment) throw new AppError(404, "Comment not found");

        req.params.boardId = comment.card.list.boardId.toString();
        next();
    } catch (error) {
        next(error);
    }
};
