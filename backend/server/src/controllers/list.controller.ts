
import { Request, Response } from "express";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { publishBoardEvent } from "../redis";

export const getAllLists = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);

    const lists = await prisma.list.findMany({
        where: { boardId },
        orderBy: { order: "asc" },
        include: { cards: { orderBy: { order: "asc" } } }
    });

    return res.status(200).json({ lists });
});


export const createList = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const { title } = req.body;

    if (!title) throw new AppError(400, "List title is required");

    const lastList = await prisma.list.findFirst({ where: { boardId }, orderBy: { order: "desc" } });
    const order = lastList ? lastList.order + 1 : 1;

    const list = await prisma.list.create({ data: { title, boardId, order } });

    publishBoardEvent(boardId, req.userId!, { type: "list_created", list });

    return res.status(201).json({ message: "List created", list });
});


export const editList = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const listId = parseInt(req.params.listId as string);
    const { title } = req.body;

    const list = await prisma.list.update({ where: { id: listId }, data: { title } });

    publishBoardEvent(boardId, req.userId!, { type: "list_edited", list });

    return res.status(200).json({ list });
});


export const deleteList = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const listId = parseInt(req.params.listId as string);

    await prisma.list.delete({ where: { id: listId } });

    publishBoardEvent(boardId, req.userId!, { type: "list_deleted", listId });

    return res.status(200).json({ message: "List deleted", listId });
});


export const changeOrder = asyncHandler(async (req, res) => {
    const boardId = parseInt(req.params.boardId as string);
    const listId = parseInt(req.params.listId as string);
    const { afterListId, beforeListId } = req.body;

    let newOrder: number;

    if (afterListId && beforeListId) {
        const [afterList, beforeList] = await Promise.all([
            prisma.list.findUnique({ where: { id: afterListId } }),
            prisma.list.findUnique({ where: { id: beforeListId } }),
        ]);
        if (!afterList || !beforeList) throw new AppError(404, "Adjacent list not found");
        newOrder = (afterList.order + beforeList.order) / 2;

    } else if (afterListId) {
        const afterList = await prisma.list.findUnique({ where: { id: afterListId } });
        if (!afterList) throw new AppError(404, "List not found");
        newOrder = afterList.order + 1;

    } else if (beforeListId) {
        const beforeList = await prisma.list.findUnique({ where: { id: beforeListId } });
        if (!beforeList) throw new AppError(404, "List not found");
        newOrder = beforeList.order / 2;

    } else {
        throw new AppError(400, "Provide afterListId or beforeListId");
    }

    const list = await prisma.list.update({ where: { id: listId }, data: { order: newOrder } });

    publishBoardEvent(boardId, req.userId!, { type: "list_reordered", list });

    return res.status(200).json({ list });
});
