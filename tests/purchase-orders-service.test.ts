import { describe, expect, it } from "vitest";
import { InventoryError, type InventoryStore } from "../src/inventory/service";
import {
  POError,
  approvePurchaseOrderForProduction,
  createPurchaseOrder,
  reviewPurchaseOrderLineSupplyChain,
  submitPurchaseOrder,
  updatePurchaseOrderDepositStatus,
  updatePurchaseOrderSafeFields,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStore,
} from "../src/purchase-orders/service";

function makePurchaseOrder(overrides: Partial<PurchaseOrderRecord> = {}): PurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "draft",
    depositStatus: "not_required",
    requestedShipDate: null,
    notes: null,
    lines: [
      {
        id: "line-1",
        purchaseOrderId: "po-1",
        lineNumber: 1,
        description: "Almond butter",
        quantity: 25,
        unitOfMeasure: "lb",
        productId: null,
        masterItemId: "master-1",
        supplyChainStatus: "available",
      },
    ],
    ...overrides,
  };
}

function createPOStore(overrides: Partial<PurchaseOrderStore> = {}) {
  const calls: string[] = [];
  let po = makePurchaseOrder();

  const store: PurchaseOrderStore & { calls: string[]; setPO(next: PurchaseOrderRecord): void } = {
    calls,
    setPO(next) {
      po = next;
    },
    async createPurchaseOrder(input) {
      calls.push(`createPurchaseOrder:${input.id}:${input.poNumber}`);
    },
    async createPurchaseOrderLine(input) {
      calls.push(`createPurchaseOrderLine:${input.id}:${input.lineNumber}`);
    },
    async listPurchaseOrders() {
      calls.push("listPurchaseOrders");
      return [po];
    },
    async getPurchaseOrder(id) {
      calls.push(`getPurchaseOrder:${id}`);
      return po.id === id ? po : null;
    },
    async updatePurchaseOrderSafeFields(id, input) {
      calls.push(`updatePurchaseOrderSafeFields:${id}:${input.notes}:${input.requestedShipDate}`);
      po = { ...po, ...input };
      return po;
    },
    async updatePurchaseOrderStatus(id, status) {
      calls.push(`updatePurchaseOrderStatus:${id}:${status}`);
      po = { ...po, status };
    },
    async updatePurchaseOrderDepositStatus(id, depositStatus) {
      calls.push(`updatePurchaseOrderDepositStatus:${id}:${depositStatus}`);
      po = { ...po, depositStatus };
    },
    async updateLineSupplyChainStatus(lineId, status) {
      calls.push(`updateLineSupplyChainStatus:${lineId}:${status}`);
      po = {
        ...po,
        lines: po.lines.map((line) =>
          line.id === lineId ? { ...line, supplyChainStatus: status } : line,
        ),
      };
    },
    async createStatusEvent(input) {
      calls.push(`createStatusEvent:${input.fromStatus}->${input.toStatus}:${input.eventType}`);
    },
    async createAuditEvent(input) {
      calls.push(`createAuditEvent:${input.action}`);
    },
    async findInventoryItemByMasterItemId(masterItemId) {
      calls.push(`findInventoryItemByMasterItemId:${masterItemId}`);
      return { id: "inv-1" };
    },
    ...overrides,
  };

  return store;
}

function createInventoryStore(overrides: Partial<InventoryStore> = {}) {
  const calls: string[] = [];
  const store: InventoryStore & { calls: string[] } = {
    calls,
    async getInventoryItem(id) {
      calls.push(`getInventoryItem:${id}`);
      return { id, onHandQuantity: 100, allocatedQuantity: 0, unitOfMeasure: "lb" };
    },
    async allocateInventoryItem(id, quantity) {
      calls.push(`allocateInventoryItem:${id}:${quantity}`);
      return true;
    },
    async createReservation(input) {
      calls.push(`createReservation:${input.purchaseOrderLineId}:${input.quantity}`);
    },
    async createMovement(input) {
      calls.push(`createMovement:${input.movementType}:${input.quantityDelta}`);
    },
    async createAuditEvent(input) {
      calls.push(`createInventoryAudit:${input.action}`);
    },
    async getActiveReservation() {
      return null;
    },
    async releaseReservationRecord() {},
    async releaseInventoryItemAllocation() {},
    ...overrides,
  };

  return store;
}

