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
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
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
