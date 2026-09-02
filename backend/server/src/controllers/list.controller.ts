import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { publishBoardEvent } from "../redis";

export const getAllLists = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const lists = await prisma.list.findMany({
            where: { boardId },
            orderBy: { order: "asc" },
            include: { cards: { orderBy: { order: "asc" } } },
        });
        return res.status(200).json({ lists });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const createList = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const { title } = req.body;
        if (!title) return res.status(400).json({ message: "List title is missing" });

        const lastList = await prisma.list.findFirst({
            where: { boardId },
            orderBy: { order: "desc" },
        });
        const order = lastList ? lastList.order + 1 : 1;

        const list = await prisma.list.create({ data: { title, boardId, order } });
        publishBoardEvent(boardId, req.userId!, { type: "list_created", list });
        return res.status(201).json({ message: "List created", list });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const editList = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const listId = parseInt(req.params.listId as string);
        const { title } = req.body;

        const list = await prisma.list.update({ where: { id: listId }, data: { title } });
        publishBoardEvent(boardId, req.userId!, { type: "list_edited", list });
        return res.status(200).json({ list });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteList = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const listId = parseInt(req.params.listId as string);

        await prisma.list.delete({ where: { id: listId } });
        publishBoardEvent(boardId, req.userId!, { type: "list_deleted", listId });
        return res.status(200).json({ message: "List deleted", listId });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

export const changeOrder = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params.boardId as string);
        const listId = parseInt(req.params.listId as string);
        const { afterListId, beforeListId } = req.body;

        let newOrder: number;

        if (afterListId && beforeListId) {
            const afterList = await prisma.list.findUnique({ where: { id: afterListId } });
            const beforeList = await prisma.list.findUnique({ where: { id: beforeListId } });
            if (!afterList || !beforeList) {
                return res.status(404).json({ message: "Adjacent list not found" });
            }
            newOrder = (afterList.order + beforeList.order) / 2;
        } else if (afterListId) {
            const afterList = await prisma.list.findUnique({ where: { id: afterListId } });
            if (!afterList) return res.status(404).json({ message: "List not found" });
            newOrder = afterList.order + 1;
        } else if (beforeListId) {
            const beforeList = await prisma.list.findUnique({ where: { id: beforeListId } });
            if (!beforeList) return res.status(404).json({ message: "List not found" });
            newOrder = beforeList.order / 2;
        } else {
            return res.status(400).json({ message: "Provide afterListId or beforeListId" });
        }

        const list = await prisma.list.update({
            where: { id: listId },
            data: { order: newOrder },
        });
        publishBoardEvent(boardId, req.userId!, { type: "list_reordered", list });
        return res.status(200).json({ list });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};
