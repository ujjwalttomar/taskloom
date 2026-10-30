
import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export const getAllComments = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);

    const comments = await prisma.comment.findMany({
        where: { cardId },
        orderBy: { createdAt: "desc" },
        include: { creator: true },
    });

    return res.status(200).json({ comments });
});


export const createComment = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const cardId = parseInt(req.params.cardId as string);
    const userId = req.userId!;
    const { text } = req.body;

    if (!text) throw new AppError(400, "Comment text is required");

    const comment = await prisma.comment.create({
        data: { text, cardId, creatorId: userId },
        include: { creator: true },
    });

    publishBoardEvent(boardId, userId, { type: "comment_created", comment });

    return res.status(201).json({ message: "Comment created", comment });
});


export const editComment = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const commentId = parseInt(req.params.commentId as string);
    const userId = req.userId!;
    const { text } = req.body;

    if (!text) throw new AppError(400, "Comment text is required");

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError(404, "Comment not found");
    if (comment.creatorId !== userId) throw new AppError(403, "Only the comment creator can edit");

    const updated = await prisma.comment.update({
        where: { id: commentId },
        data: { text },
        include: { creator: true },
    });

    publishBoardEvent(boardId, userId, { type: "comment_edited", comment: updated });

    return res.status(200).json({ comment: updated });
});


export const deleteComment = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const commentId = parseInt(req.params.commentId as string);
    const userId = req.userId!;

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError(404, "Comment not found");

    const isCreator = comment.creatorId === userId;
    const isAdmin = req.boardMembership?.role === "ADMIN";
    if (!isCreator && !isAdmin) throw new AppError(403, "Only the creator or board admin can delete");

    await prisma.comment.delete({ where: { id: commentId } });

    publishBoardEvent(boardId, userId, { type: "comment_deleted", commentId });

    return res.status(200).json({ message: "Comment deleted", commentId });
});
