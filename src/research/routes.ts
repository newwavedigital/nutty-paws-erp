import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1ResearchStore } from "./d1-store";
import {
  archiveResearchRequest,
  appendResearchRequestComment,
  appendResearchRequestNote,
  completeResearchRequest,
  createResearchRequest,
  exportResearchRequestsCsv,
  listResearchRequests,
  readResearchRequest,
  reopenResearchRequest,
  updateResearchRequest,
  type ResearchRequestListStatus,
  type ResearchStore,
} from "./service";

type StoreFactory = (db: D1Database) => ResearchStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

const allowedStatuses = new Set<ResearchRequestListStatus>(["queue", "completed", "archived", "all"]);

export function registerResearchRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1ResearchStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/research/requests", async (c) => {
    await requireResearchAccess(c, createAuthStore);
    const status = asStatusFilter(c.req.query("status"));
    return ok(c, await listResearchRequests(createStore(c.env?.DB), status));
  });

  app.get("/api/research/requests/export.csv", async (c) => {
    await requireResearchAccess(c, createAuthStore);
    const status = asStatusFilter(c.req.query("status"));
    const csv = await exportResearchRequestsCsv(createStore(c.env?.DB), status);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="research-requests.csv"',
      },
    });
  });

  app.get("/api/research/requests/:requestId", async (c) => {
    await requireResearchAccess(c, createAuthStore);
    return ok(c, await readResearchRequest(createStore(c.env?.DB), c.req.param("requestId")));
  });

  app.post("/api/research/requests", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const request = await createResearchRequest(createStore(c.env?.DB), {
      customerId: asString(body.customerId, "customerId"),
      packagingType: asString(body.packagingType, "packagingType"),
      unitsRequested: asPositiveNumber(body.unitsRequested, "unitsRequested"),
      productDescription: asString(body.productDescription, "productDescription"),
      workingNote: optionalString(body.workingNote, "workingNote"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });

  app.patch("/api/research/requests/:requestId", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const request = await updateResearchRequest(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      customerId: optionalString(body.customerId, "customerId"),
      packagingType: optionalNullableString(body.packagingType, "packagingType"),
      unitsRequested: optionalNullableNumber(body.unitsRequested, "unitsRequested"),
      productDescription: optionalString(body.productDescription, "productDescription"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });

  app.post("/api/research/requests/:requestId/notes", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const note = await appendResearchRequestNote(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      note: asString(body.note, "note"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, note);
  });

  app.post("/api/research/requests/:requestId/comments", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const comment = await appendResearchRequestComment(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      comment: asString(body.comment, "comment"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, comment);
  });

  app.post("/api/research/requests/:requestId/complete", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const request = await completeResearchRequest(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });

  app.post("/api/research/requests/:requestId/reopen", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const request = await reopenResearchRequest(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });

  app.post("/api/research/requests/:requestId/archive", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const request = await archiveResearchRequest(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });

  app.delete("/api/research/requests/:requestId", async (c) => {
    const auth = await requireResearchAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const request = await archiveResearchRequest(createStore(c.env?.DB), {
      requestId: c.req.param("requestId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, request);
  });
}

async function requireResearchAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireEmployee(auth);
  return auth;
}

async function optionalJsonObject(c: Context<AppBindings>) {
  if (!c.req.header("content-type")) {
    return {};
  }

  return parseJsonObject(c);
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function asStatusFilter(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "queue";
  if (!allowedStatuses.has(value as ResearchRequestListStatus)) {
    throw new ValidationError("status is invalid", { fields: ["status"] });
  }
  return value as ResearchRequestListStatus;
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }
  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  return asString(value, field);
}

function optionalNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asString(value, field);
}

function asPositiveNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} must be greater than zero`, { fields: [field] });
  }
  return value;
}

function optionalNullableNumber(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asPositiveNumber(value, field);
}
