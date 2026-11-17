import * as repo from "../repositories/list.repository";
import { publishBoardEvent } from "../redis";
import { AppError } from "../utils/AppError";

export async function getAllLists(boardId: number) {
    return repo.findAllLists(boardId);
}

export async function createList(boardId: number, userId: number, title: string) {
    const lastList = await repo.findLastListInBoard(boardId);
    const order = lastList ? lastList.order + 1 : 1;
    const list = await repo.createList({ title, boardId, order });
    publishBoardEvent(boardId, userId, { type: "list_created", list });
    return list;
}

export async function editList(boardId: number, listId: number, userId: number, title: string) {
    const list = await repo.updateListInBoard(boardId, listId, { title });
    if (!list) throw new AppError(404, "List not found");
    publishBoardEvent(boardId, userId, { type: "list_edited", list });
    return list;
}

export async function deleteList(boardId: number, listId: number, userId: number) {
    const deleted = await repo.deleteListInBoard(boardId, listId);
    if (!deleted) throw new AppError(404, "List not found");
    publishBoardEvent(boardId, userId, { type: "list_deleted", listId });
}

export async function changeListOrder(
    boardId: number,
    listId: number,
    userId: number,
    afterListId?: number,
    beforeListId?: number,
) {
    // Neighbours must be on the same board, otherwise their order values mean nothing here
    const neighbour = async (id: number) => {
        const list = await repo.findListInBoard(boardId, id);
        if (!list) throw new AppError(400, "Adjacent list is not on this board");
        return list;
    };

    let newOrder: number;
    if (afterListId && beforeListId) {
        const [afterList, beforeList] = await Promise.all([neighbour(afterListId), neighbour(beforeListId)]);
        newOrder = (afterList.order + beforeList.order) / 2;
    } else if (afterListId) {
        newOrder = (await neighbour(afterListId)).order + 1;
    } else if (beforeListId) {
        newOrder = (await neighbour(beforeListId)).order / 2;
    } else {
        throw new AppError(400, "Provide afterListId or beforeListId");
    }

    const list = await repo.updateListInBoard(boardId, listId, { order: newOrder });
    if (!list) throw new AppError(404, "List not found");
    publishBoardEvent(boardId, userId, { type: "list_reordered", list });
    return list;
}
