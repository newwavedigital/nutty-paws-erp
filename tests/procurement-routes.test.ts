import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerProcurementRoutes } from "../src/procurement/routes";
import type {
  NeedToOrderRow,
  ProcurementOrderRecord,
  ProcurementStore,
} from "../src/procurement/service";

const needRow: NeedToOrderRow = {
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
};

const order: ProcurementOrderRecord = {
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
      quantityOrdered: 80,
      quantityReceived: 0,
      unitOfMeasure: "lb",
      unitCostCents: 250,
      suggestedQuantity: 80,
      sourceReason: "low_stock",
      sourcePurchaseOrderLineId: null,
    },
  ],
};

function createStore() {
  const calls: string[] = [];
  let currentOrder: ProcurementOrderRecord = { ...order, status: "draft" };
  const store: ProcurementStore = {
    async listNeedToOrderRows() { return [needRow]; },
    async nextOrderSequence() { return 1002; },
    async nextReceiptSequence() { return 2001; },
    async createOrder(input) { calls.push(`createOrder:${input.procurementOrderNumber}:${input.status}`); },
    async createOrderLine(input) { calls.push(`createOrderLine:${input.description}:${input.quantityOrdered}`); },
    async listOrders() { return [currentOrder]; },
    async getOrder(id) { return id === "proc-1" ? currentOrder : null; },
    async updateOrder(input) {
      calls.push(`updateOrder:${input.id}:${input.status}`);
      currentOrder = {
        ...currentOrder,
        status: input.status,
        receivedDate: input.receivedDate ?? currentOrder.receivedDate,
      };
    },
    async updateLineReceivedQuantity(input) {
      calls.push(`updateLineReceivedQuantity:${input.lineId}:${input.quantityReceived}`);
      currentOrder = {
        ...currentOrder,
        lines: currentOrder.lines.map((line) => line.id === input.lineId ? { ...line, quantityReceived: input.quantityReceived } : line),
      };
    },
    async createReceipt(input) { calls.push(`createReceipt:${input.receiptNumber}:${input.isFinal}`); },
    async createReceiptLine(input) { calls.push(`createReceiptLine:${input.procurementOrderLineId}:${input.receivedQuantity}`); },
    async increaseInventory(input) { calls.push(`increaseInventory:${input.inventoryItemId}:${input.quantity}`); },
    async createAuditEvent(input) { calls.push(`audit:${input.action}`); },
  };
  return { store, calls };
}

function createRouteApp(store: ProcurementStore) {
  return createApp((route) => registerProcurementRoutes(route, () => store));
}

describe("Sprint 6 procurement routes", () => {
  it("lists Need to Order rows and procurement orders", async () => {
    const { store } = createStore();
    const app = createRouteApp(store);

    const need = await app.request("/api/procurement/need-to-order");
    const orders = await app.request("/api/procurement/orders");

    expect(need.status).toBe(200);
    await expect(need.json()).resolves.toMatchObject({ data: [expect.objectContaining({ inventoryItemId: "inv-1" })] });
    expect(orders.status).toBe(200);
    await expect(orders.json()).resolves.toMatchObject({ data: [expect.objectContaining({ id: "proc-1" })] });
  });

  it("creates, submits, and receives procurement orders through backend commands", async () => {
    const { store, calls } = createStore();
    const app = createRouteApp(store);

    const create = await app.request("/api/procurement/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierId: "supplier-1",
        supplierNameSnapshot: "Acme Ingredients",
        dateOrdered: "2026-06-19",
        rows: [needRow],
      }),
    });
    const submit = await app.request("/api/procurement/orders/proc-1/submit", { method: "POST" });
    const receive = await app.request("/api/procurement/orders/proc-1/receive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receiptDate: "2026-06-20",
        lines: [{ procurementOrderLineId: "line-1", receivedQuantity: 80 }],
      }),
    });

    expect(create.status).toBe(200);
    expect(submit.status).toBe(200);
    expect(receive.status).toBe(200);
    expect(calls).toEqual(expect.arrayContaining([
      "createOrder:PROC-1002:draft",
      "updateOrder:proc-1:ordered",
      "increaseInventory:inv-1:80",
    ]));
  });

  it("cancels procurement orders through backend status", async () => {
    const { store, calls } = createStore();
    await store.updateOrder({ id: "proc-1", status: "ordered" });
    calls.length = 0;
    const app = createRouteApp(store);

    const cancel = await app.request("/api/procurement/orders/proc-1/cancel", { method: "POST" });

    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({ data: { status: "cancelled" } });
    expect(calls).toEqual(expect.arrayContaining([
      "updateOrder:proc-1:cancelled",
      "audit:procurement_order.cancelled",
    ]));
  });

  it("rejects malformed submit and cancel JSON instead of mutating with an empty body", async () => {
    const { store, calls } = createStore();
    const app = createRouteApp(store);

    const submit = await app.request("/api/procurement/orders/proc-1/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const cancel = await app.request("/api/procurement/orders/proc-1/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(submit.status).toBe(400);
    expect(cancel.status).toBe(400);
    expect(calls).not.toContain("updateOrder:proc-1:ordered");
    expect(calls).not.toContain("updateOrder:proc-1:cancelled");
  });
});
