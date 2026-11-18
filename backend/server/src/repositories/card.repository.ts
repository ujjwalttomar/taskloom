import prisma from "../../../shared/db/client";
import { publicUser } from "./select";

export const findAllCards = (listId: number) =>
    prisma.card.findMany({ where: { listId }, orderBy: { order: "asc" } });

export const findCardById = (cardId: number) =>
    prisma.card.findUnique({
        where: { id: cardId },
        include: {
            comments: { orderBy: { createdAt: "desc" }, include: { creator: publicUser } },
            assignedTo: { include: { user: publicUser } },
            creator: publicUser,
            list: true,
        },
    });

export const findCardWithList = (cardId: number) =>
    prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });

/** A card only counts as a neighbour if it is in the given list. */
export const findCardInList = (listId: number, cardId: number) =>
    prisma.card.findFirst({ where: { id: cardId, listId } });

/** The card directly after / before a given order value in a list (ignoring the card being moved). */
export const findNextCard = (listId: number, order: number, excludeCardId: number) =>
    prisma.card.findFirst({ where: { listId, order: { gt: order }, id: { not: excludeCardId } }, orderBy: { order: "asc" } });

export const findPrevCard = (listId: number, order: number, excludeCardId: number) =>
    prisma.card.findFirst({ where: { listId, order: { lt: order }, id: { not: excludeCardId } }, orderBy: { order: "desc" } });

/** Last card of a list, optionally ignoring one card (the card being moved). */
export const findLastCardInList = (listId: number, excludeCardId?: number) =>
    prisma.card.findFirst({
        where: { listId, ...(excludeCardId ? { id: { not: excludeCardId } } : {}) },
        orderBy: { order: "desc" },
    });

export const createCard = (data: { title: string; description?: string; listId: number; creatorId: number; order: number }) =>
    prisma.card.create({ data });

export const updateCard = (cardId: number, data: { title?: string; description?: string; listId?: number; order?: number }) =>
    prisma.card.update({ where: { id: cardId }, data });

export const deleteCard = (cardId: number) =>
    prisma.card.delete({ where: { id: cardId } });

export const findAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.findUnique({ where: { cardId_userId: { cardId, userId } } });

export const createAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.create({ data: { cardId, userId }, include: { user: publicUser } });

export const deleteAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.delete({ where: { cardId_userId: { cardId, userId } } });

export const findBoardMemberForCard = (boardId: number, memberId: number) =>
    prisma.boardMember.findUnique({ where: { boardId_memberId: { boardId, memberId } } });
