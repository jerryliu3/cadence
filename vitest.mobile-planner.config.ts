import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/shared/src/planner/**/*.test.ts",
      "apps/mobile/src/features/calendar/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@cadence/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});
