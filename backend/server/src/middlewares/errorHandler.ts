import { Request, Response, NextFunction } from "express";
import { handleError } from "../utils/handleError";

/** Unknown routes get a JSON 404 instead of Express's HTML page. */
export const notFound = (req: Request, res: Response) => {
    res.status(404).json({ message: `Cannot ${req.method} ${req.path}` });
};

/**
 * Last middleware in the chain. Catches errors thrown or forwarded by
 * middlewares (Express 5 forwards rejected promises automatically) and
 * body-parser errors such as malformed JSON.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const type = (err as { type?: string })?.type;
    if (type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
    if (type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
    return handleError(res, err);
};
