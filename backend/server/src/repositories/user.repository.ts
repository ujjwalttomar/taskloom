import prisma from "../../../shared/db/client";

export const findUserById = (id: number) =>
    prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, googleId: true, createdAt: true },
    });

export const findUserByIdFull = (id: number) =>
    prisma.user.findUnique({ where: { id } });

// Case-insensitive so "John@Gmail.com" and "john@gmail.com" are the same person
// (rows created before emails were lower-cased still match)
export const findUserByEmail = (email: string) =>
    prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });

export const createUser = (data: { email: string; name: string; googleId?: string }) =>
    prisma.user.create({ data });
