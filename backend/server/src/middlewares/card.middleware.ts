import { Request, Response, NextFunction } from "express";
import prisma from "../../../shared/db/client";
import { parseId } from "../utils/parseId";

// Card/list routes don't carry the board id in the URL. These resolvers look it up
// from the object itself, so isBoardMember can run — and the id can't be spoofed.

export const resolveBoardFromList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const listId = parseId(req.params.listId, "list id");
        const list = await prisma.list.findUnique({ where: { id: listId } });
        if (!list) {
            res.status(404).json({ message: "List not found" });
            return;
        }
        req.params.boardId = list.boardId.toString();
        next();
    } catch (error) {
        next(error);
    }
};

export const resolveBoardFromCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cardId = parseId(req.params.cardId, "card id");
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
    } catch (error) {
        next(error);
    }
};
