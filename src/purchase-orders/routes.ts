import type { Context, Hono } from "hono";
import { ok } from "../api/responses";
import { ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
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
  type PurchaseOrderStore,
  type SupplyChainStatus,
} from "./service";

type POStoreFactory = (db: D1Database) => PurchaseOrderStore;
type InventoryStoreFactory = (db: D1Database) => InventoryStore;

const depositStatuses = new Set<DepositStatus>(["not_required", "required", "requested", "received", "waived"]);
const supplyChainStatuses = new Set<SupplyChainStatus>(["pending", "available", "needs_ordering", "blocked"]);

export function registerPurchaseOrderRoutes(
  app: Hono<AppBindings>,
  createPOStore: POStoreFactory = (db) => new D1PurchaseOrderStore(db),
  createInventoryStore: InventoryStoreFactory = (db) => new D1InventoryStore(db),
) {
  app.get("/api/purchase-orders", async (c) => {
    return ok(c, await listPurchaseOrders(createPOStore(c.env?.DB)));
  });

  app.post("/api/purchase-orders", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["poNumber", "customerId", "lines"]);
    const po = await createPurchaseOrder(createPOStore(c.env?.DB), {
      poNumber: asString(fields.poNumber, "poNumber"),
      customerId: asString(fields.customerId, "customerId"),
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
      lines: asLines(fields.lines),
    });

    return ok(c, po);
  });

  app.get("/api/purchase-orders/:purchaseOrderId", async (c) => {
    return ok(c, await readPurchaseOrder(createPOStore(c.env?.DB), c.req.param("purchaseOrderId")));
  });

  app.patch("/api/purchase-orders/:purchaseOrderId", async (c) => {
    const body = await parseJsonObject(c);
    const safeKeys = new Set(["notes", "requestedShipDate", "actorUserId"]);
    const ignoredUnsafeFields = Object.keys(body).filter((key) => !safeKeys.has(key));
    const po = await updatePurchaseOrderSafeFields(createPOStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      notes: optionalString(body.notes, "notes") ?? null,
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      ignoredUnsafeFields,
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/submit", async (c) => {
    const body = await optionalJsonObject(c);
    const po = await submitPurchaseOrder(createPOStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/lines/:lineId/supply-chain-review", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["supplyChainStatus"]);
    const po = await reviewPurchaseOrderLineSupplyChain(createPOStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      lineId: c.req.param("lineId"),
      supplyChainStatus: asSupplyChainStatus(fields.supplyChainStatus),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/deposit-status", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["depositStatus"]);
    const po = await updatePurchaseOrderDepositStatus(createPOStore(c.env?.DB), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      depositStatus: asDepositStatus(fields.depositStatus),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/approve-for-production", async (c) => {
    const body = await optionalJsonObject(c);
    const db = c.env?.DB;
    const po = await approvePurchaseOrderForProduction(createPOStore(db), createInventoryStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
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
