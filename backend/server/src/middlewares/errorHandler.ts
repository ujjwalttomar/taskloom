
import { Request, Response, NextFunction } from "express";
import { Prisma } from "../../../../shared/db/generated/prisma/client";
import { AppError } from "../utils/AppError";
import { ZodError } from "zod";

const isDev = process.env.NODE_ENV !== "production";

/** Map Prisma known error codes to HTTP status + user-facing message */
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
    switch (err.code) {
        case "P2025":
            return new AppError(404, "Record not found");
        case "P2002": {
            const field = (err.meta?.target as string[])?.join(", ") ?? "field";
            return new AppError(409, `${field} already exists`);
        }
        case "P2003":
            return new AppError(400, "Referenced record does not exist");
        case "P2016":
            return new AppError(400, "Invalid query");
        default:
            return new AppError(500, "Database error");
    }
}

/** Central error-handling middleware — must be registered after all routes */
export const errorHandler = (
    err: unknown,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction
) => {
    // ── Operational errors (thrown via AppError) ─────────────────────────────
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: "error",
            message: err.message,
            ...(isDev && { stack: err.stack }),
        });
    }

    // ── Prisma known errors ───────────────────────────────────────────────────
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = handlePrismaError(err);
        return res.status(mapped.statusCode).json({
            status: "error",
            message: mapped.message,
            ...(isDev && { prismaCode: err.code, stack: err.stack }),
        });
    }

    // ── Prisma initialization / validation errors ─────────────────────────────
    if (
        err instanceof Prisma.PrismaClientInitializationError ||
        err instanceof Prisma.PrismaClientValidationError
    ) {
        console.error("[Prisma]", err);
        return res.status(503).json({
            status: "error",
            message: "Database unavailable. Please try again shortly.",
            ...(isDev && { detail: (err as Error).message }),
        });
    }

    // ── Zod validation errors ─────────────────────────────────────────────────
    if (err instanceof ZodError) {
        return res.status(400).json({
            status: "error",
            message: "Validation failed",
            errors: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
        });
    }

    // ── Unexpected errors ─────────────────────────────────────────────────────
    console.error("[Unhandled Error]", err);
    return res.status(500).json({
        status: "error",
        message: "Something went wrong. Please try again.",
        ...(isDev && { detail: (err as Error)?.message, stack: (err as Error)?.stack }),
    });
};
