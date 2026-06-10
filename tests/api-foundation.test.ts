import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createApp } from "../src/app";
import { ok } from "../src/api/responses";
import { parseJsonObject, requireFields } from "../src/api/validation";

describe("API foundation", () => {
  it("wraps health responses in the shared success envelope", async () => {
    const app = createApp();

    const response = await app.request("/api/health", {
      headers: { "x-request-id": "req-health-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        service: "nut-house-portal-api",
        environment: "test",
      },
      meta: {
        requestId: "req-health-1",
      },
    });
  });

  it("returns a shared validation error envelope for bad request bodies", async () => {
    const app = createApp((route) => {
      route.post("/api/test-validation", async (c) => {
        const body = await parseJsonObject(c);
        const fields = requireFields(body, ["name"]);

        return ok(c, { name: fields.name });
      });
    });

    const response = await app.request("/api/test-validation", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-validation-1",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Missing required field: name",
        details: { fields: ["name"] },
      },
      meta: {
        requestId: "req-validation-1",
      },
    });
  });

  it("returns a shared not-found error envelope", async () => {
    const app = createApp();

    const response = await app.request("/api/missing", {
      headers: { "x-request-id": "req-missing-1" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
      meta: {
        requestId: "req-missing-1",
      },
    });
  });

  it("returns a shared internal error envelope for unexpected exceptions", async () => {
    const app = createApp((route: Hono<{ Bindings: Env; Variables: { requestId?: string } }>) => {
      route.get("/api/test-error", () => {
        throw new Error("database went sideways");
      });
    });

    const response = await app.request("/api/test-error", {
      headers: { "x-request-id": "req-error-1" },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
      meta: {
        requestId: "req-error-1",
      },
    });
  });
});
