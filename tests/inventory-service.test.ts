import { describe, expect, it } from "vitest";
import {
  InventoryError,
  calculateNetAvailable,
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
  type InventoryItemRecord,
  type InventoryReservationRecord,
  type InventoryStore,
} from "../src/inventory/service";

function createStore(overrides: Partial<InventoryStore> = {}) {
  const item: InventoryItemRecord = {
    id: "inv-1",
    onHandQuantity: 100,
    allocatedQuantity: 25,
    unitOfMeasure: "lb",
  };

  const reservation: InventoryReservationRecord = {
    id: "reservation-1",
    inventoryItemId: "inv-1",
    purchaseOrderLineId: "po-line-1",
    quantity: 30,
    status: "active",
  };

  const calls: string[] = [];

  const store: InventoryStore & { calls: string[] } = {
    calls,
    async getInventoryItem(id) {
      calls.push(`getInventoryItem:${id}`);
      return item;
    },
    async allocateInventoryItem(id, quantity) {
      calls.push(`allocateInventoryItem:${id}:${quantity}`);
      return quantity <= calculateNetAvailable(item);
    },
    async createReservation(input) {
      calls.push(`createReservation:${input.id}:${input.quantity}`);
    },
    async createMovement(input) {
      calls.push(`createMovement:${input.movementType}:${input.quantityDelta}`);
    },
    async createAuditEvent(input) {
      calls.push(`createAuditEvent:${input.action}`);
    },
    async getActiveReservation(id) {
      calls.push(`getActiveReservation:${id}`);
      return reservation;
    },
    async releaseReservationRecord(id) {
      calls.push(`releaseReservationRecord:${id}`);
    },
    async releaseInventoryItemAllocation(id, quantity) {
      calls.push(`releaseInventoryItemAllocation:${id}:${quantity}`);
    },
    ...overrides,
  };

  return store;
}

describe("inventory reservation service", () => {
  it("calculates net available as on hand minus allocated", () => {
    expect(
      calculateNetAvailable({
        onHandQuantity: 100,
        allocatedQuantity: 40,
      }),
    ).toBe(60);
  });

  it("returns inventory availability", async () => {
    const availability = await getInventoryAvailability(createStore(), "inv-1");

    expect(availability).toEqual({
      inventoryItemId: "inv-1",
      onHandQuantity: 100,
      allocatedQuantity: 25,
      netAvailableQuantity: 75,
      unitOfMeasure: "lb",
    });
  });

  it("reserves inventory and writes reservation, movement, and audit records", async () => {
    const store = createStore();

    const result = await reserveInventory(store, {
      inventoryItemId: "inv-1",
      purchaseOrderLineId: "po-line-1",
      quantity: 30,
      actorUserId: "user-1",
    });

    expect(result).toEqual({
      reservationId: expect.stringMatching(/^reservation_/),
      inventoryItemId: "inv-1",
      purchaseOrderLineId: "po-line-1",
      quantity: 30,
      status: "active",
    });
    expect(store.calls).toEqual([
      "getInventoryItem:inv-1",
      "allocateInventoryItem:inv-1:30",
      `createReservation:${result.reservationId}:30`,
      "createMovement:reserved:30",
      "createAuditEvent:inventory.reserved",
    ]);
  });

  it("prevents overcommit when net available is insufficient", async () => {
    await expect(
      reserveInventory(createStore(), {
        inventoryItemId: "inv-1",
        purchaseOrderLineId: "po-line-1",
        quantity: 90,
        actorUserId: "user-1",
      }),
    ).rejects.toEqual(
      new InventoryError("INSUFFICIENT_INVENTORY", "Insufficient net available inventory"),
    );
  });

  it("rejects invalid reservation quantities", async () => {
    await expect(
      reserveInventory(createStore(), {
        inventoryItemId: "inv-1",
        purchaseOrderLineId: "po-line-1",
        quantity: 0,
      }),
    ).rejects.toEqual(new InventoryError("INVALID_QUANTITY", "Quantity must be greater than zero"));
  });

  it("releases an active reservation and writes movement and audit records", async () => {
    const store = createStore();

    const result = await releaseInventoryReservation(store, {
      reservationId: "reservation-1",
      actorUserId: "user-1",
    });

    expect(result).toEqual({
      reservationId: "reservation-1",
      inventoryItemId: "inv-1",
      purchaseOrderLineId: "po-line-1",
      quantity: 30,
      status: "released",
    });
    expect(store.calls).toEqual([
      "getActiveReservation:reservation-1",
      "releaseReservationRecord:reservation-1",
      "releaseInventoryItemAllocation:inv-1:30",
      "createMovement:released:-30",
      "createAuditEvent:inventory.released",
    ]);
  });
});
