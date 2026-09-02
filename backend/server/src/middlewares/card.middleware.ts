import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";

export const resolveBoardFromList = async (req: Request, res: Response, next: NextFunction) => {
    const listId = parseInt(req.params.listId as string);
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list) {
        res.status(404).json({ message: "List not found" });
        return;
    }
    req.params.boardId = list.boardId.toString();
    next();
};

export const resolveBoardFromCard = async (req: Request, res: Response, next: NextFunction) => {
    const cardId = parseInt(req.params.cardId as string);
    const card = await prisma.card.findUnique({
        where: { id: cardId },
        include: { list: true },
    });
    if (!card) {
        res.status(404).json({ message: "Card not found" });
        return;
    }
    req.params.boardId = card.list.boardId.toString();
    next();
};
