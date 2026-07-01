import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
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
