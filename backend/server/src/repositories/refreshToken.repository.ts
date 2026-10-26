import prisma from "../../../../shared/db/client";

export const createRefreshToken = (data: { token: string; userId: number; expiresAt: Date }) =>
    prisma.refreshToken.create({ data });

export const findRefreshToken = (token: string) =>
    prisma.refreshToken.findUnique({ where: { token } });

export const deleteRefreshToken = (token: string) =>
    prisma.refreshToken.deleteMany({ where: { token } });
