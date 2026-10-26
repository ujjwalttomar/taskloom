import * as repo from "../repositories/card.repository";
import * as listRepo from "../repositories/list.repository";
import { publishBoardEvent } from "../redis";
import { AppError } from "../utils/AppError";

export async function getAllCards(listId: number) {
    return repo.findAllCards(listId);
}

export async function getCard(cardId: number) {
    const card = await repo.findCardById(cardId);
    if (!card) throw new AppError(404, "Card not found");
    return card;
}

export async function createCard(listId: number, boardId: number, userId: number, title: string, description?: string) {
    const lastCard = await repo.findLastCardInList(listId);
    const order = lastCard ? lastCard.order + 1 : 1;
    const card = await repo.createCard({ title, description, listId, creatorId: userId, order });
    publishBoardEvent(boardId, userId, { type: "card_created", card });
    return card;
}

export async function editCard(cardId: number, boardId: number, userId: number, data: { title?: string; description?: string }) {
    const card = await repo.updateCard(cardId, data);
    publishBoardEvent(boardId, userId, { type: "card_edited", card });
    return card;
}

export async function deleteCard(cardId: number, boardId: number, userId: number) {
    await repo.deleteCard(cardId);
    publishBoardEvent(boardId, userId, { type: "card_deleted", cardId });
}

export async function moveCard(
    cardId: number,
    userId: number,
    targetListId: number,
    afterCardId?: number,
    beforeCardId?: number,
) {
    const card = await repo.findCardWithList(cardId);
    if (!card) throw new AppError(404, "Card not found");

    const tList = await listRepo.findListById(targetListId);
    if (!tList) throw new AppError(404, "Target list not found");
    if (tList.boardId !== card.list.boardId) throw new AppError(400, "Cannot move card to a different board");

    let newOrder: number;
    if (afterCardId && beforeCardId) {
        const [afterCard, beforeCard] = await Promise.all([
            repo.findCardById_simple(afterCardId),
            repo.findCardById_simple(beforeCardId),
        ]);
        if (!afterCard || !beforeCard) throw new AppError(404, "Adjacent card not found");
        newOrder = (afterCard.order + beforeCard.order) / 2;
    } else if (afterCardId) {
        const afterCard = await repo.findCardById_simple(afterCardId);
        if (!afterCard) throw new AppError(404, "Card not found");
        newOrder = afterCard.order + 1;
    } else if (beforeCardId) {
        const beforeCard = await repo.findCardById_simple(beforeCardId);
        if (!beforeCard) throw new AppError(404, "Card not found");
        newOrder = beforeCard.order / 2;
    } else {
        newOrder = 1;
    }

    const updatedCard = await repo.updateCard(cardId, { listId: targetListId, order: newOrder });
    publishBoardEvent(card.list.boardId, userId, { type: "card_moved", card: updatedCard });
    return updatedCard;
}

export async function assignCard(
    cardId: number,
    boardId: number,
    targetUserId: number,
    requesterId: number,
    requesterRole: string,
) {
    const boardMembership = await repo.findBoardMemberForCard(boardId, targetUserId);
    if (!boardMembership) throw new AppError(403, "User is not a board member");

    const isAdmin = requesterRole === "ADMIN";
    const isSelfAssign = targetUserId === requesterId;
    if (!isAdmin && !isSelfAssign) throw new AppError(403, "Can only assign yourself");

    const existing = await repo.findAssignment(cardId, targetUserId);
    if (existing) throw new AppError(409, "User already assigned");

    const assignment = await repo.createAssignment(cardId, targetUserId);
    publishBoardEvent(boardId, requesterId, { type: "card_assigned", cardId, assignment });
    return assignment;
}

export async function unassignCard(cardId: number, targetUserId: number, boardId: number, requesterId: number) {
    await repo.deleteAssignment(cardId, targetUserId);
    publishBoardEvent(boardId, requesterId, { type: "card_unassigned", cardId, userId: targetUserId });
}
