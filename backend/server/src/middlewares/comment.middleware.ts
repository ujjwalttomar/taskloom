import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";

export const resolveBoardFromComment = async (req: Request, res: Response, next: NextFunction) => {
    const commentId = parseInt(req.params.commentId as string);
    const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { card: { include: { list: true } } },
    });
    if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }
    req.params.boardId = comment.card.list.boardId.toString();
    next();
};
