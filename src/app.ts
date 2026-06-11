import { Hono } from "hono";
import { ApiError, toApiError } from "./api/errors";
import { fail, ok } from "./api/responses";
import { registerAuthRoutes } from "./auth/routes";
import { registerInventoryRoutes } from "./inventory/routes";
import { registerPurchaseOrderRoutes } from "./purchase-orders/routes";
import { registerUserRoutes } from "./users/routes";
import type { AuthContext } from "./auth/service";

export type AppBindings = { Bindings: Env; Variables: { requestId?: string; auth?: AuthContext } };
export type AppTestEnv = Partial<{ AUTH_REQUIRED: "true" | "false"; ENVIRONMENT: string }>;

export function createApp(configure?: (app: Hono<AppBindings>) => void, testEnv: AppTestEnv = {}) {
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? c.req.header("cf-ray");

    if (requestId) {
      c.set("requestId", requestId);
    }

    if (Object.keys(testEnv).length > 0) {
      const mutableContext = c as unknown as { env?: AppTestEnv };
      mutableContext.env = { ...(mutableContext.env ?? {}), ...testEnv };
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

  registerAuthRoutes(app);
  registerUserRoutes(app);
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