describe("purchase order workflow service", () => {
  it("creates a draft purchase order with lines", async () => {
    const store = createPOStore();

    const result = await createPurchaseOrder(store, {
      poNumber: "PO-1001",
      customerId: "customer-1",
      requestedShipDate: "2026-07-01",
      notes: "rush",
      actorUserId: "user-1",
      lines: [
        {
          description: "Almond butter",
          quantity: 25,
          unitOfMeasure: "lb",
          masterItemId: "master-1",
        },
      ],
    });

    expect(result).toMatchObject({
      id: expect.stringMatching(/^po_/),
      poNumber: "PO-1001",
      customerId: "customer-1",
      status: "draft",
      depositStatus: "not_required",
      requestedShipDate: "2026-07-01",
      notes: "rush",
      lines: [
        expect.objectContaining({
          id: expect.stringMatching(/^po_line_/),
          lineNumber: 1,
          description: "Almond butter",
          quantity: 25,
          unitOfMeasure: "lb",
          masterItemId: "master-1",
          supplyChainStatus: "pending",
        }),
      ],
    });
    expect(store.calls).toEqual([
      `createPurchaseOrder:${result.id}:PO-1001`,
      `createPurchaseOrderLine:${result.lines[0].id}:1`,
      "createAuditEvent:purchase_order.created",
    ]);
  });

  it("updates only safe purchase order fields", async () => {
    const store = createPOStore();

    const result = await updatePurchaseOrderSafeFields(store, {
      purchaseOrderId: "po-1",
      notes: "updated",
      requestedShipDate: "2026-08-01",
      ignoredUnsafeFields: ["status", "depositStatus"],
      actorUserId: "user-1",
    });

    expect(result.notes).toBe("updated");
    expect(result.requestedShipDate).toBe("2026-08-01");
    expect(result.status).toBe("draft");
    expect(result.depositStatus).toBe("not_required");
    expect(store.calls).toContain("createAuditEvent:purchase_order.updated");
  });

  it("submits a draft purchase order and writes status and audit events", async () => {
    const store = createPOStore();

    const result = await submitPurchaseOrder(store, {
      purchaseOrderId: "po-1",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("submitted");
    expect(store.calls).toEqual([
      "getPurchaseOrder:po-1",
      "updatePurchaseOrderStatus:po-1:submitted",
      "createStatusEvent:draft->submitted:purchase_order.submitted",
      "createAuditEvent:purchase_order.submitted",
      "getPurchaseOrder:po-1",
    ]);
  });

  it("reviews a purchase order line for Supply Chain and writes an audit event", async () => {
    const store = createPOStore();

    const result = await reviewPurchaseOrderLineSupplyChain(store, {
      purchaseOrderId: "po-1",
      lineId: "line-1",
      supplyChainStatus: "available",
      actorUserId: "user-1",
    });

    expect(result.lines[0].supplyChainStatus).toBe("available");
    expect(store.calls).toContain("updateLineSupplyChainStatus:line-1:available");
    expect(store.calls).toContain("createAuditEvent:purchase_order.line_supply_chain_reviewed");
  });

  it("updates deposit status and writes an audit event", async () => {
    const store = createPOStore();

    const result = await updatePurchaseOrderDepositStatus(store, {
      purchaseOrderId: "po-1",
      depositStatus: "received",
      actorUserId: "user-1",
    });

    expect(result.depositStatus).toBe("received");
    expect(store.calls).toContain("updatePurchaseOrderDepositStatus:po-1:received");
    expect(store.calls).toContain("createAuditEvent:purchase_order.deposit_status_updated");
  });

  it("approves for production, reserves linked inventory, and writes status and audit events", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder(id) {
        poStore.calls.push(`getPurchaseOrder:${id}`);
        return makePurchaseOrder({ status: "submitted", depositStatus: "received" });
      },
    });
    const inventoryStore = createInventoryStore();

    const result = await approvePurchaseOrderForProduction(poStore, inventoryStore, {
      purchaseOrderId: "po-1",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("approved_for_production");
    expect(poStore.calls).toEqual([
      "getPurchaseOrder:po-1",
      "findInventoryItemByMasterItemId:master-1",
      "updatePurchaseOrderStatus:po-1:approved_for_production",
      "createStatusEvent:submitted->approved_for_production:purchase_order.approved_for_production",
      "createAuditEvent:purchase_order.approved_for_production",
      "getPurchaseOrder:po-1",
    ]);
    expect(inventoryStore.calls).toEqual([
      "getInventoryItem:inv-1",
      "allocateInventoryItem:inv-1:25",
      "createReservation:line-1:25",
      "createMovement:reserved:25",
      "createInventoryAudit:inventory.reserved",
    ]);
  });

  it("blocks approval when deposit status is not acceptable", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder() {
        return makePurchaseOrder({ status: "submitted", depositStatus: "required" });
      },
    });

    await expect(
      approvePurchaseOrderForProduction(poStore, createInventoryStore(), {
        purchaseOrderId: "po-1",
      }),
    ).rejects.toEqual(new POError("DEPOSIT_NOT_READY", "Deposit status is not ready for production"));
  });

  it("blocks approval when any line is not available", async () => {
    const line: PurchaseOrderLineRecord = {
      ...makePurchaseOrder().lines[0],
      supplyChainStatus: "needs_ordering",
    };
    const poStore = createPOStore({
      async getPurchaseOrder() {
        return makePurchaseOrder({ status: "submitted", depositStatus: "received", lines: [line] });
      },
    });

    await expect(
      approvePurchaseOrderForProduction(poStore, createInventoryStore(), {
        purchaseOrderId: "po-1",
      }),
    ).rejects.toEqual(new POError("LINES_NOT_AVAILABLE", "All purchase order lines must be available"));
  });

  it("does not approve when inventory reservation fails", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder() {
        return makePurchaseOrder({ status: "submitted", depositStatus: "received" });
      },
    });
    const inventoryStore = createInventoryStore({
      async allocateInventoryItem() {
        return false;
      },
    });

    await expect(
      approvePurchaseOrderForProduction(poStore, inventoryStore, {
        purchaseOrderId: "po-1",
      }),
    ).rejects.toEqual(
      new InventoryError("INSUFFICIENT_INVENTORY", "Insufficient net available inventory"),
    );
    expect(poStore.calls).not.toContain("updatePurchaseOrderStatus:po-1:approved_for_production");
  });
});
