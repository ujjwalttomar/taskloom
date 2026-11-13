import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/__tests__/**/*.test.ts"],
        setupFiles: ["src/__tests__/setup.ts"],
        testTimeout: 30000,
    },
    resolve: {
        alias: {
            "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
        },
    },
});
