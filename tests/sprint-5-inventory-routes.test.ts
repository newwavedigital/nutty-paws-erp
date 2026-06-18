import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerInventoryRoutes } from "../src/inventory/routes";
import type {
  InventoryItemInput,
  InventoryItemSetupRecord,
  InventoryStore,
  MoveEntryInput,
  MoveEntryRecord,
  ReceivingEntryInput,
  ReceivingEntryRecord,
} from "../src/inventory/service";

function makeInventoryItem(overrides: Partial<InventoryItemSetupRecord> = {}): InventoryItemSetupRecord {
  return {
    id: "inv-1",
    masterItemId: "master-1",
    masterItemName: "Raw Peanuts",
    itemType: "raw_material",
    category: "Ingredient",
    supplierId: "supplier-1",
    customerId: "general",
    onHandQuantity: 100,
    allocatedQuantity: 25,
    netAvailableQuantity: 75,
    reorderPointQuantity: 50,
    unitOfMeasure: "lb",
    unitCostCents: 250,
    leadTimeDays: 7,
    location: "A-1",
    lotNumber: "LOT-1",
    lotsJson: JSON.stringify([{ lotNumber: "LOT-1", location: "A-1", qty: 100 }]),
    ...overrides,
  };
}

function makeReceivingEntry(overrides: Partial<ReceivingEntryRecord> = {}): ReceivingEntryRecord {
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
    ...overrides,
  };
}

function makeMoveEntry(overrides: Partial<MoveEntryRecord> = {}): MoveEntryRecord {
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
    ...overrides,
  };
}

function createRouteStore(overrides: Partial<InventoryStore> = {}) {
  const items = new Map<string, InventoryItemSetupRecord>([["inv-1", makeInventoryItem()]]);
  const receiving = new Map<string, ReceivingEntryRecord>([["receiving-1", makeReceivingEntry()]]);
  const moves = new Map<string, MoveEntryRecord>([["move-1", makeMoveEntry()]]);

  const store: InventoryStore = {
    async getInventoryItem(id) {
      const item = items.get(id);
      return item ? { id: item.id, onHandQuantity: item.onHandQuantity, allocatedQuantity: item.allocatedQuantity, unitOfMeasure: item.unitOfMeasure } : null;
    },
    async allocateInventoryItem() { return true; },
    async createReservation() {},
    async createMovement() {},
    async createAuditEvent() {},
    async getActiveReservation() { return null; },
    async releaseReservationRecord() {},
    async releaseInventoryItemAllocation() {},
    async listInventoryItems() { return [...items.values()]; },
    async createInventoryItem(input: InventoryItemInput) {
      const item = makeInventoryItem({ ...input, id: input.id, netAvailableQuantity: input.onHandQuantity - (input.allocatedQuantity ?? 0) });
      items.set(item.id, item);
      return item;
    },
    async updateInventoryItem(id: string, input: InventoryItemInput) {
      const item = makeInventoryItem({ ...(items.get(id) ?? {}), ...input, id, netAvailableQuantity: input.onHandQuantity - (input.allocatedQuantity ?? 0) });
      items.set(id, item);
      return item;
    },
    async masterItemExists(masterItemId: string) { return masterItemId === "master-1"; },
    async listReceivingEntries() { return [...receiving.values()]; },
    async nextReceivingSequence() { return 1002; },
    async createReceivingEntry(input: ReceivingEntryInput) {
      const entry = makeReceivingEntry({ ...input, id: input.id });
      receiving.set(entry.id, entry);
      return entry;
    },
    async getReceivingEntryByBusinessId(receivingId: string) {
      return [...receiving.values()].find((entry) => entry.receivingId === receivingId) ?? null;
    },
    async listMoveEntries() { return [...moves.values()]; },
    async nextMoveSequence() { return 1002; },
    async createMoveEntry(input: MoveEntryInput) {
      const entry = makeMoveEntry({ ...input, id: input.id });
      moves.set(entry.id, entry);
      return entry;
    },
    ...overrides,
  };

  return store;
}

