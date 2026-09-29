import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { publishBoardEvent } from "../redis";

export const getAllCards = async (req: Request, res: Response) => {
    try {
        const listId = parseInt(req.params.listId as string);
        const cards = await prisma.card.findMany({
            where: { listId },
            orderBy: { order: "asc" },
        });
        return res.status(200).json({ cards });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const getSpecificCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const card = await prisma.card.findUnique({
            where: { id: cardId },
            include: {
                comments: { orderBy: { createdAt: "desc" }, include: { creator: true } },
                assignedTo: { include: { user: true } },
                creator: true,
                list: true,
            },
        });
        if (!card) return res.status(404).json({ message: "Card not found" });
        return res.status(200).json({ card });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const createCard = async (req: Request, res: Response) => {
    try {
        const listId = parseInt(req.params.listId as string);
        const boardId = parseInt(req.params.boardId as string);
        const userId = req.userId!;
        const { title, description } = req.body;
        if (!title) return res.status(400).json({ message: "Card title is missing" });

        const lastCard = await prisma.card.findFirst({
            where: { listId },
            orderBy: { order: "desc" },
        });
        const order = lastCard ? lastCard.order + 1 : 1;

        const card = await prisma.card.create({
            data: { title, description, listId, creatorId: userId, order },
        });
        publishBoardEvent(boardId, userId, { type: "card_created", card });
        return res.status(201).json({ message: "Card created", card });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const editCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const { title, description } = req.body;
        const card = await prisma.card.update({
            where: { id: cardId },
            data: { title, description },
        });
        publishBoardEvent(req.boardMembership!.boardId, req.userId!, { type: "card_edited", card });
        return res.status(200).json({ card });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        await prisma.card.delete({ where: { id: cardId } });
        publishBoardEvent(req.boardMembership!.boardId, req.userId!, { type: "card_deleted", cardId });
        return res.status(200).json({ message: "Card deleted", cardId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const moveCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const { targetListId, afterCardId, beforeCardId } = req.body;

        const card = await prisma.card.findUnique({
            where: { id: cardId },
            include: { list: true },
        });
        if (!card) return res.status(404).json({ message: "Card not found" });

        const targetList = await prisma.list.findUnique({ where: { id: targetListId } });
        if (!targetList) return res.status(404).json({ message: "Target list not found" });
        if (targetList.boardId !== card.list.boardId) {
            return res.status(400).json({ message: "Cannot move card to a different board" });
        }

        let newOrder: number;
        if (afterCardId && beforeCardId) {
            const afterCard = await prisma.card.findUnique({ where: { id: afterCardId } });
            const beforeCard = await prisma.card.findUnique({ where: { id: beforeCardId } });
            if (!afterCard || !beforeCard) return res.status(404).json({ message: "Adjacent card not found" });
            newOrder = (afterCard.order + beforeCard.order) / 2;
        } else if (afterCardId) {
            const afterCard = await prisma.card.findUnique({ where: { id: afterCardId } });
            if (!afterCard) return res.status(404).json({ message: "Card not found" });
            newOrder = afterCard.order + 1;
        } else if (beforeCardId) {
            const beforeCard = await prisma.card.findUnique({ where: { id: beforeCardId } });
            if (!beforeCard) return res.status(404).json({ message: "Card not found" });
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
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const assignCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const boardId = parseInt(req.params.boardId as string);
        const { userId } = req.body;

        const boardMembership = await prisma.boardMember.findUnique({
            where: { boardId_memberId: { boardId, memberId: userId } },
        });
        if (!boardMembership) {
            return res.status(403).json({ message: "User is not a board member" });
        }

        // admins can assign anyone; non-admins can only self-assign
        const isAdmin = req.boardMembership!.role === "ADMIN";
        const isSelfAssign = userId === req.userId;
        if (!isAdmin && !isSelfAssign) {
            return res.status(403).json({ message: "Can only assign yourself" });
        }

        const existing = await prisma.assignedCard.findUnique({
            where: { cardId_userId: { cardId, userId } },
        });
        if (existing) return res.status(409).json({ message: "User already assigned" });

        const assignment = await prisma.assignedCard.create({
            data: { cardId, userId },
            include: { user: true },
        });
        publishBoardEvent(boardId, req.userId!, { type: "card_assigned", cardId, assignment });
        return res.status(201).json({ message: "User assigned", assignment });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const unassignCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        const userId = parseInt(req.params.userId as string);

        await prisma.assignedCard.delete({ where: { cardId_userId: { cardId, userId } } });
        publishBoardEvent(req.boardMembership!.boardId, req.userId!, { type: "card_unassigned", cardId, userId });
        return res.status(200).json({ message: "User unassigned" });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
