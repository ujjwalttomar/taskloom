import prisma from "../../../../shared/db/client";

export const findAllCards = (listId: number) =>
    prisma.card.findMany({ where: { listId }, orderBy: { order: "asc" } });

export const findCardById = (cardId: number) =>
    prisma.card.findUnique({
        where: { id: cardId },
        include: {
            comments: { orderBy: { createdAt: "desc" }, include: { creator: true } },
            assignedTo: { include: { user: true } },
            creator: true,
            list: true,
        },
    });

export const findCardWithList = (cardId: number) =>
    prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });

export const findCardById_simple = (cardId: number) =>
    prisma.card.findUnique({ where: { id: cardId } });

export const findLastCardInList = (listId: number) =>
    prisma.card.findFirst({ where: { listId }, orderBy: { order: "desc" } });

export const createCard = (data: { title: string; description?: string; listId: number; creatorId: number; order: number }) =>
    prisma.card.create({ data });

export const updateCard = (cardId: number, data: { title?: string; description?: string; listId?: number; order?: number }) =>
    prisma.card.update({ where: { id: cardId }, data });

export const deleteCard = (cardId: number) =>
    prisma.card.delete({ where: { id: cardId } });

export const findAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.findUnique({ where: { cardId_userId: { cardId, userId } } });

export const createAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.create({ data: { cardId, userId }, include: { user: true } });

export const deleteAssignment = (cardId: number, userId: number) =>
    prisma.assignedCard.delete({ where: { cardId_userId: { cardId, userId } } });

export const findBoardMemberForCard = (boardId: number, memberId: number) =>
    prisma.boardMember.findUnique({ where: { boardId_memberId: { boardId, memberId } } });
