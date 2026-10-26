import { Request, Response } from "express";
import { CreateListSchema, EditListSchema, ChangeListOrderSchema } from "../schemas/list.schemas";
import * as listService from "../services/list.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

export const getAllLists = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const lists = await listService.getAllLists(boardId);
        return res.status(200).json({ lists });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createList = async (req: Request, res: Response) => {
    try {
        const parsed = CreateListSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const list = await listService.createList(boardId, req.userId!, parsed.data.body.title);
        return res.status(201).json({ message: "List created", list });
    } catch (error) {
        return handleError(res, error);
    }
};

export const editList = async (req: Request, res: Response) => {
    try {
        const parsed = EditListSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const listId = parseInt(req.params["listId"] as string);
        const list = await listService.editList(boardId, listId, req.userId!, parsed.data.body.title);
        return res.status(200).json({ list });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteList = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const listId = parseInt(req.params["listId"] as string);
        await listService.deleteList(boardId, listId, req.userId!);
        return res.status(200).json({ message: "List deleted", listId });
    } catch (error) {
        return handleError(res, error);
    }
};

export const changeOrder = async (req: Request, res: Response) => {
    try {
        const parsed = ChangeListOrderSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const listId = parseInt(req.params["listId"] as string);
        const { afterListId, beforeListId } = parsed.data.body;
        const list = await listService.changeListOrder(boardId, listId, req.userId!, afterListId, beforeListId);
        return res.status(200).json({ list });
    } catch (error) {
        return handleError(res, error);
    }
};
