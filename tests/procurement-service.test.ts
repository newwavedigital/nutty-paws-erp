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
