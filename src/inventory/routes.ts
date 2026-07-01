import type { Hono } from "hono";
import { ok } from "../api/responses";
import { ApiError, ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1InventoryStore } from "./d1-store";
import {
  InventoryError,
  adjustInventorySetupItem,
  archiveInventorySetupItem,
  archiveMoveLogEntry,
  archiveReceivingLogEntry,
  calculateInventorySignals,
  createInventorySetupItem,
  createMoveLogEntry,
  createReceivingLogEntry,
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
  updateMoveLogEntry,
  updateInventorySetupItem,
  updateReceivingLogEntry,
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
    if (!existing) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
    const updated = await updateInventorySetupItem(store, existing.id, existing, partialInventoryItemInputFromBody(await parseJsonObject(c), existing.id));
    return ok(c, updated);
  });

  app.delete("/api/inventory/:inventoryItemId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const force = c.req.query("force") === "true";
    if (force && !auth?.roles.includes("Admin")) {
      throw new ApiError("FORBIDDEN", "Only Admin can force delete Inventory items", 403);
    }
    const archived = await archiveInventorySetupItem(createStore(db), c.req.param("inventoryItemId"), auth?.user.id, { force });
    return ok(c, archived);
  });

  app.post("/api/inventory/:inventoryItemId/adjustments", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const adjustment = await adjustInventorySetupItem(createStore(db), c.req.param("inventoryItemId"), {
      onHandQuantity: asNumber(body.onHandQuantity, "onHandQuantity"),
      reason: asString(body.reason, "reason"),
      note: optionalString(body.note, "note") ?? null,
      lotsJson: optionalString(body.lotsJson, "lotsJson") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, adjustment);
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
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, entry);
  });

  app.patch("/api/inventory/receiving/:receivingEntryId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const entry = await updateReceivingLogEntry(createStore(db), c.req.param("receivingEntryId"), {
      ...partialReceivingInputFromBody(body),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, entry);
  });

  app.delete("/api/inventory/receiving/:receivingEntryId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const entry = await archiveReceivingLogEntry(createStore(db), c.req.param("receivingEntryId"), auth?.user.id);
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
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, entry);
  });

  app.patch("/api/inventory/moves/:moveEntryId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const entry = await updateMoveLogEntry(createStore(db), c.req.param("moveEntryId"), {
      ...partialMoveInputFromBody(body),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, entry);
  });

  app.delete("/api/inventory/moves/:moveEntryId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const entry = await archiveMoveLogEntry(createStore(db), c.req.param("moveEntryId"), auth?.user.id);
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

function partialReceivingInputFromBody(body: Record<string, unknown>) {
  return {
    ...(body.masterItemId !== undefined ? { masterItemId: asString(body.masterItemId, "masterItemId") } : {}),
    ...(body.inventoryItemId !== undefined ? { inventoryItemId: optionalString(body.inventoryItemId, "inventoryItemId") ?? null } : {}),
    ...(body.itemName !== undefined ? { itemName: asString(body.itemName, "itemName") } : {}),
    ...(body.date !== undefined ? { date: asString(body.date, "date") } : {}),
    ...(body.time !== undefined ? { time: asString(body.time, "time") } : {}),
    ...(body.packages !== undefined ? { packages: asNumber(body.packages, "packages") } : {}),
    ...(body.quantityPerPackage !== undefined ? { quantityPerPackage: asNumber(body.quantityPerPackage, "quantityPerPackage") } : {}),
    ...(body.unitOfMeasure !== undefined ? { unitOfMeasure: asString(body.unitOfMeasure, "unitOfMeasure") } : {}),
    ...(body.lotNumber !== undefined ? { lotNumber: optionalString(body.lotNumber, "lotNumber") ?? null } : {}),
    ...(body.allergens !== undefined ? { allergens: stringArray(body.allergens) } : {}),
    ...(body.receivedBy !== undefined ? { receivedBy: optionalString(body.receivedBy, "receivedBy") ?? null } : {}),
    ...(body.carrier !== undefined ? { carrier: optionalString(body.carrier, "carrier") ?? null } : {}),
    ...(body.supplierId !== undefined ? { supplierId: optionalString(body.supplierId, "supplierId") ?? null } : {}),
  };
}

function partialMoveInputFromBody(body: Record<string, unknown>) {
  return {
    ...(body.receivingId !== undefined ? { receivingId: asString(body.receivingId, "receivingId") } : {}),
    ...(body.date !== undefined ? { date: asString(body.date, "date") } : {}),
    ...(body.time !== undefined ? { time: asString(body.time, "time") } : {}),
    ...(body.caseCount !== undefined ? { caseCount: asNumber(body.caseCount, "caseCount") } : {}),
    ...(body.quantityPerCase !== undefined ? { quantityPerCase: asNumber(body.quantityPerCase, "quantityPerCase") } : {}),
    ...(body.movedBy !== undefined ? { movedBy: optionalString(body.movedBy, "movedBy") ?? null } : {}),
    ...(body.fromLocation !== undefined ? { fromLocation: optionalString(body.fromLocation, "fromLocation") ?? null } : {}),
    ...(body.toLocation !== undefined ? { toLocation: optionalString(body.toLocation, "toLocation") ?? null } : {}),
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
