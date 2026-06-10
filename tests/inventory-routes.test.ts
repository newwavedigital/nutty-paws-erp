import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerInventoryRoutes } from "../src/inventory/routes";
import type { InventoryStore } from "../src/inventory/service";

function createRouteStore(overrides: Partial<InventoryStore> = {}) {
  const store: InventoryStore = {
    async getInventoryItem() {
      return {
        id: "inv-1",
        onHandQuantity: 100,
        allocatedQuantity: 25,
        unitOfMeasure: "lb",
      };
    },
    async allocateInventoryItem() {
      return true;
    },
    async createReservation() {},
    async createMovement() {},
    async createAuditEvent() {},
    async getActiveReservation() {
      return {
        id: "reservation-1",
        inventoryItemId: "inv-1",
        purchaseOrderLineId: "po-line-1",
        quantity: 30,
        status: "active",
      };
    },
    async releaseReservationRecord() {},
    async releaseInventoryItemAllocation() {},
    ...overrides,
  };

  return store;
}

describe("inventory routes", () => {
  it("returns inventory availability", async () => {
    const app = createApp((route) => registerInventoryRoutes(route, () => createRouteStore()));

    const response = await app.request("/api/inventory/inv-1/availability");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        inventoryItemId: "inv-1",
        onHandQuantity: 100,
        allocatedQuantity: 25,
        netAvailableQuantity: 75,
        unitOfMeasure: "lb",
      },
      meta: { requestId: null },
    });
  });

  it("reserves inventory", async () => {
    const app = createApp((route) => registerInventoryRoutes(route, () => createRouteStore()));

    const response = await app.request("/api/inventory/inv-1/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderLineId: "po-line-1",
        quantity: 30,
        actorUserId: "user-1",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { reservationId: string };
    };
    expect(body).toMatchObject({
      ok: true,
      data: {
        inventoryItemId: "inv-1",
        purchaseOrderLineId: "po-line-1",
        quantity: 30,
        status: "active",
      },
      meta: { requestId: null },
    });
    expect(body.data.reservationId).toMatch(/^reservation_/);
  });

  it("rejects invalid reservation quantity through the shared error envelope", async () => {
    const app = createApp((route) => registerInventoryRoutes(route, () => createRouteStore()));

    const response = await app.request("/api/inventory/inv-1/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderLineId: "po-line-1",
        quantity: -1,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Quantity must be greater than zero",
      },
      meta: { requestId: null },
    });
  });

  it("releases inventory reservations", async () => {
    const app = createApp((route) => registerInventoryRoutes(route, () => createRouteStore()));

    const response = await app.request("/api/inventory/reservations/reservation-1/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorUserId: "user-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        reservationId: "reservation-1",
        inventoryItemId: "inv-1",
        purchaseOrderLineId: "po-line-1",
        quantity: 30,
        status: "released",
      },
      meta: { requestId: null },
    });
  });
});
