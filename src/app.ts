import { Hono } from "hono";
import { ApiError, toApiError } from "./api/errors";
import { fail, ok } from "./api/responses";
import { registerInventoryRoutes } from "./inventory/routes";
import { registerPurchaseOrderRoutes } from "./purchase-orders/routes";

export type AppBindings = { Bindings: Env; Variables: { requestId?: string } };

export function createApp(configure?: (app: Hono<AppBindings>) => void) {
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? c.req.header("cf-ray");

    if (requestId) {
      c.set("requestId", requestId);
    }

    await next();
  });

  app.get("/api/health", (c) => {
    return ok(c, {
      service: "nut-house-portal-api",
      environment: c.env?.ENVIRONMENT ?? "test",
    });
  });

  configure?.(app);

  registerPurchaseOrderRoutes(app);
  registerInventoryRoutes(app);

  app.notFound((c) => {
    return fail(c, new ApiError("NOT_FOUND", "Route not found", 404));
  });

  app.onError((error, c) => {
    return fail(c, toApiError(error));
  });

  return app;
}

export const app = createApp();
