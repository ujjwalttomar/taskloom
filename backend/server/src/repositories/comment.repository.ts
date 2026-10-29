import prisma from "../../../shared/db/client";

export const findAllComments = (cardId: number) =>
    prisma.comment.findMany({
        where: { cardId },
        orderBy: { createdAt: "desc" },
        include: { creator: true },
    });

export const findCommentById = (commentId: number) =>
    prisma.comment.findUnique({ where: { id: commentId } });

export const createComment = (data: { text: string; cardId: number; creatorId: number }) =>
    prisma.comment.create({ data, include: { creator: true } });

export const updateComment = (commentId: number, text: string) =>
    prisma.comment.update({
        where: { id: commentId },
        data: { text },
        include: { creator: true },
    });

export const deleteComment = (commentId: number) =>
    prisma.comment.delete({ where: { id: commentId } });
