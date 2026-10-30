
import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<any>;

/**
 * Wraps an async route handler so any thrown error is forwarded to next(err).
 * Eliminates try/catch boilerplate in every controller.
 */
export const asyncHandler = (fn: AsyncFn): RequestHandler =>
    (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
