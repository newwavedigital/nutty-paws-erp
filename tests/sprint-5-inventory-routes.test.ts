import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerInventoryRoutes } from "../src/inventory/routes";
import type {
  InventoryAdjustmentInput,
  InventoryAdjustmentRecord,
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
    status: overrides.status ?? "active",
    archivedAt: overrides.archivedAt ?? null,
    archivedByUserId: overrides.archivedByUserId ?? null,
    updatedByUserId: overrides.updatedByUserId ?? null,
    stockAppliedQuantity: overrides.stockAppliedQuantity ?? 100,
    stockAppliedInventoryItemId: overrides.stockAppliedInventoryItemId ?? "inv-1",
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
    status: overrides.status ?? "active",
    archivedAt: overrides.archivedAt ?? null,
    archivedByUserId: overrides.archivedByUserId ?? null,
    updatedByUserId: overrides.updatedByUserId ?? null,
  };
}

function createRouteStore(overrides: Partial<InventoryStore> = {}) {
  const items = new Map<string, InventoryItemSetupRecord>([["inv-1", makeInventoryItem()]]);
  const receiving = new Map<string, ReceivingEntryRecord>([["receiving-1", makeReceivingEntry()]]);
  const moves = new Map<string, MoveEntryRecord>([["move-1", makeMoveEntry()]]);
  const adjustments: InventoryAdjustmentRecord[] = [];

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
    async releaseReservationRecord() { return true; },
    async releaseInventoryItemAllocation() { return true; },
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
    async archiveInventoryItem(id: string, input: { archivedAt: string; actorUserId?: string }) {
      const item = items.get(id);
      if (!item) return null;
      const archived = makeInventoryItem({ ...item, status: "archived", archivedAt: input.archivedAt, archivedByUserId: input.actorUserId ?? null } as Partial<InventoryItemSetupRecord>);
      items.set(id, archived);
      return archived;
    },
    async countActiveReservationsForInventoryItem(id: string) {
      return id === "inv-1" ? 0 : 0;
    },
    async createInventoryAdjustment(input: InventoryAdjustmentInput) {
      const adjustment = {
        ...input,
        adjustedByUserId: input.adjustedByUserId ?? null,
        createdAt: "2026-07-01T00:00:00.000Z",
      };
      adjustments.push(adjustment);
      return adjustment;
    },
    async masterItemExists(masterItemId: string) { return masterItemId === "master-1"; },
    async listReceivingEntries() { return [...receiving.values()]; },
    async nextReceivingSequence() { return 1002; },
    async createReceivingEntry(input: ReceivingEntryInput) {
      const entry = makeReceivingEntry({ ...input, id: input.id });
      receiving.set(entry.id, entry);
      return entry;
    },
    async getReceivingEntry(id: string) {
      return receiving.get(id) ?? null;
    },
    async getReceivingEntryByBusinessId(receivingId: string) {
      return [...receiving.values()].find((entry) => entry.receivingId === receivingId) ?? null;
    },
    async updateReceivingEntry(id: string, input: ReceivingEntryInput) {
      const current = receiving.get(id);
      if (!current) return null;
      const updated = makeReceivingEntry({ ...current, ...input, id });
      receiving.set(id, updated);
      return updated;
    },
    async archiveReceivingEntry(id: string, input: { archivedAt: string; actorUserId?: string }) {
      const current = receiving.get(id);
      if (!current) return null;
      const archived = makeReceivingEntry({ ...current, status: "archived", archivedAt: input.archivedAt, archivedByUserId: input.actorUserId ?? null });
      receiving.set(id, archived);
      return archived;
    },
    async adjustInventoryOnHand() { return true; },
    async listMoveEntries() { return [...moves.values()]; },
    async nextMoveSequence() { return 1002; },
    async createMoveEntry(input: MoveEntryInput) {
      const entry = makeMoveEntry({ ...input, id: input.id });
      moves.set(entry.id, entry);
      return entry;
    },
    async getMoveEntry(id: string) {
      return moves.get(id) ?? null;
    },
    async updateMoveEntry(id: string, input: MoveEntryInput) {
      const current = moves.get(id);
      if (!current) return null;
      const updated = makeMoveEntry({ ...current, ...input, id });
      moves.set(id, updated);
      return updated;
    },
    async archiveMoveEntry(id: string, input: { archivedAt: string; actorUserId?: string }) {
      const current = moves.get(id);
      if (!current) return null;
      const archived = makeMoveEntry({ ...current, status: "archived", archivedAt: input.archivedAt, archivedByUserId: input.actorUserId ?? null });
      moves.set(id, archived);
      return archived;
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

  it("returns a domain error when Inventory item on-hand drops below allocated quantity", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/inventory/inv-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onHandQuantity: 20 }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INSUFFICIENT_INVENTORY",
        message: "On-hand quantity cannot be below allocated quantity",
      },
    });
  });

  it("archives zero-balance Inventory items through backend DELETE", async () => {
    const app = createRouteApp(createRouteStore({
      async listInventoryItems() {
        return [makeInventoryItem({ onHandQuantity: 0, allocatedQuantity: 0, netAvailableQuantity: 0 })];
      },
    }));

    const response = await app.request("/api/inventory/inv-1", { method: "DELETE" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: "inv-1",
        status: "archived",
        archivedAt: expect.any(String),
      },
    });
  });

  it("blocks Inventory item archive while stock or allocation remains", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/inventory/inv-1", { method: "DELETE" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVENTORY_ITEM_ARCHIVE_BLOCKED",
        message: "Cannot archive Raw Peanuts. On hand is 100 lb; Allocated quantity is 25 lb.",
        details: {
          itemName: "Raw Peanuts",
          blockers: [
            { field: "onHandQuantity", label: "On hand", value: 100, unit: "lb" },
            { field: "allocatedQuantity", label: "Allocated quantity", value: 25, unit: "lb" },
          ],
        },
      },
    });
  });

  it("returns not found when archived Inventory items are patched", async () => {
    const app = createRouteApp(createRouteStore({
      async listInventoryItems() {
        return [];
      },
    }));

    const response = await app.request("/api/inventory/inv-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onHandQuantity: 0 }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVENTORY_ITEM_NOT_FOUND",
        message: "Inventory item not found",
      },
    });
  });

  it("persists stock adjustment reasons through a dedicated backend route", async () => {
    const calls: InventoryAdjustmentRecord[] = [];
    const app = createRouteApp(createRouteStore({
      async createInventoryAdjustment(input: InventoryAdjustmentInput) {
        const adjustment = {
          ...input,
          adjustedByUserId: input.adjustedByUserId ?? null,
          createdAt: "2026-07-01T00:00:00.000Z",
        };
        calls.push(adjustment);
        return adjustment;
      },
    } as Partial<InventoryStore>));

    const response = await app.request("/api/inventory/inv-1/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        onHandQuantity: 88,
        reason: "Cycle count correction",
        note: "Quarterly count",
        lotsJson: JSON.stringify([{ lotNumber: "LOT-1", qty: 88 }]),
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        adjustment: {
          inventoryItemId: "inv-1",
          quantityBefore: 100,
          quantityAfter: 88,
          quantityDelta: -12,
          reason: "Cycle count correction",
          note: "Quarterly count",
        },
        item: {
          id: "inv-1",
          onHandQuantity: 88,
        },
      },
    });
    expect(calls[0]).toMatchObject({
      inventoryItemId: "inv-1",
      quantityBefore: 100,
      quantityAfter: 88,
      quantityDelta: -12,
      reason: "Cycle count correction",
      note: "Quarterly count",
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

  it("updates and archives receiving entries through backend routes", async () => {
    const app = createRouteApp();

    const updateResponse = await app.request("/api/inventory/receiving/receiving-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        packages: 6,
        quantityPerPackage: 20,
        lotNumber: "LOT-4",
      }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: { id: "receiving-1", totalQuantity: 120, lotNumber: "LOT-4" },
    });

    const archiveResponse = await app.request("/api/inventory/receiving/receiving-1", { method: "DELETE" });

    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      data: { id: "receiving-1", status: "archived", archivedAt: expect.any(String) },
    });
  });

  it("updates and archives move entries through backend routes without stock movement calls", async () => {
    const calls: string[] = [];
    const app = createRouteApp(createRouteStore({
      async adjustInventoryOnHand(input) { calls.push(`adjust:${input.quantityDelta}`); return true; },
      async createMovement(input) { calls.push(`movement:${input.movementType}:${input.quantityDelta}`); },
    }));

    const updateResponse = await app.request("/api/inventory/moves/move-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caseCount: 4,
        quantityPerCase: 10,
        fromLocation: "Dock",
        toLocation: "A-2",
      }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: { id: "move-1", quantityMoved: 40, toLocation: "A-2" },
    });

    const archiveResponse = await app.request("/api/inventory/moves/move-1", { method: "DELETE" });

    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      data: { id: "move-1", status: "archived", archivedAt: expect.any(String) },
    });
    expect(calls).toEqual([]);
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
