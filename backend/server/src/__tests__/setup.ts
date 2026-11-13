// Test setup — runs before every test file.
// Loads .env and mocks external dependencies (Redis, email).

import { vi, beforeEach } from "vitest";
import dotenv from "dotenv";
import path from "path";

// ── Load environment variables from .env ─────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Override specific env vars for test ──────────────────────────────────────
process.env.NODE_ENV = "test";

// ── Mock ioredis (so tests don't need a live Redis) ──────────────────────────
vi.mock("ioredis", () => {
    const RedisMock = vi.fn(() => ({
        publish: vi.fn().mockResolvedValue(1),
        subscribe: vi.fn(),
        on: vi.fn(),
        status: "ready",
    }));
    return { default: RedisMock };
});

// ── Mock Redis publisher (our wrapper) ───────────────────────────────────────
vi.mock("../redis", () => ({
    publishBoardEvent: vi.fn(),
}));

// ── Mock sendEmail ───────────────────────────────────────────────────────────
vi.mock("../utils/sendEmail", () => ({
    sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Clear all mocks between tests ────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
});
