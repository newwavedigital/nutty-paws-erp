import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("health route", () => {
  it("returns service status for API health checks", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        service: "nut-house-portal-api",
        environment: "test",
      },
      meta: {
        requestId: null,
      },
    });
  });
});
