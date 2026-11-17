import prisma from "../../../shared/db/client";

export const findAllLists = (boardId: number) =>
    prisma.list.findMany({
        where: { boardId },
        orderBy: { order: "asc" },
        include: { cards: { orderBy: { order: "asc" } } },
    });

// Every lookup is scoped to the board: a list id from another board must never match.
export const findListInBoard = (boardId: number, listId: number) =>
    prisma.list.findFirst({ where: { id: listId, boardId } });

export const findLastListInBoard = (boardId: number) =>
    prisma.list.findFirst({ where: { boardId }, orderBy: { order: "desc" } });

export const createList = (data: { title: string; boardId: number; order: number }) =>
    prisma.list.create({ data });

/** Returns the updated list, or null if the list doesn't belong to this board. */
export const updateListInBoard = async (boardId: number, listId: number, data: { title?: string; order?: number }) => {
    const { count } = await prisma.list.updateMany({ where: { id: listId, boardId }, data });
    return count === 0 ? null : prisma.list.findUnique({ where: { id: listId } });
};

/** Returns true if a list was deleted (false = not in this board). */
export const deleteListInBoard = async (boardId: number, listId: number) => {
    const { count } = await prisma.list.deleteMany({ where: { id: listId, boardId } });
    return count > 0;
};
