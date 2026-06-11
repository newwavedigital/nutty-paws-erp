import type { Hono } from "hono";
import { ApiError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "./d1-store";
import {
  AuthError,
  createFirstAdmin,
  loginUser,
  serializeAuthContext,
  verifySessionToken,
  type AuthStore,
} from "./service";

export type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerAuthRoutes(
  app: Hono<AppBindings>,
  createStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/auth/setup-status", async (c) => {
    const store = createStore(c.env?.DB);
    return ok(c, { needsSetup: (await store.countUsers()) === 0 });
  });

  app.post("/api/auth/setup", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["email", "password", "displayName"]);
    return ok(
      c,
      await createFirstAdmin(createStore(c.env?.DB), {
        email: asString(fields.email, "email"),
        password: asString(fields.password, "password"),
        displayName: asString(fields.displayName, "displayName"),
      }),
    );
  });

  app.post("/api/auth/login", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["email", "password"]);
    return ok(c, await loginUser(createStore(c.env?.DB), asString(fields.email, "email"), asString(fields.password, "password")));
  });

  app.get("/api/auth/me", async (c) => {
    return ok(c, serializeAuthContext(await requireBearerAuth(c.req.header("authorization"), createStore(c.env?.DB))));
  });

  app.post("/api/auth/logout", async (c) => {
    const store = createStore(c.env?.DB);
    const context = await requireBearerAuth(c.req.header("authorization"), store);
    if (context.sessionId) await store.revokeSession(context.sessionId);
    return ok(c, { revoked: true });
  });
}

export async function requireBearerAuth(authorization: string | undefined, store: AuthStore) {
  const token = parseBearerToken(authorization);
  return verifySessionToken(store, token);
}

export function parseBearerToken(authorization: string | undefined) {
  if (!authorization) throw new AuthError("UNAUTHORIZED", "Authentication is required");
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) throw new AuthError("UNAUTHORIZED", "Authentication is required");
  return token;
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a non-empty string`, 400, { fields: [field] });
  }

  return value;
}
