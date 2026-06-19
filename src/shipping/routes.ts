import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuthWhenEnabled } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1ShippingStore } from "./d1-store";
import {
  listShippingLogs,
  listShippingQueue,
  markPurchaseOrderShipped,
  markPurchaseOrderStocked,
  updateShippingDetails,
  type ShippingStore,
} from "./service";

type StoreFactory = (db: D1Database) => ShippingStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerShippingRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1ShippingStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/shipping/queue", async (c) => {
    await requireShippingAccess(c, createAuthStore);
    return ok(c, await listShippingQueue(createStore(c.env?.DB)));
  });

  app.get("/api/shipping/logs", async (c) => {
    await requireShippingAccess(c, createAuthStore);
    return ok(c, await listShippingLogs(createStore(c.env?.DB)));
  });

  app.patch("/api/shipping/purchase-orders/:purchaseOrderId/details", async (c) => {
    await requireShippingAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const details = await updateShippingDetails(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      bolNumber: optionalString(body.bolNumber, "bolNumber"),
      proNumber: optionalString(body.proNumber, "proNumber"),
      carrier: optionalString(body.carrier, "carrier"),
      freightClass: optionalString(body.freightClass, "freightClass"),
      notes: optionalString(body.notes, "notes"),
      palletListJson: optionalString(body.palletListJson, "palletListJson"),
      shipmentDocumentFileId: optionalString(body.shipmentDocumentFileId, "shipmentDocumentFileId"),
    });
    return ok(c, details);
  });

  app.post("/api/shipping/purchase-orders/:purchaseOrderId/mark-shipped", async (c) => {
    const auth = await requireShippingAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await markPurchaseOrderShipped(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      bolNumber: optionalString(body.bolNumber, "bolNumber"),
      proNumber: optionalString(body.proNumber, "proNumber"),
      carrier: optionalString(body.carrier, "carrier"),
      freightClass: optionalString(body.freightClass, "freightClass"),
      notes: optionalString(body.notes, "notes"),
      palletListJson: optionalString(body.palletListJson, "palletListJson"),
      shipmentDocumentFileId: optionalString(body.shipmentDocumentFileId, "shipmentDocumentFileId"),
      confirmMissingCarrierBol: optionalBoolean(body.confirmMissingCarrierBol, "confirmMissingCarrierBol"),
      weight: optionalNumber(body.weight, "weight") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });

  app.post("/api/shipping/purchase-orders/:purchaseOrderId/mark-stocked", async (c) => {
    const auth = await requireShippingAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const po = await markPurchaseOrderStocked(createStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });
}

async function requireShippingAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireAnyRole(auth, ["Production", "Warehousing"]);
  return auth;
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, { fields: [field] });
  }
  return value;
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean`, { fields: [field] });
  }
  return value;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`, { fields: [field] });
  }
  return value;
}
