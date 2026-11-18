import { vi, afterAll } from "vitest";
import prisma from "../../shared/db/client";

// No Redis and no real emails in tests. The mocks are vi.fn()s, so tests can also
// assert WHICH real-time events a request published.
vi.mock("../src/redis", () => ({ publishBoardEvent: vi.fn() }));
vi.mock("../src/utils/sendEmail", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

afterAll(async () => {
    await prisma.$disconnect();
});
