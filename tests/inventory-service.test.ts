import { describe, expect, it } from "vitest";
import {
  InventoryError,
  calculateNetAvailable,
  archiveMoveLogEntry,
  archiveReceivingLogEntry,
  createReceivingLogEntry,
  getInventoryAvailability,
  releaseInventoryReservation,
  reserveInventory,
  updateMoveLogEntry,
  updateReceivingLogEntry,
  type MoveEntryRecord,
  type InventoryItemRecord,
  type InventoryReservationRecord,
  type InventoryStore,
  type ReceivingEntryRecord,
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
      return true;
    },
    async releaseInventoryItemAllocation(id, quantity) {
      calls.push(`releaseInventoryItemAllocation:${id}:${quantity}`);
      return true;
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
      "releaseInventoryItemAllocation:inv-1:30",
      "releaseReservationRecord:reservation-1",
      "createMovement:released:-30",
      "createAuditEvent:inventory.released",
    ]);
  });

  it("does not release the reservation or write ledger rows when allocation release fails", async () => {
    const store = createStore({
      async releaseInventoryItemAllocation(id, quantity) {
        store.calls.push(`releaseInventoryItemAllocation:${id}:${quantity}`);
        return false;
      },
    });

    await expect(
      releaseInventoryReservation(store, {
        reservationId: "reservation-1",
        actorUserId: "user-1",
      }),
    ).rejects.toEqual(
      new InventoryError("RESERVATION_RELEASE_FAILED", "Reserved inventory allocation could not be released"),
    );
    expect(store.calls).toEqual([
      "getActiveReservation:reservation-1",
      "releaseInventoryItemAllocation:inv-1:30",
    ]);
  });
});

function receivingEntry(overrides: Partial<ReceivingEntryRecord> = {}): ReceivingEntryRecord {
  return {
    id: "receiving-1",
    receivingId: "RCV-1001",
    masterItemId: "master-1",
    inventoryItemId: "inv-1",
    itemName: "Raw Peanuts",
    date: "2026-06-18",
    time: "09:00",
    packages: 4,
    quantityPerPackage: 25,
    totalQuantity: 100,
    unitOfMeasure: "lb",
    lotNumber: "LOT-1",
    allergens: ["Peanut"],
    receivedBy: "General",
    carrier: "LTL",
    supplierId: "supplier-1",
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: null,
    stockAppliedQuantity: 100,
    stockAppliedInventoryItemId: "inv-1",
    ...overrides,
  };
}

