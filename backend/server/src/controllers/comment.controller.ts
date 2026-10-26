import { Request, Response } from "express";
import { CreateCommentSchema, EditCommentSchema } from "../schemas/comment.schemas";
import * as commentService from "../services/comment.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

export const getAllComments = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params["cardId"] as string);
        const comments = await commentService.getAllComments(cardId);
        return res.status(200).json({ comments });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createComment = async (req: Request, res: Response) => {
    try {
        const parsed = CreateCommentSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const cardId = parseInt(req.params["cardId"] as string);
        const comment = await commentService.createComment(boardId, cardId, req.userId!, parsed.data.body.text);
        return res.status(201).json({ message: "Comment created", comment });
    } catch (error) {
        return handleError(res, error);
    }
};

export const editComment = async (req: Request, res: Response) => {
    try {
        const parsed = EditCommentSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const commentId = parseInt(req.params["commentId"] as string);
        const comment = await commentService.editComment(boardId, commentId, req.userId!, parsed.data.body.text);
        return res.status(200).json({ comment });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const commentId = parseInt(req.params["commentId"] as string);
        const isAdmin = req.boardMembership?.role === "ADMIN";
        await commentService.deleteComment(boardId, commentId, req.userId!, isAdmin);
        return res.status(200).json({ message: "Comment deleted", commentId });
    } catch (error) {
        return handleError(res, error);
    }
};
