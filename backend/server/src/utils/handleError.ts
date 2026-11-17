import { Response } from "express";
import { Prisma } from "../../../shared/db/generated/prisma/client";
import { AppError } from "./AppError";

/**
 * Turns any thrown error into a JSON response with a sensible status code.
 * Used by every controller's catch block and by the global error middleware,
 * so the API always answers with { message } — never an HTML error page.
 */
export function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({ message: error.message });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return res.status(404).json({ message: "Not found" });
        if (error.code === "P2002") return res.status(409).json({ message: "Already exists" });
        if (error.code === "P2003") return res.status(400).json({ message: "Referenced record does not exist" });
    }

    // Bad input that slipped past validation (e.g. a string where Prisma expects an Int)
    if (error instanceof Prisma.PrismaClientValidationError) {
        return res.status(400).json({ message: "Invalid request" });
    }

    // Database unreachable (paused Supabase project, wrong URL, network)
    if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error("[db] unavailable:", error.message);
        return res.status(503).json({ message: "Database unavailable, please try again shortly" });
    }

    console.error("[unhandled]", error);
    return res.status(500).json({ message: "Server error" });
}
