import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1ProcurementStore } from "./d1-store";
import {
  createDraftProcurementOrder,
  listNeedToOrderRows,
  listProcurementOrders,
  receiveProcurementOrder,
  submitProcurementOrder,
  type NeedToOrderReason,
  type NeedToOrderRow,
  type ProcurementStore,
} from "./service";

type StoreFactory = (db: D1Database) => ProcurementStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerProcurementRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1ProcurementStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/procurement/need-to-order", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await listNeedToOrderRows(createStore(db)));
  });

  app.get("/api/procurement/orders", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await listProcurementOrders(createStore(db)));
  });

  app.post("/api/procurement/orders", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const order = await createDraftProcurementOrder(createStore(db), {
      supplierId: optionalString(body.supplierId, "supplierId") ?? null,
      supplierNameSnapshot: optionalString(body.supplierNameSnapshot, "supplierNameSnapshot") ?? null,
      quickBooksPoNumber: optionalString(body.quickBooksPoNumber, "quickBooksPoNumber") ?? null,
      dateOrdered: optionalString(body.dateOrdered, "dateOrdered") ?? null,
      expectedDate: optionalString(body.expectedDate, "expectedDate") ?? null,
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
      rows: asNeedRows(body.rows),
    });
    return ok(c, order);
  });

  app.patch("/api/procurement/orders/:procurementOrderId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const store = createStore(db);
    const existing = await store.getOrder(c.req.param("procurementOrderId"));
    if (!existing) throw new ValidationError("Procurement order not found", { code: "PROCUREMENT_ORDER_NOT_FOUND" });
    await store.updateOrder({
      id: existing.id,
      status: existing.status,
      quickBooksPoNumber: optionalString(body.quickBooksPoNumber, "quickBooksPoNumber") ?? null,
      dateOrdered: optionalString(body.dateOrdered, "dateOrdered") ?? null,
      expectedDate: optionalString(body.expectedDate, "expectedDate") ?? null,
      notes: optionalString(body.notes, "notes") ?? null,
    });
    return ok(c, await store.getOrder(existing.id));
  });

  app.post("/api/procurement/orders/:procurementOrderId/submit", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await optionalJsonObject(c);
    const order = await submitProcurementOrder(createStore(db), {
      procurementOrderId: c.req.param("procurementOrderId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, order);
  });

  app.post("/api/procurement/orders/:procurementOrderId/receive", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const order = await receiveProcurementOrder(createStore(db), {
      procurementOrderId: c.req.param("procurementOrderId"),
      receiptDate: asString(body.receiptDate, "receiptDate"),
      actorUserId: actorUserId(auth, body),
      lines: asReceiptLines(body.lines),
    });
    return ok(c, order);
  });
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

async function optionalJsonObject(c: Context<AppBindings>) {
  try {
    return await parseJsonObject(c);
  } catch {
    return {};
  }
}

function asNeedRows(value: unknown): NeedToOrderRow[] {
  if (!Array.isArray(value)) throw new ValidationError("rows must be an array", { fields: ["rows"] });
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new ValidationError(`rows[${index}] must be an object`, { fields: ["rows"] });
    }
    const source = row as Record<string, unknown>;
    return {
      inventoryItemId: asString(source.inventoryItemId, "inventoryItemId"),
      masterItemId: asString(source.masterItemId, "masterItemId"),
      name: asString(source.name, "name"),
      supplierId: optionalString(source.supplierId, "supplierId") ?? null,
      onHandQuantity: asNumber(source.onHandQuantity, "onHandQuantity"),
      allocatedQuantity: asNumber(source.allocatedQuantity, "allocatedQuantity"),
      netAvailableQuantity: asNumber(source.netAvailableQuantity, "netAvailableQuantity"),
      reorderPointQuantity: asNumber(source.reorderPointQuantity, "reorderPointQuantity"),
      shortageQuantity: asNumber(source.shortageQuantity, "shortageQuantity"),
      suggestedQuantity: asNumber(source.suggestedQuantity, "suggestedQuantity"),
      unitOfMeasure: asString(source.unitOfMeasure, "unitOfMeasure"),
      unitCostCents: optionalNumber(source.unitCostCents, "unitCostCents"),
      leadTimeDays: optionalNumber(source.leadTimeDays, "leadTimeDays"),
      reason: asNeedReason(source.reason),
      sourcePurchaseOrderLineId: optionalString(source.sourcePurchaseOrderLineId, "sourcePurchaseOrderLineId") ?? null,
    };
  });
}

function asReceiptLines(value: unknown) {
  if (!Array.isArray(value)) throw new ValidationError("lines must be an array", { fields: ["lines"] });
  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new ValidationError(`lines[${index}] must be an object`, { fields: ["lines"] });
    }
    const source = line as Record<string, unknown>;
    return {
      procurementOrderLineId: asString(source.procurementOrderLineId, "procurementOrderLineId"),
      receivedQuantity: asNumber(source.receivedQuantity, "receivedQuantity"),
      lotNumber: optionalString(source.lotNumber, "lotNumber") ?? null,
      location: optionalString(source.location, "location") ?? null,
    };
  });
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

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`, { fields: [field] });
  }
  return value;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return asNumber(value, field);
}

function asNeedReason(value: unknown): NeedToOrderReason {
  if (value === "low_stock" || value === "net_below_reorder" || value === "supply_chain_shortage") return value;
  throw new ValidationError("reason must be a valid Need to Order reason", { fields: ["reason"] });
}
