import { Request, Response } from "express";
import { CreateCardSchema, EditCardSchema, MoveCardSchema, AssignCardSchema } from "../schemas/card.schemas";
import * as cardService from "../services/card.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

export const getAllCards = async (req: Request, res: Response) => {
    try {
        const listId = parseInt(req.params["listId"] as string);
        const cards = await cardService.getAllCards(listId);
        return res.status(200).json({ cards });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getSpecificCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params["cardId"] as string);
        const card = await cardService.getCard(cardId);
        return res.status(200).json({ card });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createCard = async (req: Request, res: Response) => {
    try {
        const parsed = CreateCardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const listId = parseInt(req.params["listId"] as string);
        const boardId = parseInt(req.params["boardId"] as string);
        const { title, description } = parsed.data.body;
        const card = await cardService.createCard(listId, boardId, req.userId!, title, description);
        return res.status(201).json({ message: "Card created", card });
    } catch (error) {
        return handleError(res, error);
    }
};

export const editCard = async (req: Request, res: Response) => {
    try {
        const parsed = EditCardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const cardId = parseInt(req.params["cardId"] as string);
        const card = await cardService.editCard(cardId, req.boardMembership!.boardId, req.userId!, parsed.data.body);
        return res.status(200).json({ card });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params["cardId"] as string);
        await cardService.deleteCard(cardId, req.boardMembership!.boardId, req.userId!);
        return res.status(200).json({ message: "Card deleted", cardId });
    } catch (error) {
        return handleError(res, error);
    }
};

export const moveCard = async (req: Request, res: Response) => {
    try {
        const parsed = MoveCardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const cardId = parseInt(req.params["cardId"] as string);
        const { targetListId, afterCardId, beforeCardId } = parsed.data.body;
        const card = await cardService.moveCard(cardId, req.userId!, targetListId, afterCardId, beforeCardId);
        return res.status(200).json({ card });
    } catch (error) {
        return handleError(res, error);
    }
};

export const assignCard = async (req: Request, res: Response) => {
    try {
        const parsed = AssignCardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const cardId = parseInt(req.params["cardId"] as string);
        const boardId = parseInt(req.params["boardId"] as string);
        const { userId } = parsed.data.body;
        const assignment = await cardService.assignCard(cardId, boardId, userId, req.userId!, req.boardMembership!.role);
        return res.status(201).json({ message: "User assigned", assignment });
    } catch (error) {
        return handleError(res, error);
    }
};

export const unassignCard = async (req: Request, res: Response) => {
    try {
        const cardId = parseInt(req.params["cardId"] as string);
        const userId = parseInt(req.params["userId"] as string);
        await cardService.unassignCard(cardId, userId, req.boardMembership!.boardId, req.userId!);
        return res.status(200).json({ message: "User unassigned" });
    } catch (error) {
        return handleError(res, error);
    }
};