function moveEntry(overrides: Partial<MoveEntryRecord> = {}): MoveEntryRecord {
  return {
    id: "move-1",
    moveId: "MV-1001",
    receivingId: "RCV-1001",
    masterItemId: "master-1",
    inventoryItemId: "inv-1",
    itemName: "Raw Peanuts",
    lotNumber: "LOT-1",
    date: "2026-06-18",
    time: "10:00",
    caseCount: 2,
    quantityPerCase: 25,
    quantityMoved: 50,
    unitOfMeasure: "lb",
    movedBy: "General",
    fromLocation: "Dock",
    toLocation: "A-1",
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function createCorrectionStore(overrides: Partial<InventoryStore> = {}) {
  const calls: string[] = [];
  let receipt = receivingEntry();
  let move = moveEntry();
  const store: InventoryStore & { calls: string[] } = {
    calls,
    async getInventoryItem(id) {
      calls.push(`getInventoryItem:${id}`);
      return { id, onHandQuantity: 150, allocatedQuantity: 20, unitOfMeasure: "lb" };
    },
    async allocateInventoryItem() { return true; },
    async createReservation() {},
    async createMovement(input) {
      calls.push(`createMovement:${input.movementType}:${input.quantityDelta}:${input.referenceType}:${input.referenceId}`);
    },
    async deleteMovement(id) {
      calls.push(`deleteMovement:${id}`);
      return true;
    },
    async createAuditEvent(input) {
      calls.push(`createAuditEvent:${input.action}`);
    },
    async getActiveReservation() { return null; },
    async releaseReservationRecord() { return true; },
    async releaseInventoryItemAllocation() { return true; },
    async masterItemExists(masterItemId) {
      calls.push(`masterItemExists:${masterItemId}`);
      return masterItemId === "master-1";
    },
    async nextReceivingSequence() { return 1002; },
    async createReceivingEntry(input) {
      receipt = receivingEntry({
        ...input,
        status: "active",
        stockAppliedQuantity: input.totalQuantity,
        stockAppliedInventoryItemId: input.inventoryItemId,
      });
      calls.push(`createReceivingEntry:${receipt.totalQuantity}`);
      return receipt;
    },
    async getReceivingEntry(id) {
      calls.push(`getReceivingEntry:${id}`);
      return receipt.id === id ? receipt : null;
    },
    async getReceivingEntryByBusinessId(receivingId) {
      calls.push(`getReceivingEntryByBusinessId:${receivingId}`);
      return receipt.receivingId === receivingId ? receipt : null;
    },
    async updateReceivingEntry(id, input) {
      receipt = receivingEntry({
        ...input,
        id,
        receivingId: receipt.receivingId,
        status: "active",
      });
      calls.push(`updateReceivingEntry:${id}:${receipt.totalQuantity}`);
      return receipt;
    },
    async archiveReceivingEntry(id, input) {
      receipt = receivingEntry({
        ...receipt,
        status: "archived",
        archivedAt: input.archivedAt,
        archivedByUserId: input.actorUserId ?? null,
        stockAppliedQuantity: 0,
        stockAppliedInventoryItemId: null,
      });
      calls.push(`archiveReceivingEntry:${id}`);
      return receipt;
    },
    async adjustInventoryOnHand(input) {
      calls.push(`adjustInventoryOnHand:${input.inventoryItemId}:${input.quantityDelta}`);
      return true;
    },
    async nextMoveSequence() { return 1002; },
    async createMoveEntry(input) {
      move = moveEntry(input);
      calls.push(`createMoveEntry:${move.quantityMoved}`);
      return move;
    },
    async getMoveEntry(id) {
      calls.push(`getMoveEntry:${id}`);
      return move.id === id ? move : null;
    },
    async updateMoveEntry(id, input) {
      move = moveEntry({ ...input, id, moveId: move.moveId, status: "active" });
      calls.push(`updateMoveEntry:${id}:${move.quantityMoved}`);
      return move;
    },
    async archiveMoveEntry(id, input) {
      move = moveEntry({ ...move, status: "archived", archivedAt: input.archivedAt, archivedByUserId: input.actorUserId ?? null });
      calls.push(`archiveMoveEntry:${id}`);
      return move;
    },
    ...overrides,
  };
  return store;
}

describe("inventory receiving and move correction workflows", () => {
  it("applies received stock and ledger movement when creating a receiving entry", async () => {
    const store = createCorrectionStore();

    const created = await createReceivingLogEntry(store, {
      masterItemId: "master-1",
      inventoryItemId: "inv-1",
      itemName: "Raw Peanuts",
      date: "2026-06-19",
      time: "08:00",
      packages: 3,
      quantityPerPackage: 10,
      unitOfMeasure: "lb",
      lotNumber: "LOT-2",
      allergens: ["Peanut"],
      receivedBy: "General",
      carrier: "LTL",
      supplierId: "supplier-1",
      actorUserId: "user-1",
    });

    expect(created.totalQuantity).toBe(30);
    expect(created.stockAppliedQuantity).toBe(30);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:30");
    expect(store.calls).toContain(`createMovement:received:30:receiving_entry:${created.id}`);
  });

  it("applies only receiving edit stock deltas and records adjusted movements", async () => {
    const store = createCorrectionStore();

    const updated = await updateReceivingLogEntry(store, "receiving-1", {
      packages: 5,
      quantityPerPackage: 25,
      actorUserId: "user-2",
    });

    expect(updated.totalQuantity).toBe(125);
    expect(updated.stockAppliedQuantity).toBe(125);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:25");
    expect(store.calls).toContain("createMovement:adjusted:25:receiving_entry:receiving-1");
  });

  it("soft-archives receiving entries and reverses only applied stock", async () => {
    const store = createCorrectionStore();

    const archived = await archiveReceivingLogEntry(store, "receiving-1", "user-3");

    expect(archived.status).toBe("archived");
    expect(archived.stockAppliedQuantity).toBe(0);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:-100");
    expect(store.calls).toContain("createMovement:adjusted:-100:receiving_entry:receiving-1");
  });

  it("does not subtract stock when archiving historical receiving rows with no applied stock", async () => {
    const store = createCorrectionStore({
      async getReceivingEntry(id) {
        store.calls.push(`getReceivingEntry:${id}`);
        return receivingEntry({ stockAppliedQuantity: 0, stockAppliedInventoryItemId: null });
      },
    });

    await archiveReceivingLogEntry(store, "receiving-1", "user-4");

    expect(store.calls.some((call) => call.startsWith("adjustInventoryOnHand:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("createMovement:adjusted:"))).toBe(false);
  });

  it("updates and archives move entries without changing total on-hand stock", async () => {
    const store = createCorrectionStore();

    const updated = await updateMoveLogEntry(store, "move-1", {
      caseCount: 4,
      quantityPerCase: 12,
      fromLocation: "Dock",
      toLocation: "A-2",
      actorUserId: "user-5",
    });
    const archived = await archiveMoveLogEntry(store, "move-1", "user-5");

    expect(updated.quantityMoved).toBe(48);
    expect(archived.status).toBe("archived");
    expect(store.calls.some((call) => call.startsWith("adjustInventoryOnHand:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("createMovement:"))).toBe(false);
  });

  it("rolls back received stock when creating the receiving row fails", async () => {
    let onHandQuantity = 100;
    const store = createCorrectionStore({
      async adjustInventoryOnHand(input) {
        store.calls.push(`adjustInventoryOnHand:${input.inventoryItemId}:${input.quantityDelta}`);
        onHandQuantity += input.quantityDelta;
        return onHandQuantity >= 0;
      },
      async createReceivingEntry() {
        store.calls.push("createReceivingEntry:fail");
        throw new Error("receiving insert failed");
      },
    });

    await expect(
      createReceivingLogEntry(store, {
        masterItemId: "master-1",
        inventoryItemId: "inv-1",
        itemName: "Raw Peanuts",
        date: "2026-06-19",
        time: "08:00",
        packages: 3,
        quantityPerPackage: 10,
        unitOfMeasure: "lb",
        lotNumber: "LOT-2",
        allergens: ["Peanut"],
        receivedBy: "General",
        carrier: "LTL",
        supplierId: "supplier-1",
      }),
    ).rejects.toThrow("receiving insert failed");

    expect(onHandQuantity).toBe(100);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:30");
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:-30");
    expect(store.calls.some((call) => call.startsWith("deleteMovement:movement_"))).toBe(true);
  });

  it("rolls back receiving correction stock when updating the receiving row fails", async () => {
    let onHandQuantity = 150;
    const store = createCorrectionStore({
      async adjustInventoryOnHand(input) {
        store.calls.push(`adjustInventoryOnHand:${input.inventoryItemId}:${input.quantityDelta}`);
        onHandQuantity += input.quantityDelta;
        return onHandQuantity >= 0;
      },
      async updateReceivingEntry() {
        store.calls.push("updateReceivingEntry:fail");
        throw new Error("receiving update failed");
      },
    });

    await expect(
      updateReceivingLogEntry(store, "receiving-1", {
        packages: 5,
        quantityPerPackage: 25,
      }),
    ).rejects.toThrow("receiving update failed");

    expect(onHandQuantity).toBe(150);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:25");
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:-25");
    expect(store.calls.some((call) => call.startsWith("deleteMovement:movement_"))).toBe(true);
  });

  it("rolls back receiving archive stock when archiving the receiving row fails", async () => {
    let onHandQuantity = 150;
    const store = createCorrectionStore({
      async adjustInventoryOnHand(input) {
        store.calls.push(`adjustInventoryOnHand:${input.inventoryItemId}:${input.quantityDelta}`);
        onHandQuantity += input.quantityDelta;
        return onHandQuantity >= 0;
      },
      async archiveReceivingEntry() {
        store.calls.push("archiveReceivingEntry:fail");
        throw new Error("receiving archive failed");
      },
    });

    await expect(archiveReceivingLogEntry(store, "receiving-1", "user-6")).rejects.toThrow("receiving archive failed");

    expect(onHandQuantity).toBe(150);
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:-100");
    expect(store.calls).toContain("adjustInventoryOnHand:inv-1:100");
    expect(store.calls.some((call) => call.startsWith("deleteMovement:movement_"))).toBe(true);
  });
});
