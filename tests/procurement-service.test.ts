import { describe, expect, it } from "vitest";
import {
  ProcurementError,
  calculateNeedToOrderRows,
  createDraftProcurementOrder,
  receiveProcurementOrder,
  submitProcurementOrder,
  type ProcurementOrderRecord,
  type ProcurementStore,
} from "../src/procurement/service";

function makeOrder(overrides: Partial<ProcurementOrderRecord> = {}): ProcurementOrderRecord {
  return {
    id: "proc-1",
    procurementOrderNumber: "PROC-1001",
    quickBooksPoNumber: null,
    supplierId: "supplier-1",
    supplierNameSnapshot: "Acme Ingredients",
    status: "ordered",
    dateOrdered: "2026-06-19",
    expectedDate: null,
    receivedDate: null,
    notes: null,
    lines: [
      {
        id: "line-1",
        procurementOrderId: "proc-1",
        lineNumber: 1,
        masterItemId: "master-1",
        inventoryItemId: "inv-1",
        description: "Raw Peanuts",
        quantityOrdered: 100,
        quantityReceived: 0,
        unitOfMeasure: "lb",
        unitCostCents: 250,
        suggestedQuantity: 100,
        sourceReason: "low_stock",
        sourcePurchaseOrderLineId: null,
      },
    ],
    ...overrides,
  };
}

function createStore(order: ProcurementOrderRecord = makeOrder()) {
  const calls: string[] = [];
  const store: ProcurementStore = {
    async nextOrderSequence() { return 1002; },
    async nextReceiptSequence() { return 2001; },
    async createOrder(input) {
      calls.push(`createOrder:${input.procurementOrderNumber}:${input.status}`);
    },
    async createOrderLine(input) {
      calls.push(`createOrderLine:${input.description}:${input.quantityOrdered}`);
    },
    async listOrders() { return [order]; },
    async getOrder(id) { return id === order.id ? order : null; },
    async updateOrder(input) {
      calls.push(`updateOrder:${input.id}:${input.status}`);
    },
    async updateLineReceivedQuantity(input) {
      calls.push(`updateLineReceivedQuantity:${input.lineId}:${input.quantityReceived}`);
    },
    async createReceipt(input) {
      calls.push(`createReceipt:${input.receiptNumber}:${input.isFinal}`);
    },
    async createReceiptLine(input) {
      calls.push(`createReceiptLine:${input.procurementOrderLineId}:${input.receivedQuantity}`);
    },
    async increaseInventory(input) {
      calls.push(`increaseInventory:${input.inventoryItemId}:${input.quantity}`);
    },
    async createAuditEvent(input) {
      calls.push(`audit:${input.action}`);
    },
  };
  return { store, calls };
}

function createRollbackStore() {
  const calls: string[] = [];
  type InventorySnapshot = { id: string; onHandQuantity: number; lotNumber: string | null; location: string | null };
  const order = makeOrder({
    lines: [
      { ...makeOrder().lines[0], id: "line-1", inventoryItemId: "inv-1", quantityReceived: 0 },
      {
        ...makeOrder().lines[0],
        id: "line-2",
        lineNumber: 2,
        inventoryItemId: "inv-2",
        description: "Raw Cashews",
        quantityOrdered: 50,
        quantityReceived: 0,
      },
    ],
  });
  const receipts = new Map<string, { id: string }>();
  const receiptLines = new Map<string, { id: string; procurementOrderLineId: string }>();
  const inventoryItems = new Map<string, InventorySnapshot>([
    ["inv-1", { id: "inv-1", onHandQuantity: 100, lotNumber: null, location: null }],
    ["inv-2", { id: "inv-2", onHandQuantity: 80, lotNumber: null, location: null }],
  ]);

  const store: ProcurementStore & {
    calls: string[];
    receipts: typeof receipts;
    receiptLines: typeof receiptLines;
    inventoryItems: typeof inventoryItems;
  } = {
    calls,
    receipts,
    receiptLines,
    inventoryItems,
    async nextOrderSequence() { return 1002; },
    async nextReceiptSequence() { return 2001; },
    async createOrder(input) {
      calls.push(`createOrder:${input.procurementOrderNumber}:${input.status}`);
    },
    async createOrderLine(input) {
      calls.push(`createOrderLine:${input.description}:${input.quantityOrdered}`);
    },
    async listOrders() { return [order]; },
    async getOrder(id) { return id === order.id ? order : null; },
    async getInventoryItem(id) {
      calls.push(`getInventoryItem:${id}`);
      const item = inventoryItems.get(id);
      return item ? { ...item } : null;
    },
    async createReceipt(input) {
      calls.push(`createReceipt:${input.receiptNumber}:${input.isFinal}`);
      receipts.set(input.id, { id: input.id });
    },
    async createReceiptLine(input) {
      calls.push(`createReceiptLine:${input.procurementOrderLineId}:${input.receivedQuantity}`);
      receiptLines.set(input.id, { id: input.id, procurementOrderLineId: input.procurementOrderLineId });
    },
    async increaseInventory(input) {
      calls.push(`increaseInventory:${input.inventoryItemId}:${input.quantity}`);
      const item = inventoryItems.get(input.inventoryItemId)!;
      item.onHandQuantity += input.quantity;
      item.lotNumber = input.lotNumber ?? item.lotNumber;
      item.location = input.location ?? item.location;
    },
    async updateLineReceivedQuantity(input) {
      calls.push(`updateLineReceivedQuantity:${input.lineId}:${input.quantityReceived}`);
      if (input.lineId === "line-2") {
        throw new Error("line update failed");
      }
      const line = order.lines.find((candidate) => candidate.id === input.lineId);
      if (line) {
        line.quantityReceived = input.quantityReceived;
      }
    },
    async restoreInventoryItem(input) {
      calls.push(`restoreInventoryItem:${input.id}:${input.onHandQuantity}`);
      inventoryItems.set(input.id, { id: input.id, onHandQuantity: input.onHandQuantity, lotNumber: input.lotNumber, location: input.location });
    },
    async deleteReceiptLine(id) {
      calls.push(`deleteReceiptLine:${id}`);
      return receiptLines.delete(id);
    },
    async deleteReceipt(id) {
      calls.push(`deleteReceipt:${id}`);
      return receipts.delete(id);
    },
    async updateOrder(input) {
      calls.push(`updateOrder:${input.id}:${input.status}`);
      order.status = input.status;
      order.receivedDate = input.receivedDate ?? order.receivedDate;
    },
    async createAuditEvent(input) {
      calls.push(`audit:${input.action}`);
    },
  };

  return { store, calls, order, receipts, receiptLines, inventoryItems };
}

