import { rateLimit } from "express-rate-limit";

// Simple per-IP rate limiting. Counters live in memory, which is fine for a single
// server instance. If the API ever runs on several instances, switch to a shared store.

const limiter = (windowMinutes: number, limit: number, message: string) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: "draft-7", // RateLimit-* response headers
        legacyHeaders: false,
        message: { message },
        // Automated tests fire many requests quickly; don't limit them
        skip: () => process.env.NODE_ENV === "test",
    });

/** Everything under /api — high enough that normal use never hits it. */
export const apiLimiter = limiter(15, 300, "Too many requests, please slow down and try again in a few minutes");

/** Starting a Google login and its callback (not /auth/me or /auth/refresh, which run on every page load). */
export const loginLimiter = limiter(15, 30, "Too many login attempts, please try again in a few minutes");

/** Sending invites sends emails, so it gets the tightest limit. */
export const inviteLimiter = limiter(60, 20, "Too many invites sent, please try again later");
