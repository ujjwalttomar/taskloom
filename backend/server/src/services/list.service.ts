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
    const list = await repo.updateList(listId, { title });
    publishBoardEvent(boardId, userId, { type: "list_edited", list });
    return list;
}

export async function deleteList(boardId: number, listId: number, userId: number) {
    await repo.deleteList(listId);
    publishBoardEvent(boardId, userId, { type: "list_deleted", listId });
}

export async function changeListOrder(
    boardId: number,
    listId: number,
    userId: number,
    afterListId?: number,
    beforeListId?: number,
) {
    let newOrder: number;

    if (afterListId && beforeListId) {
        const [afterList, beforeList] = await Promise.all([
            repo.findListById(afterListId),
            repo.findListById(beforeListId),
        ]);
        if (!afterList || !beforeList) throw new AppError(404, "Adjacent list not found");
        newOrder = (afterList.order + beforeList.order) / 2;
    } else if (afterListId) {
        const afterList = await repo.findListById(afterListId);
        if (!afterList) throw new AppError(404, "List not found");
        newOrder = afterList.order + 1;
    } else if (beforeListId) {
        const beforeList = await repo.findListById(beforeListId);
        if (!beforeList) throw new AppError(404, "List not found");
        newOrder = beforeList.order / 2;
    } else {
        throw new AppError(400, "Provide afterListId or beforeListId");
    }

    const list = await repo.updateList(listId, { order: newOrder });
    publishBoardEvent(boardId, userId, { type: "list_reordered", list });
    return list;
}
