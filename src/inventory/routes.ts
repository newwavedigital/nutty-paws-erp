import type { Hono } from "hono";
import { ok } from "../api/responses";
import { ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1InventoryStore } from "./d1-store";
import {
  calculateInventorySignals,
  createInventorySetupItem,
  createMoveLogEntry,
  createReceivingLogEntry,
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
  updateInventorySetupItem,
  type InventoryCategory,
  type InventoryItemInput,
  type InventoryStore,
} from "./service";

type StoreFactory = (db: D1Database) => InventoryStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerInventoryRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1InventoryStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/inventory/:inventoryItemId/availability", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createStore(db);
    const availability = await getInventoryAvailability(store, c.req.param("inventoryItemId"));

    return ok(c, availability);
  });

  app.get("/api/inventory", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createStore(db);
    return ok(c, await (store.listInventoryItems?.() ?? []));
  });

  app.post("/api/inventory", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const item = await createInventorySetupItem(createStore(db), inventoryItemInputFromBody(body, `inventory_${crypto.randomUUID()}`));
    return ok(c, item);
  });

  app.patch("/api/inventory/:inventoryItemId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createStore(db);
    const existing = (await store.listInventoryItems?.() ?? []).find((item) => item.id === c.req.param("inventoryItemId"));
    if (!existing) throw new ValidationError("Inventory item not found", { code: "INVENTORY_ITEM_NOT_FOUND" });
    const updated = await updateInventorySetupItem(store, existing.id, existing, partialInventoryItemInputFromBody(await parseJsonObject(c), existing.id));
    return ok(c, updated);
  });

  app.get("/api/inventory/receiving", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await (createStore(db).listReceivingEntries?.() ?? []));
  });

  app.post("/api/inventory/receiving", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const entry = await createReceivingLogEntry(createStore(db), {
      masterItemId: asString(body.masterItemId, "masterItemId"),
      inventoryItemId: optionalString(body.inventoryItemId, "inventoryItemId") ?? null,
      itemName: asString(body.itemName, "itemName"),
      date: asString(body.date, "date"),
      time: asString(body.time, "time"),
      packages: asNumber(body.packages, "packages"),
      quantityPerPackage: asNumber(body.quantityPerPackage, "quantityPerPackage"),
      unitOfMeasure: asString(body.unitOfMeasure, "unitOfMeasure"),
      lotNumber: optionalString(body.lotNumber, "lotNumber") ?? null,
      allergens: stringArray(body.allergens),
      receivedBy: optionalString(body.receivedBy, "receivedBy") ?? null,
      carrier: optionalString(body.carrier, "carrier") ?? null,
      supplierId: optionalString(body.supplierId, "supplierId") ?? null,
    });
    return ok(c, entry);
  });

  app.get("/api/inventory/moves", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await (createStore(db).listMoveEntries?.() ?? []));
  });

  app.post("/api/inventory/moves", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const entry = await createMoveLogEntry(createStore(db), {
      receivingId: asString(body.receivingId, "receivingId"),
      date: asString(body.date, "date"),
      time: asString(body.time, "time"),
      caseCount: asNumber(body.caseCount, "caseCount"),
      quantityPerCase: asNumber(body.quantityPerCase, "quantityPerCase"),
      movedBy: optionalString(body.movedBy, "movedBy") ?? null,
      fromLocation: optionalString(body.fromLocation, "fromLocation") ?? null,
      toLocation: optionalString(body.toLocation, "toLocation") ?? null,
    });
    return ok(c, entry);
  });

  app.get("/api/inventory/signals", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const items = await (createStore(db).listInventoryItems?.() ?? []);
    return ok(c, calculateInventorySignals(items));
  });

  app.post("/api/inventory/:inventoryItemId/reservations", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["purchaseOrderLineId", "quantity"]);
    const store = createStore(db);
    const reservation = await reserveInventory(store, {
      inventoryItemId: c.req.param("inventoryItemId"),
      purchaseOrderLineId: asString(fields.purchaseOrderLineId, "purchaseOrderLineId"),
      quantity: asNumber(fields.quantity, "quantity"),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, reservation);
  });

  app.post("/api/inventory/reservations/:reservationId/release", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const store = createStore(db);
    const release = await releaseInventoryReservation(store, {
      reservationId: c.req.param("reservationId"),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, release);
  });
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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return asString(value, field);
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number") {
    throw new ValidationError(`${field} must be a number`, { fields: [field] });
  }

  return value;
}