describe("Sprint 6 procurement service", () => {
  it("derives Need to Order rows from low stock and Supply Chain shortages", () => {
    const rows = calculateNeedToOrderRows({
      inventoryItems: [
        {
          id: "inv-low",
          masterItemId: "master-low",
          name: "Low Labels",
          supplierId: "supplier-1",
          onHandQuantity: 40,
          allocatedQuantity: 10,
          reorderPointQuantity: 50,
          unitOfMeasure: "ea",
          unitCostCents: 6,
          leadTimeDays: 10,
        },
        {
          id: "inv-short",
          masterItemId: "master-short",
          name: "Short Peanuts",
          supplierId: "supplier-2",
          onHandQuantity: 200,
          allocatedQuantity: 25,
          reorderPointQuantity: 50,
          unitOfMeasure: "lb",
          unitCostCents: 250,
          leadTimeDays: 7,
        },
      ],
      supplyChainDemands: [
        { inventoryItemId: "inv-short", purchaseOrderLineId: "po-line-1", requiredQuantity: 260 },
      ],
      activeProcurementCoverage: new Map(),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        inventoryItemId: "inv-low",
        reason: "low_stock",
        netAvailableQuantity: 30,
        suggestedQuantity: 60,
      }),
      expect.objectContaining({
        inventoryItemId: "inv-short",
        reason: "supply_chain_shortage",
        shortageQuantity: 85,
        suggestedQuantity: 135,
      }),
    ]);
  });

  it("creates a draft procurement order from selected Need to Order rows", async () => {
    const { store, calls } = createStore();

    const order = await createDraftProcurementOrder(store, {
      supplierId: "supplier-1",
      supplierNameSnapshot: "Acme Ingredients",
      quickBooksPoNumber: null,
      dateOrdered: "2026-06-19",
      expectedDate: null,
      notes: "Draft from Need to Order",
      actorUserId: "user-1",
      rows: [
        {
          inventoryItemId: "inv-1",
          masterItemId: "master-1",
          name: "Raw Peanuts",
          supplierId: "supplier-1",
          onHandQuantity: 20,
          allocatedQuantity: 0,
          netAvailableQuantity: 20,
          reorderPointQuantity: 50,
          shortageQuantity: 0,
          suggestedQuantity: 80,
          unitOfMeasure: "lb",
          unitCostCents: 250,
          leadTimeDays: 7,
          reason: "low_stock",
          sourcePurchaseOrderLineId: null,
        },
      ],
    });

    expect(order).toMatchObject({
      procurementOrderNumber: "PROC-1002",
      status: "draft",
      quickBooksPoNumber: null,
      lines: [expect.objectContaining({ quantityOrdered: 80, quantityReceived: 0 })],
    });
    expect(calls).toEqual([
      "createOrder:PROC-1002:draft",
      "createOrderLine:Raw Peanuts:80",
      "audit:procurement_order.created",
    ]);
  });

  it("submits a draft procurement order to Ordered for human-reviewed purchasing", async () => {
    const { store, calls } = createStore(makeOrder({ status: "draft" }));

    const submitted = await submitProcurementOrder(store, {
      procurementOrderId: "proc-1",
      actorUserId: "user-1",
    });

    expect(submitted.status).toBe("ordered");
    expect(calls).toContain("updateOrder:proc-1:ordered");
    expect(calls).toContain("audit:procurement_order.submitted");
  });

  it("partially receives a procurement order and increases inventory once", async () => {
    const { store, calls } = createStore();

    const received = await receiveProcurementOrder(store, {
      procurementOrderId: "proc-1",
      receiptDate: "2026-06-20",
      actorUserId: "user-1",
      lines: [{ procurementOrderLineId: "line-1", receivedQuantity: 40, lotNumber: "LOT-1", location: "Dock" }],
    });

    expect(received.status).toBe("partially_received");
    expect(calls).toEqual([
      "createReceipt:PRR-2001:false",
      "createReceiptLine:line-1:40",
      "increaseInventory:inv-1:40",
      "updateLineReceivedQuantity:line-1:40",
      "updateOrder:proc-1:partially_received",
      "audit:procurement_order.received",
    ]);
  });

  it("uses the atomic receive transaction hook when the store supports it", async () => {
    const { store, calls } = createStore();
    const transactionalStore = store as ProcurementStore & {
      receiveOrderTransaction: NonNullable<ProcurementStore["receiveOrderTransaction"]>;
    };
    transactionalStore.receiveOrderTransaction = async (input) => {
      calls.push(`receiveOrderTransaction:${input.receipt.receiptNumber}:${input.lines.length}:${input.orderUpdate.status}`);
    };

    const received = await receiveProcurementOrder(transactionalStore, {
      procurementOrderId: "proc-1",
      receiptDate: "2026-06-20",
      actorUserId: "user-1",
      lines: [{ procurementOrderLineId: "line-1", receivedQuantity: 40, lotNumber: "LOT-1", location: "Dock" }],
    });

    expect(received.status).toBe("partially_received");
    expect(calls).toEqual(["receiveOrderTransaction:PRR-2001:1:partially_received"]);
  });

  it("rolls back receipt, inventory, and line updates when a later write fails", async () => {
    const { store, calls, order, receipts, receiptLines, inventoryItems } = createRollbackStore();

    await expect(receiveProcurementOrder(store, {
      procurementOrderId: "proc-1",
      receiptDate: "2026-06-20",
      actorUserId: "user-1",
      lines: [
        { procurementOrderLineId: "line-1", receivedQuantity: 40, lotNumber: "LOT-1", location: "Dock" },
        { procurementOrderLineId: "line-2", receivedQuantity: 20, lotNumber: "LOT-2", location: "Dock" },
      ],
    })).rejects.toThrow("line update failed");

    expect(order.status).toBe("ordered");
    expect(order.lines[0].quantityReceived).toBe(0);
    expect(order.lines[1].quantityReceived).toBe(0);
    expect(inventoryItems.get("inv-1")?.onHandQuantity).toBe(100);
    expect(inventoryItems.get("inv-2")?.onHandQuantity).toBe(80);
    expect(receipts.size).toBe(0);
    expect(receiptLines.size).toBe(0);
    expect(calls.some((call) => call.startsWith("deleteReceiptLine:procurement_receipt_line_"))).toBe(true);
    expect(calls.some((call) => call.startsWith("deleteReceipt:procurement_receipt_"))).toBe(true);
  });

  it("fails closed before writing when a receipt line inventory item is missing", async () => {
    const { store, calls } = createStore(makeOrder({
      lines: [{ ...makeOrder().lines[0], inventoryItemId: "inv-missing" }],
    }));
    const guardedStore = store as ProcurementStore & {
      getInventoryItem: NonNullable<ProcurementStore["getInventoryItem"]>;
    };
    guardedStore.getInventoryItem = async (id) => {
      calls.push(`getInventoryItem:${id}`);
      return null;
    };

    await expect(receiveProcurementOrder(guardedStore, {
      procurementOrderId: "proc-1",
      receiptDate: "2026-06-20",
      lines: [{ procurementOrderLineId: "line-1", receivedQuantity: 40 }],
    })).rejects.toEqual(
      new ProcurementError("PROCUREMENT_INVENTORY_ITEM_NOT_FOUND", "Inventory item is required for procurement order line line-1"),
    );
    expect(calls).toEqual(["getInventoryItem:inv-missing"]);
    expect(calls).not.toContain("createReceipt:PRR-2001:false");
  });

  it("blocks over-receipt and duplicate completed receipt before inventory changes", async () => {
    const { store, calls } = createStore(makeOrder({
      status: "completed",
      receivedDate: "2026-06-20",
      lines: [makeOrder().lines[0] && { ...makeOrder().lines[0], quantityReceived: 100 }],
    }));

    await expect(receiveProcurementOrder(store, {
      procurementOrderId: "proc-1",
      receiptDate: "2026-06-21",
      lines: [{ procurementOrderLineId: "line-1", receivedQuantity: 1 }],
    })).rejects.toEqual(new ProcurementError("PROCUREMENT_ORDER_ALREADY_COMPLETED", "Procurement order is already completed"));

    expect(calls).toEqual([]);
  });
});
