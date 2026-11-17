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

    // Scoped to the card's own board: a list on another board simply isn't found
    const tList = await listRepo.findListInBoard(card.list.boardId, targetListId);
    if (!tList) throw new AppError(400, "Target list is not on this board");

    // Neighbours must be other cards in the TARGET list — otherwise their order values are meaningless here
    const neighbour = async (id: number) => {
        if (id === cardId) throw new AppError(400, "A card can't be its own neighbour");
        const n = await repo.findCardInList(targetListId, id);
        if (!n) throw new AppError(400, "Adjacent card is not in the target list");
        return n;
    };

    let newOrder: number;
    if (afterCardId && beforeCardId) {
        const [afterCard, beforeCard] = await Promise.all([neighbour(afterCardId), neighbour(beforeCardId)]);
        newOrder = (afterCard.order + beforeCard.order) / 2;
    } else if (afterCardId) {
        // Place it between `after` and whatever currently follows it (so a single neighbour never causes a tie)
        const after = await neighbour(afterCardId);
        const next = await repo.findNextCard(targetListId, after.order, cardId);
        newOrder = next ? (after.order + next.order) / 2 : after.order + 1;
    } else if (beforeCardId) {
        const before = await neighbour(beforeCardId);
        const prev = await repo.findPrevCard(targetListId, before.order, cardId);
        newOrder = prev ? (prev.order + before.order) / 2 : before.order / 2;
    } else {
        // No neighbours given → append to the end (was order = 1, which collided with existing cards)
        const last = await repo.findLastCardInList(targetListId, cardId);
        newOrder = last ? last.order + 1 : 1;
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

export async function unassignCard(
    cardId: number,
    targetUserId: number,
    boardId: number,
    requesterId: number,
    requesterRole: string,
) {
    // Same rule as assigning: members manage their own assignment, admins manage anyone's
    if (requesterRole !== "ADMIN" && targetUserId !== requesterId) {
        throw new AppError(403, "Can only unassign yourself");
    }
    const existing = await repo.findAssignment(cardId, targetUserId);
    if (!existing) throw new AppError(404, "User is not assigned to this card");
    await repo.deleteAssignment(cardId, targetUserId);
    publishBoardEvent(boardId, requesterId, { type: "card_unassigned", cardId, userId: targetUserId });
}
