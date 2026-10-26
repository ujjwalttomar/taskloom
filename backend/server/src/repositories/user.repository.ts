import prisma from "../../../../shared/db/client";

export const findUserById = (id: number) =>
    prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, googleId: true, createdAt: true },
    });

export const findUserByIdFull = (id: number) =>
    prisma.user.findUnique({ where: { id } });

export const findUserByEmail = (email: string) =>
    prisma.user.findUnique({ where: { email } });

export const createUser = (data: { email: string; name: string; googleId?: string }) =>
    prisma.user.create({ data });
