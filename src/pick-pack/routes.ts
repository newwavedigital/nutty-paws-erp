import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuthWhenEnabled } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1PickPackStore } from "./d1-store";
import {
  createPickPackOrder,
  listPickPackOrders,
  markPickPackPicked,
  markPickPackShipped,
  updatePickPackOrder,
  updatePickPackShippingDetails,
  type PickPackStore,
  type PickPackShippingMode,
} from "./service";

type StoreFactory = (db: D1Database) => PickPackStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerPickPackRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1PickPackStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/pick-pack/orders", async (c) => {
    await requirePickPackAccess(c, createAuthStore);
    return ok(c, await listPickPackOrders(createStore(c.env?.DB)));
  });

  app.post("/api/pick-pack/orders", async (c) => {
    const auth = await requirePickPackAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    return ok(
      c,
      await createPickPackOrder(createStore(c.env?.DB), {
        customerId: requiredString(body.customerId, "customerId"),
        customerPoNumber: optionalString(body.customerPoNumber, "customerPoNumber"),
        dateSubmitted: requiredString(body.dateSubmitted, "dateSubmitted"),
        dateNeededToShip: optionalString(body.dateNeededToShip, "dateNeededToShip"),
        poFileId: optionalString(body.poFileId, "poFileId"),
        notes: optionalString(body.notes, "notes"),
        lines: parseLines(body.lines),
        actorUserId: actorUserId(auth, body),
      }),
    );
  });

  app.patch("/api/pick-pack/orders/:orderId", async (c) => {
    const auth = await requirePickPackAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    return ok(
      c,
      await updatePickPackOrder(createStore(c.env?.DB), {
        orderId: c.req.param("orderId"),
        customerId: requiredString(body.customerId, "customerId"),
        customerPoNumber: optionalString(body.customerPoNumber, "customerPoNumber"),
        dateSubmitted: requiredString(body.dateSubmitted, "dateSubmitted"),
        dateNeededToShip: optionalString(body.dateNeededToShip, "dateNeededToShip"),
        poFileId: optionalString(body.poFileId, "poFileId"),
        notes: optionalString(body.notes, "notes"),
        lines: parseLines(body.lines),
        actorUserId: actorUserId(auth, body),
      }),
    );
  });

  app.post("/api/pick-pack/orders/:orderId/mark-picked", async (c) => {
    const auth = await requirePickPackAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    return ok(
      c,
      await markPickPackPicked(createStore(c.env?.DB), {
        orderId: c.req.param("orderId"),
        confirmShortStock: optionalBoolean(body.confirmShortStock, "confirmShortStock"),
        actorUserId: actorUserId(auth, body),
      }),
    );
  });

  app.patch("/api/pick-pack/orders/:orderId/shipping", async (c) => {
    const auth = await requirePickPackAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    return ok(
      c,
      await updatePickPackShippingDetails(createStore(c.env?.DB), {
        orderId: c.req.param("orderId"),
        shippingMode: shippingMode(body.shippingMode, "shippingMode"),
        carrier: optionalString(body.carrier, "carrier"),
        trackingNumber: optionalString(body.trackingNumber, "trackingNumber"),
        bolNumber: optionalString(body.bolNumber, "bolNumber"),
        palletCount: optionalNumber(body.palletCount, "palletCount"),
        weight: optionalNumber(body.weight, "weight"),
        dimensionsJson: optionalString(body.dimensionsJson, "dimensionsJson"),
        notes: optionalString(body.notes, "notes"),
        actorUserId: actorUserId(auth, body),
      }),
    );
  });

  app.post("/api/pick-pack/orders/:orderId/mark-shipped", async (c) => {
    const auth = await requirePickPackAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    return ok(
      c,
      await markPickPackShipped(createStore(c.env?.DB), {
        orderId: c.req.param("orderId"),
        shippingMode: optionalShippingMode(body.shippingMode),
        carrier: optionalString(body.carrier, "carrier"),
        trackingNumber: optionalString(body.trackingNumber, "trackingNumber"),
        bolNumber: optionalString(body.bolNumber, "bolNumber"),
        palletCount: optionalNumber(body.palletCount, "palletCount"),
        weight: optionalNumber(body.weight, "weight"),
        dimensionsJson: optionalString(body.dimensionsJson, "dimensionsJson"),
        notes: optionalString(body.notes, "notes"),
        actorUserId: actorUserId(auth, body),
      }),
    );
  });
}

async function requirePickPackAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireAnyRole(auth, ["Production", "Warehousing"]);
  return auth;
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function parseLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("lines must be a non-empty array");
  }
  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new ValidationError(`lines[${index}] must be an object`);
    }
    const record = line as Record<string, unknown>;
    return {
      inventoryItemId: requiredString(record.inventoryItemId, `lines[${index}].inventoryItemId`),
      quantity: requiredPositiveNumber(record.quantity, `lines[${index}].quantity`),
    };
  });
}

function shippingMode(value: unknown, field: string): PickPackShippingMode {
  if (value === "pallet" || value === "parcel") return value;
  throw new ValidationError(`${field} must be 'pallet' or 'parcel'`);
}

function optionalShippingMode(value: unknown): PickPackShippingMode | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return shippingMode(value, "shippingMode");
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`);
  }
  const cleaned = value.trim();
  return cleaned === "" ? undefined : cleaned;
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${field} must be a number greater than or equal to zero`);
  }
  return value;
}

function requiredPositiveNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} must be a number greater than zero`);
  }
  return value;
}
