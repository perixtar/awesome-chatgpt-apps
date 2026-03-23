import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000, // 30 seconds for server startup/shutdown
    hookTimeout: 30000,
    include: ["server/test/**/*.test.ts"],
  },
});
