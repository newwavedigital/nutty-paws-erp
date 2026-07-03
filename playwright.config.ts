import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 8789);
const persistDir = process.env.E2E_D1_DIR || ".tmp/e2e-d1";
const reuseServer = process.env.E2E_REUSE_SERVER === "true";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: reuseServer
    ? undefined
    : {
        command: `powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '${persistDir}') { Remove-Item -Recurse -Force '${persistDir}' }; New-Item -ItemType Directory -Force '${persistDir}' | Out-Null; $env:CI='1'; npx wrangler d1 migrations apply nut-house-portal-staging-db --local --persist-to '${persistDir}' --env staging; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx wrangler dev --local --port ${port} --persist-to '${persistDir}' --env staging"`,
        url: `http://127.0.0.1:${port}/api/health`,
        timeout: 120_000,
        reuseExistingServer: false,
      },
});
