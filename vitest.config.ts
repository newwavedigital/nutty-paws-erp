import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
