import * as repo from "../repositories/comment.repository";
import { publishBoardEvent } from "../redis";
import { AppError } from "../utils/AppError";

export async function getAllComments(cardId: number) {
    return repo.findAllComments(cardId);
}

export async function createComment(boardId: number, cardId: number, userId: number, text: string) {
    const comment = await repo.createComment({ text, cardId, creatorId: userId });
    publishBoardEvent(boardId, userId, { type: "comment_created", comment });
    return comment;
}

export async function editComment(boardId: number, commentId: number, userId: number, text: string) {
    const comment = await repo.findCommentById(commentId);
    if (!comment) throw new AppError(404, "Comment not found");
    if (comment.creatorId !== userId) throw new AppError(403, "Only the comment creator can edit");

    const updated = await repo.updateComment(commentId, text);
    publishBoardEvent(boardId, userId, { type: "comment_edited", comment: updated });
    return updated;
}

export async function deleteComment(boardId: number, commentId: number, userId: number, isAdmin: boolean) {
    const comment = await repo.findCommentById(commentId);
    if (!comment) throw new AppError(404, "Comment not found");

    const isCreator = comment.creatorId === userId;
    if (!isCreator && !isAdmin) throw new AppError(403, "Only the creator or board admin can delete");

    await repo.deleteComment(commentId);
    publishBoardEvent(boardId, userId, { type: "comment_deleted", commentId });
}