function createRouteApp(store: InventoryStore = createRouteStore()) {
  return createApp((route) => registerInventoryRoutes(route, () => store));
}

describe("Sprint 5 inventory setup routes", () => {
  it("creates and updates Inventory items from Master List items", async () => {
    const app = createRouteApp();

    const createResponse = await app.request("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterItemId: "master-1",
        category: "Ingredient",
        supplierId: "supplier-1",
        customerId: "general",
        onHandQuantity: 120,
        allocatedQuantity: 10,
        reorderPointQuantity: 50,
        unitOfMeasure: "lb",
        unitCostCents: 250,
        leadTimeDays: 7,
        location: "A-1",
        lotNumber: "LOT-2",
        lotsJson: JSON.stringify([{ lotNumber: "LOT-2", location: "A-1", qty: 120 }]),
      }),
    });

    expect(createResponse.status).toBe(200);
    const created = await createResponse.json() as { data: InventoryItemSetupRecord };
    expect(created.data).toMatchObject({
      id: expect.stringMatching(/^inventory_/),
      masterItemId: "master-1",
      netAvailableQuantity: 110,
      unitOfMeasure: "lb",
    });

    const updateResponse = await app.request(`/api/inventory/${created.data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onHandQuantity: 90, allocatedQuantity: 15 }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: { onHandQuantity: 90, allocatedQuantity: 15, netAvailableQuantity: 75 },
    });
  });

  it("blocks Inventory item creation without a valid Master List item", async () => {
    const app = createRouteApp(createRouteStore({ async masterItemExists() { return false; } }));

    const response = await app.request("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ masterItemId: "missing-master", onHandQuantity: 1, unitOfMeasure: "lb" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MASTER_ITEM_REQUIRED" },
    });
  });

  it("logs receiving entries with unique IDs and calculated total quantity", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/inventory/receiving", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterItemId: "master-1",
        inventoryItemId: "inv-1",
        itemName: "Raw Peanuts",
        date: "2026-06-18",
        time: "09:00",
        packages: 5,
        quantityPerPackage: 20,
        unitOfMeasure: "lb",
        lotNumber: "LOT-3",
        allergens: ["Peanut"],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        receivingId: "RCV-1002",
        totalQuantity: 100,
        unitOfMeasure: "lb",
        allergens: ["Peanut"],
      },
    });
  });

  it("logs move entries from Receiving IDs and calculates moved quantity", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/inventory/moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receivingId: "RCV-1001",
        date: "2026-06-18",
        time: "10:30",
        caseCount: 3,
        quantityPerCase: 12,
        movedBy: "General",
        fromLocation: "Dock",
        toLocation: "A-2",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        moveId: "MV-1002",
        receivingId: "RCV-1001",
        itemName: "Raw Peanuts",
        lotNumber: "LOT-1",
        quantityMoved: 36,
        unitOfMeasure: "lb",
      },
    });
  });

  it("returns dashboard inventory signals for low stock, over-allocation, and net available", async () => {
    const app = createRouteApp(createRouteStore({
      async listInventoryItems() {
        return [
          makeInventoryItem({ id: "low", onHandQuantity: 40, allocatedQuantity: 10, reorderPointQuantity: 50, netAvailableQuantity: 30 }),
          makeInventoryItem({ id: "over", onHandQuantity: 10, allocatedQuantity: 15, reorderPointQuantity: 0, netAvailableQuantity: -5 }),
        ];
      },
    }));

    const response = await app.request("/api/inventory/signals");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        lowStockCount: 2,
        overAllocationCount: 1,
        items: [
          expect.objectContaining({ id: "low", netAvailableQuantity: 30, lowStock: true }),
          expect.objectContaining({ id: "over", netAvailableQuantity: -5, overAllocated: true }),
        ],
      },
    });
  });
});
