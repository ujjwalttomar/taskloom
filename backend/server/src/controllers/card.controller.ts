
import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export const getAllCards = asyncHandler(async (req, res) => {
    const listId = parseInt(req.params.listId as string);

    const cards = await prisma.card.findMany({
        where: { listId },
        orderBy: { order: "asc" },
    });

    return res.status(200).json({ cards });
});


export const getSpecificCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);

    const card = await prisma.card.findUnique({
        where: { id: cardId },
        include: {
            comments: { orderBy: { createdAt: "asc" }, include: { creator: true } },
            assignedTo: { include: { user: true } },
            creator: true,
            list: true,
        },
    });

    if (!card) throw new AppError(404, "Card not found");

    return res.status(200).json({ card });
});


export const createCard = asyncHandler(async (req, res) => {
    const listId = parseInt(req.params.listId as string);
    const userId = req.userId!;
    const { title, description } = req.body;

    if (!title) throw new AppError(400, "Card title is required");

    const lastCard = await prisma.card.findFirst({
        where: { listId },
        orderBy: { order: "desc" },
    });
    const order = lastCard ? lastCard.order + 1 : 1;

    const card = await prisma.card.create({
        data: { title, description, listId, creatorId: userId, order },
    });

    publishBoardEvent(parseInt(req.params.boardId as string), req.userId!, { type: "card_created", card });

    return res.status(201).json({ message: "Card created", card });
});


export const editCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);
    const { title, description } = req.body;

    const card = await prisma.card.update({
        where: { id: cardId },
        data: { title, description },
    });

    publishBoardEvent(req.boardMembership!.boardId!, req.userId!, { type: "card_edited", card });

    return res.status(200).json({ card });
});


export const deleteCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);

    await prisma.card.delete({ where: { id: cardId } });

    publishBoardEvent(req.boardMembership!.boardId!, req.userId!, { type: "card_deleted", cardId });

    return res.status(200).json({ message: "Card deleted", cardId });
});


export const moveCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);
    const { targetListId, afterCardId, beforeCardId } = req.body;

    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });
    if (!card) throw new AppError(404, "Card not found");

    const targetList = await prisma.list.findUnique({ where: { id: targetListId } });
    if (!targetList) throw new AppError(404, "Target list not found");

    if (targetList.boardId !== card.list.boardId) {
        throw new AppError(400, "Cannot move card to a different board");
    }

    let newOrder: number;

    if (afterCardId && beforeCardId) {
        const [afterCard, beforeCard] = await Promise.all([
            prisma.card.findUnique({ where: { id: afterCardId } }),
            prisma.card.findUnique({ where: { id: beforeCardId } }),
        ]);
        if (!afterCard || !beforeCard) throw new AppError(404, "Adjacent card not found");
        newOrder = (afterCard.order + beforeCard.order) / 2;

    } else if (afterCardId) {
        const afterCard = await prisma.card.findUnique({ where: { id: afterCardId } });
        if (!afterCard) throw new AppError(404, "Card not found");
        newOrder = afterCard.order + 1;

    } else if (beforeCardId) {
        const beforeCard = await prisma.card.findUnique({ where: { id: beforeCardId } });
        if (!beforeCard) throw new AppError(404, "Card not found");
        newOrder = beforeCard.order / 2;

    } else {
        newOrder = 1;
    }

    const updatedCard = await prisma.card.update({
        where: { id: cardId },
        data: { listId: targetListId, order: newOrder },
    });

    publishBoardEvent(card.list.boardId, req.userId!, { type: "card_moved", card: updatedCard });

    return res.status(200).json({ card: updatedCard });
});


export const assignCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);
    const boardId = parseInt(req.params.boardId as string);
    const { userId } = req.body;

    const boardMembership = await prisma.boardMember.findUnique({
        where: { boardId_memberId: { boardId, memberId: userId } },
    });
    if (!boardMembership) throw new AppError(403, "User is not a board member");

    const isAdmin = req.boardMembership!.role === "ADMIN";
    const isSelfAssign = userId === req.userId;
    if (!isAdmin && !isSelfAssign) throw new AppError(403, "Can only assign yourself");

    const existing = await prisma.assignedCard.findUnique({
        where: { cardId_userId: { cardId, userId } },
    });
    if (existing) throw new AppError(409, "User already assigned");

    const assignment = await prisma.assignedCard.create({
        data: { cardId, userId },
        include: { user: true },
    });

    publishBoardEvent(boardId, req.userId!, { type: "card_assigned", cardId, assignment });

    return res.status(201).json({ message: "User assigned", assignment });
});


export const unassignCard = asyncHandler(async (req, res) => {
    const cardId = parseInt(req.params.cardId as string);
    const userId = parseInt(req.params.userId as string);

    await prisma.assignedCard.delete({
        where: { cardId_userId: { cardId, userId } },
    });

    publishBoardEvent(req.boardMembership!.boardId, req.userId!, { type: "card_unassigned", cardId, userId });

    return res.status(200).json({ message: "User unassigned" });
});
