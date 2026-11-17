import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { parseId } from "../utils/parseId";

export const resolveBoardFromComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const commentId = parseId(req.params.commentId, "comment id");
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
    } catch (error) {
        next(error);
    }
};