function inventoryItemInputFromBody(body: Record<string, unknown>, id: string): InventoryItemInput {
  return {
    id,
    masterItemId: asString(body.masterItemId, "masterItemId"),
    category: asInventoryCategory(body.category ?? "Ingredient"),
    supplierId: optionalString(body.supplierId, "supplierId") ?? null,
    customerId: optionalString(body.customerId, "customerId") ?? "general",
    onHandQuantity: asNumber(body.onHandQuantity ?? 0, "onHandQuantity"),
    allocatedQuantity: asNumber(body.allocatedQuantity ?? 0, "allocatedQuantity"),
    reorderPointQuantity: asNumber(body.reorderPointQuantity ?? 0, "reorderPointQuantity"),
    unitOfMeasure: asString(body.unitOfMeasure, "unitOfMeasure"),
    unitCostCents: optionalNumber(body.unitCostCents, "unitCostCents"),
    leadTimeDays: optionalNumber(body.leadTimeDays, "leadTimeDays"),
    location: optionalString(body.location, "location") ?? null,
    lotNumber: optionalString(body.lotNumber, "lotNumber") ?? null,
    lotsJson: optionalString(body.lotsJson, "lotsJson") ?? null,
  };
}

function partialInventoryItemInputFromBody(body: Record<string, unknown>, id: string): Partial<InventoryItemInput> & { id: string } {
  return {
    id,
    ...(body.masterItemId !== undefined ? { masterItemId: asString(body.masterItemId, "masterItemId") } : {}),
    ...(body.category !== undefined ? { category: asInventoryCategory(body.category) } : {}),
    ...(body.supplierId !== undefined ? { supplierId: optionalString(body.supplierId, "supplierId") ?? null } : {}),
    ...(body.customerId !== undefined ? { customerId: optionalString(body.customerId, "customerId") ?? "general" } : {}),
    ...(body.onHandQuantity !== undefined ? { onHandQuantity: asNumber(body.onHandQuantity, "onHandQuantity") } : {}),
    ...(body.allocatedQuantity !== undefined ? { allocatedQuantity: asNumber(body.allocatedQuantity, "allocatedQuantity") } : {}),
    ...(body.reorderPointQuantity !== undefined ? { reorderPointQuantity: asNumber(body.reorderPointQuantity, "reorderPointQuantity") } : {}),
    ...(body.unitOfMeasure !== undefined ? { unitOfMeasure: asString(body.unitOfMeasure, "unitOfMeasure") } : {}),
    ...(body.unitCostCents !== undefined ? { unitCostCents: optionalNumber(body.unitCostCents, "unitCostCents") } : {}),
    ...(body.leadTimeDays !== undefined ? { leadTimeDays: optionalNumber(body.leadTimeDays, "leadTimeDays") } : {}),
    ...(body.location !== undefined ? { location: optionalString(body.location, "location") ?? null } : {}),
    ...(body.lotNumber !== undefined ? { lotNumber: optionalString(body.lotNumber, "lotNumber") ?? null } : {}),
    ...(body.lotsJson !== undefined ? { lotsJson: optionalString(body.lotsJson, "lotsJson") ?? null } : {}),
  };
}

function asInventoryCategory(value: unknown): InventoryCategory {
  if (value === "Ingredient" || value === "Packaging" || value === "Finished Good") return value;
  throw new ValidationError("category must be Ingredient, Packaging, or Finished Good", { fields: ["category"] });
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return asNumber(value, field);
}

function stringArray(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError("Expected string array", { fields: ["allergens"] });
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}
