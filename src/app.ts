import { Hono } from "hono";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "nut-house-portal-api",
    environment: c.env?.ENVIRONMENT ?? "test",
  });
});
