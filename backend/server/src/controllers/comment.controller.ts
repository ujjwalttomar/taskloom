import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { publishBoardEvent } from "../redis";

export const getAllComments = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const comments = await prisma.comment.findMany({
            where: { cardId },
            orderBy: { createdAt: "desc" },
            include: { creator: true },
        });
        return res.status(200).json({ comments });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const createComment = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const cardId = parseInt(req.params.cardId as string);
        const userId = req.userId!;
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: "Comment text is missing" });

        const comment = await prisma.comment.create({
            data: { text, cardId, creatorId: userId },
            include: { creator: true },
        });
        publishBoardEvent(boardId, userId, { type: "comment_created", comment });
        return res.status(201).json({ message: "Comment created", comment });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const editComment = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const commentId = parseInt(req.params.commentId as string);
        const userId = req.userId!;
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: "Comment text is missing" });

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (comment.creatorId !== userId) {
            return res.status(403).json({ message: "Only the comment creator can edit" });
        }

        const updated = await prisma.comment.update({
            where: { id: commentId },
            data: { text },
            include: { creator: true },
        });
        publishBoardEvent(boardId, userId, { type: "comment_edited", comment: updated });
        return res.status(200).json({ comment: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const commentId = parseInt(req.params.commentId as string);
        const userId = req.userId!;

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });
        if (!comment) return res.status(404).json({ message: "Comment not found" });

        const isCreator = comment.creatorId === userId;
        const isAdmin = req.boardMembership?.role === "ADMIN";
        if (!isCreator && !isAdmin) {
            return res.status(403).json({ message: "Only the creator or board admin can delete" });
        }

        await prisma.comment.delete({ where: { id: commentId } });
        publishBoardEvent(boardId, userId, { type: "comment_deleted", commentId });
        return res.status(200).json({ message: "Comment deleted", commentId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
