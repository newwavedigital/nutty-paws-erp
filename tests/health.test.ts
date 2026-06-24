import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("health route", () => {
  it("returns service status and version for API health checks", async () => {
    const testApp = createApp(undefined, { ENVIRONMENT: "test", AUTH_REQUIRED: "false" });
    const response = await testApp.request("/api/health", {
      headers: { "x-request-id": "req-health-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        service: "nut-house-portal-api",
        environment: "test",
        version: "0.0.0-test",
      },
      meta: {
        requestId: "req-health-1",
      },
    });
  });

  it("returns the configured app version when env vars are provided", async () => {
    const stagedApp = createApp(undefined, { ENVIRONMENT: "staging", APP_VERSION: "1.0.0-staging.1" });
    const response = await stagedApp.request("/api/health", {
      headers: { "x-request-id": "req-health-2" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        service: "nut-house-portal-api",
        environment: "staging",
        version: "1.0.0-staging.1",
      },
      meta: {
        requestId: "req-health-2",
      },
    });
  });
});
