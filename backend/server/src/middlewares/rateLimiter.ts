import rateLimit from "express-rate-limit";

// ── Global limiter ──────────────────────────────────────────────────────────
// Applies to ALL routes. 200 requests per 15 minutes per IP.
// Generous enough for normal usage, stops brute-force attacks.
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 200,
    standardHeaders: "draft-7", // RateLimit-* headers (RFC draft-7)
    legacyHeaders: false, // Disable X-RateLimit-* headers
    message: {
        status: "error",
        message: "Too many requests. Please try again later.",
    },
    // Skip rate limiting for health check endpoints
    skip: (req) => req.path === "/health" || req.path === "/health/db",
});

// ── Auth limiter ────────────────────────────────────────────────────────────
// Applies to /auth/* routes. 20 requests per 15 minutes per IP.
// Prevents brute-force token refresh and OAuth abuse.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many authentication attempts. Please try again later.",
    },
});

// ── Invite limiter ──────────────────────────────────────────────────────────
// Applies to POST /workspaces/:id/invites. 10 requests per hour per IP.
// Prevents email spam abuse through the invite system.
export const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many invites sent. Please try again later.",
    },
});

// ── Account creation limiter ────────────────────────────────────────────────
// Applies to the OAuth callback. 5 per hour per IP.
// Prevents mass account creation.
export const accountCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many account creation attempts. Please try again later.",
    },
});
