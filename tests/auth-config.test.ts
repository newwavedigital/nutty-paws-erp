import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("auth config guard", () => {
  it("rejects production-like auth-off configs", async () => {
    const app = createApp(undefined, { ENVIRONMENT: "production", AUTH_REQUIRED: "false" });

    const response = await app.request("/api/health");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_AUTH_CONFIG",
        message: "AUTH_REQUIRED=false is restricted to staging, demo, review, or test environments",
      },
    });
  });

  it("allows staging to keep auth off for demo review", async () => {
    const app = createApp(undefined, { ENVIRONMENT: "staging", AUTH_REQUIRED: "false" });

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { environment: "staging", service: "nut-house-portal-api" },
    });
  });

  it("rejects staging bindings on the production custom domain", async () => {
    const app = createApp(undefined, { ENVIRONMENT: "staging", AUTH_REQUIRED: "true" });

    const response = await app.request("https://nuthouseportal.com/api/health");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_DEPLOYMENT_CONFIG",
        message: "Production host is not running with production bindings",
        details: {
          host: "nuthouseportal.com",
          environment: "staging",
        },
      },
    });
  });

  it("rejects production bindings on the staging Worker URL", async () => {
    const app = createApp(undefined, { ENVIRONMENT: "production", AUTH_REQUIRED: "true" });

    const response = await app.request("https://nut-house-portal-staging.henry-b22.workers.dev/api/health");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_DEPLOYMENT_CONFIG",
        message: "Staging host is running with production bindings",
        details: {
          host: "nut-house-portal-staging.henry-b22.workers.dev",
          environment: "production",
        },
      },
    });
  });
});
