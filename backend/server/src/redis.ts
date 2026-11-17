import Redis from "ioredis";

let publisher: Redis | null = null;

// Created lazily: this module is imported before dotenv.config() runs, so reading
// REDIS_URL at import time would miss values that come from a local .env file.
function getPublisher(): Redis {
    if (!publisher) {
        publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
            // Give up on a queued publish quickly instead of holding it for ~a minute
            maxRetriesPerRequest: 3,
        });
        // Without a listener ioredis prints "Unhandled error event" on every reconnect attempt
        publisher.on("error", (err) => console.error("[redis] publisher error:", err.message));
    }
    return publisher;
}

/**
 * Fire-and-forget: real-time updates are best-effort. If Redis is down the HTTP
 * request has already succeeded, so a failed publish is logged — never thrown.
 * (An unhandled rejection here used to crash the whole API process.)
 */
export function publishBoardEvent(boardId: number, senderId: number, event: object) {
    getPublisher()
        .publish("board-events", JSON.stringify({ boardId, senderId, ...event }))
        .catch((err) => console.error("[redis] publish failed:", err.message));
}
