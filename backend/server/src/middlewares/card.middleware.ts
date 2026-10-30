
import prisma from "../../../shared/db/client";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const resolveBoardFromList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const listId = parseInt(req.params.listId as string);
        if (isNaN(listId)) throw new AppError(400, "Invalid list ID");

        const list = await prisma.list.findUnique({ where: { id: listId } });
        if (!list) throw new AppError(404, "List not found");

        req.params.boardId = list.boardId.toString();
        next();
    } catch (error) {
        next(error);
    }
};

export const resolveBoardFromCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cardId = parseInt(req.params.cardId as string);
        if (isNaN(cardId)) throw new AppError(400, "Invalid card ID");

        const card = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });
        if (!card) throw new AppError(404, "Card not found");

        req.params.boardId = card.list.boardId.toString();
        next();
    } catch (error) {
        next(error);
    }
};
