/// <reference types="vitest/globals" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
    include: ["src/**/*.test.ts"],
  },
});
