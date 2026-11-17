import { AppError } from "./AppError";

/** Parses a numeric route param. Throws a 400 instead of passing NaN to Prisma. */
export function parseId(value: unknown, name = "id"): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, `Invalid ${name}`);
    return id;
}
