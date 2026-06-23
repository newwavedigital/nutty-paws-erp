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
});
