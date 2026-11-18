import { execSync } from "child_process";

// Runs once before all test files: create any missing tables in the test database from
// schema.prisma. Plain `db push` never deletes data. If the schema ever needs a
// destructive change, it stops with an error, and you reset the test DB yourself.
//
// Nothing is wiped between runs: every test creates its own users with unique emails,
// so tests never depend on an empty database or on each other.
export default function setup() {
    execSync("npx prisma db push --skip-generate --schema=../shared/db/prisma/schema.prisma", {
        env: process.env, // DATABASE_URL was set to TEST_DATABASE_URL in vitest.config.ts
        stdio: "pipe",
    });
}
