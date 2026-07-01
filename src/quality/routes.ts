import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuthWhenEnabled } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1QualityStore } from "./d1-store";
import {
  attachPostShipmentCoa,
  listQualityQueue,
  releaseQualityPurchaseOrder,
  skipQualityPurchaseOrder,
  updateQualityNotes,
  type QualityStore,
} from "./service";

type StoreFactory = (db: D1Database) => QualityStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerQualityRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1QualityStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/quality/queue", async (c) => {
    await requireQualityAccess(c, createAuthStore);
    return ok(c, await listQualityQueue(createStore(c.env?.DB)));
  });

  app.post("/api/quality/purchase-orders/:purchaseOrderId/release", async (c) => {
    const auth = await requireQualityAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await releaseQualityPurchaseOrder(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      coaFileId: asString(body.coaFileId, "coaFileId"),
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });

  app.post("/api/quality/purchase-orders/:purchaseOrderId/skip", async (c) => {
    const auth = await requireQualityAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await skipQualityPurchaseOrder(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      reason: asString(body.reason, "reason"),
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });

  app.post("/api/quality/purchase-orders/:purchaseOrderId/post-shipment-coa", async (c) => {
    const auth = await requireQualityAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await attachPostShipmentCoa(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      coaFileId: asString(body.coaFileId, "coaFileId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });

  app.patch("/api/quality/purchase-orders/:purchaseOrderId/notes", async (c) => {
    const auth = await requireQualityAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await updateQualityNotes(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });
}

async function requireQualityAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireAnyRole(auth, ["Production", "Warehousing"]);
  return auth;
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }
  return value;
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, field);
}
