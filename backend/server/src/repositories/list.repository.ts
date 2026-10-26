import prisma from "../../../../shared/db/client";

export const findAllLists = (boardId: number) =>
    prisma.list.findMany({
        where: { boardId },
        orderBy: { order: "asc" },
        include: { cards: { orderBy: { order: "asc" } } },
    });

export const findListById = (listId: number) =>
    prisma.list.findUnique({ where: { id: listId } });

export const findLastListInBoard = (boardId: number) =>
    prisma.list.findFirst({ where: { boardId }, orderBy: { order: "desc" } });

export const createList = (data: { title: string; boardId: number; order: number }) =>
    prisma.list.create({ data });

export const updateList = (listId: number, data: { title?: string; order?: number }) =>
    prisma.list.update({ where: { id: listId }, data });

export const deleteList = (listId: number) =>
    prisma.list.delete({ where: { id: listId } });
