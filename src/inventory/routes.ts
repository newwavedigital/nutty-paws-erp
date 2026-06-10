import type { Hono } from "hono";
import { ok } from "../api/responses";
import { ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1InventoryStore } from "./d1-store";
import {
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
  type InventoryStore,
} from "./service";

type StoreFactory = (db: D1Database) => InventoryStore;

export function registerInventoryRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1InventoryStore(db),
) {
  app.get("/api/inventory/:inventoryItemId/availability", async (c) => {
    const store = createStore(c.env?.DB);
    const availability = await getInventoryAvailability(store, c.req.param("inventoryItemId"));

    return ok(c, availability);
  });

  app.post("/api/inventory/:inventoryItemId/reservations", async (c) => {
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["purchaseOrderLineId", "quantity"]);
    const store = createStore(c.env?.DB);
    const reservation = await reserveInventory(store, {
      inventoryItemId: c.req.param("inventoryItemId"),
      purchaseOrderLineId: asString(fields.purchaseOrderLineId, "purchaseOrderLineId"),
      quantity: asNumber(fields.quantity, "quantity"),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, reservation);
  });

  app.post("/api/inventory/reservations/:reservationId/release", async (c) => {
    const body = await parseJsonObject(c);
    const store = createStore(c.env?.DB);
    const release = await releaseInventoryReservation(store, {
      reservationId: c.req.param("reservationId"),
      actorUserId: optionalString(body.actorUserId, "actorUserId"),
    });

    return ok(c, release);
  });
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
