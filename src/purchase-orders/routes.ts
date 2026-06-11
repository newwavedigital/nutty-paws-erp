import type { Context, Hono } from "hono";
import { ok } from "../api/responses";
import { ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { hasCustomerAccess, requireAnyRole, requireAuthWhenEnabled, requireCustomerAccess } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1InventoryStore } from "../inventory/d1-store";
import type { InventoryStore } from "../inventory/service";
import { D1PurchaseOrderStore } from "./d1-store";
import {
  approvePurchaseOrderForProduction,
  createPurchaseOrder,
  listPurchaseOrders,
  readPurchaseOrder,
  reviewPurchaseOrderLineSupplyChain,
  submitPurchaseOrder,
  updatePurchaseOrderDepositStatus,
  updatePurchaseOrderSafeFields,
  type DepositStatus,
  type PurchaseOrderRecord,
  type PurchaseOrderStore,
  type SupplyChainStatus,
} from "./service";

type POStoreFactory = (db: D1Database) => PurchaseOrderStore;
type InventoryStoreFactory = (db: D1Database) => InventoryStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

const depositStatuses = new Set<DepositStatus>(["not_required", "required", "requested", "received", "waived"]);
const supplyChainStatuses = new Set<SupplyChainStatus>(["pending", "available", "needs_ordering", "blocked"]);

export function registerPurchaseOrderRoutes(
  app: Hono<AppBindings>,
  createPOStore: POStoreFactory = (db) => new D1PurchaseOrderStore(db),
  createInventoryStore: InventoryStoreFactory = (db) => new D1InventoryStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/purchase-orders", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const records = await listPurchaseOrders(createPOStore(db));
    return ok(c, scopePurchaseOrdersForAuth(records, auth));
  });

  app.post("/api/purchase-orders", async (c) => {
    const db = c.env?.DB;
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["poNumber", "customerId", "lines"]);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const customerId = asString(fields.customerId, "customerId");
    if (auth) authorizePurchaseOrderCreate(auth, customerId);

    const po = await createPurchaseOrder(createPOStore(db), {
      poNumber: asString(fields.poNumber, "poNumber"),
      customerId,
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
      lines: asLines(fields.lines),
    });

    return ok(c, po);
  });

  app.get("/api/purchase-orders/:purchaseOrderId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const po = await readPurchaseOrder(createPOStore(db), c.req.param("purchaseOrderId"));
    if (auth) authorizePurchaseOrderRead(auth, po.customerId);
    return ok(c, po);
  });

  app.patch("/api/purchase-orders/:purchaseOrderId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const existing = auth ? await readPurchaseOrder(createPOStore(db), c.req.param("purchaseOrderId")) : null;
    if (auth && existing) authorizePurchaseOrderCreate(auth, existing.customerId);

    const body = await parseJsonObject(c);
    const safeKeys = new Set(["notes", "requestedShipDate", "actorUserId"]);
    const ignoredUnsafeFields = Object.keys(body).filter((key) => !safeKeys.has(key));
    const po = await updatePurchaseOrderSafeFields(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      notes: optionalString(body.notes, "notes") ?? null,
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      ignoredUnsafeFields,
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/submit", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const existing = auth ? await readPurchaseOrder(createPOStore(db), c.req.param("purchaseOrderId")) : null;
    if (auth && existing) authorizePurchaseOrderCreate(auth, existing.customerId);
    const body = await optionalJsonObject(c);
    const po = await submitPurchaseOrder(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/lines/:lineId/supply-chain-review", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["supplyChainStatus"]);
    const po = await reviewPurchaseOrderLineSupplyChain(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      lineId: c.req.param("lineId"),
      supplyChainStatus: asSupplyChainStatus(fields.supplyChainStatus),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/deposit-status", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["depositStatus"]);
    const po = await updatePurchaseOrderDepositStatus(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      depositStatus: asDepositStatus(fields.depositStatus),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/approve-for-production", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await optionalJsonObject(c);
    const po = await approvePurchaseOrderForProduction(createPOStore(db), createInventoryStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });
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

function scopePurchaseOrdersForAuth(records: PurchaseOrderRecord[], auth: AuthContext | null) {
  if (!auth || auth.user.userType !== "customer") return records;
  return records.filter((po) => hasCustomerAccess(auth, po.customerId));
}

function authorizePurchaseOrderRead(auth: AuthContext, customerId: string) {
  if (auth.user.userType === "customer") requireCustomerAccess(auth, customerId);
}

function authorizePurchaseOrderCreate(auth: AuthContext, customerId: string) {
  if (auth.user.userType === "customer") {
    requireCustomerAccess(auth, customerId);
    return;
  }
  requireAnyRole(auth, ["Sales"]);
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }

  return value;
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return asString(value, field);
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`, { fields: [field] });
  }

  return value;
}

function asDepositStatus(value: unknown) {
  if (typeof value !== "string" || !depositStatuses.has(value as DepositStatus)) {
    throw new ValidationError("depositStatus is invalid", { fields: ["depositStatus"] });
  }

  return value as DepositStatus;
}

function asSupplyChainStatus(value: unknown) {
  if (typeof value !== "string" || !supplyChainStatuses.has(value as SupplyChainStatus)) {
    throw new ValidationError("supplyChainStatus is invalid", { fields: ["supplyChainStatus"] });
  }

  return value as SupplyChainStatus;
}

function asLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("lines must be a non-empty array", { fields: ["lines"] });
  }

  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new ValidationError(`lines[${index}] must be an object`, { fields: ["lines"] });
    }

    const record = line as Record<string, unknown>;
    return {
      description: asString(record.description, `lines[${index}].description`),
      quantity: asNumber(record.quantity, `lines[${index}].quantity`),
      unitOfMeasure: asString(record.unitOfMeasure, `lines[${index}].unitOfMeasure`),
      productId: optionalString(record.productId, `lines[${index}].productId`) ?? null,
      masterItemId: optionalString(record.masterItemId, `lines[${index}].masterItemId`) ?? null,
    };
  });
}
