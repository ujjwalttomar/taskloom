import { defineConfig } from "vitest/config";
import { config as loadEnvFile } from "dotenv";

// The tests create real rows (users, workspaces, boards…) in the database they run against.
// So they only ever use TEST_DATABASE_URL, never DATABASE_URL, and only if it points at a
// local database whose name ends in "_test". That makes running them against Supabase
// (or your dev database) impossible by accident.
loadEnvFile({ path: ".env.test", quiet: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Create backend/server/.env.test (see .env.test.example).");
}
const { hostname, pathname } = new URL(url);
if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_test")) {
    throw new Error(`Refusing to run tests: TEST_DATABASE_URL must be a local *_test database (got ${hostname}${pathname}).`);
}

// Set here (not only in test.env) so globalSetup, which runs in this process, sees them too
Object.assign(process.env, {
    NODE_ENV: "test", // also switches the rate limiters off (rateLimit.test.ts turns them back on)
    DATABASE_URL: url,
    DIRECT_URL: url,
    JWT_SECRET: "test-secret-not-used-anywhere-else",
    FRONTEND_URL: "http://localhost:5173",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/auth/google/callback",
    RESEND_API_KEY: "",
});

export default defineConfig({
    test: {
        globalSetup: ["tests/globalSetup.ts"],
        setupFiles: ["tests/setup.ts"],
        // One file at a time: every file shares the one test database
        fileParallelism: false,
        testTimeout: 15000,
    },
});
