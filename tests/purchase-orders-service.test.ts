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
    postShipmentCoaFileId: null,
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
    async transitionPurchaseOrder(input) {
      calls.push(`transitionPurchaseOrder:${input.fromStatus}->${input.toStatus}:${input.eventType}`);
      po = { ...po, status: input.toStatus };
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
    async listProductBomItems(productId) {
      calls.push(`listProductBomItems:${productId}`);
      return [
        { productId, masterItemId: "master-almond", quantityPerUnit: 2 },
      ];
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
    async releaseReservationRecord() { return true; },
    async releaseInventoryItemAllocation() { return true; },
    ...overrides,
  };

  return store;
}

function createRollbackInventoryStore() {
  const calls: string[] = [];
  const items = new Map([
    ["inv-1", { id: "inv-1", onHandQuantity: 100, allocatedQuantity: 0, unitOfMeasure: "lb" }],
    ["inv-2", { id: "inv-2", onHandQuantity: 50, allocatedQuantity: 0, unitOfMeasure: "lb" }],
  ]);
  const reservations = new Map<string, { id: string; inventoryItemId: string; purchaseOrderLineId: string; quantity: number; status: "active" | "released" }>();
  const movements = new Set<string>();
  const reservationLineById = new Map<string, string>();
  let failingReservationId: string | null = null;

  const store: InventoryStore & { calls: string[]; items: typeof items; reservations: typeof reservations } = {
    calls,
    items,
    reservations,
    async getInventoryItem(id) {
      calls.push(`getInventoryItem:${id}`);
      const item = items.get(id);
      return item ? { id: item.id, onHandQuantity: item.onHandQuantity, allocatedQuantity: item.allocatedQuantity, unitOfMeasure: item.unitOfMeasure } : null;
    },
    async allocateInventoryItem(id, quantity) {
      calls.push(`allocateInventoryItem:${id}:${quantity}`);
      const item = items.get(id)!;
      if (item.allocatedQuantity + quantity > item.onHandQuantity) return false;
      item.allocatedQuantity += quantity;
      return true;
    },
    async createReservation(input) {
      calls.push(`createReservation:${input.purchaseOrderLineId}:${input.quantity}`);
      reservations.set(input.id, {
        id: input.id,
        inventoryItemId: input.inventoryItemId,
        purchaseOrderLineId: input.purchaseOrderLineId,
        quantity: input.quantity,
        status: "active",
      });
      reservationLineById.set(input.id, input.purchaseOrderLineId);
      if (input.purchaseOrderLineId === "line-2") {
        failingReservationId = input.id;
      }
    },
    async createMovement(input) {
      calls.push(`createMovement:${input.movementType}:${input.quantityDelta}`);
      if (input.id) movements.add(input.id);
    },
    async createAuditEvent(input) {
      calls.push(`createAuditEvent:${input.entityId}:${input.action}`);
      if (input.action === "inventory.reserved" && input.entityId === failingReservationId) {
        throw new Error("inventory reservation audit failed");
      }
    },
    async getActiveReservation(id) {
      const reservation = reservations.get(id);
      return reservation && reservation.status === "active"
        ? {
            id: reservation.id,
            inventoryItemId: reservation.inventoryItemId,
            purchaseOrderLineId: reservation.purchaseOrderLineId,
            quantity: reservation.quantity,
            status: "active" as const,
          }
        : null;
    },
    async releaseReservationRecord(id) {
      calls.push(`releaseReservationRecord:${id}`);
      const reservation = reservations.get(id);
      if (!reservation || reservation.status !== "active") return false;
      reservation.status = "released";
      return true;
    },
    async releaseInventoryItemAllocation(id, quantity) {
      calls.push(`releaseInventoryItemAllocation:${id}:${quantity}`);
      const item = items.get(id);
      if (!item || item.allocatedQuantity < quantity) return false;
      item.allocatedQuantity -= quantity;
      return true;
    },
    async deleteMovement(id) {
      calls.push(`deleteMovement:${id}`);
      return movements.delete(id);
    },
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

    expect(result.status).toBe("supply_chain_review");
    expect(store.calls).toEqual([
      "getPurchaseOrder:po-1",
      "transitionPurchaseOrder:draft->supply_chain_review:purchase_order.submitted",
      "getPurchaseOrder:po-1",
    ]);
  });

  it("blocks ordinary edits after a purchase order is approved for production", async () => {
    const store = createPOStore();
    store.setPO(makePurchaseOrder({ status: "approved_for_production" }));

    await expect(
      updatePurchaseOrderSafeFields(store, {
        purchaseOrderId: "po-1",
        notes: "late change",
        requestedShipDate: "2026-08-01",
      }),
    ).rejects.toEqual(
      new POError(
        "PO_LOCKED_FOR_PRODUCTION",
        "Approved-for-production purchase orders cannot be edited from ordinary PO entry",
      ),
    );
    expect(store.calls).not.toContain("updatePurchaseOrderSafeFields:po-1:late change:2026-08-01");
  });

  it("reviews a purchase order line for Supply Chain and writes an audit event", async () => {
    const store = createPOStore();
    store.setPO(makePurchaseOrder({ status: "supply_chain_review" }));

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

  it("blocks supply-chain line review for closed purchase orders", async () => {
    const store = createPOStore();
    store.setPO(makePurchaseOrder({ status: "completed" }));

    await expect(
      reviewPurchaseOrderLineSupplyChain(store, {
        purchaseOrderId: "po-1",
        lineId: "line-1",
        supplyChainStatus: "available",
      }),
    ).rejects.toEqual(
      new POError("SUPPLY_CHAIN_REVIEW_LOCKED", "Supply Chain review is only available for active review purchase orders"),
    );
    expect(store.calls).not.toContain("updateLineSupplyChainStatus:line-1:available");
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
        return makePurchaseOrder({ status: "supply_chain_review", depositStatus: "received" });
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
      "transitionPurchaseOrder:supply_chain_review->approved_for_production:purchase_order.approved_for_production",
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

  it("reserves BOM quantities times ordered units plus the 5 percent planning buffer", async () => {
    const poStore = createPOStore();
    poStore.setPO(
      makePurchaseOrder({
        status: "supply_chain_review",
        depositStatus: "received",
        lines: [
          {
            ...makePurchaseOrder().lines[0],
            productId: "product-1",
            masterItemId: null,
            quantity: 10,
            supplyChainStatus: "available",
          },
        ],
      }),
    );
    const inventoryStore = createInventoryStore({
      async getInventoryItem(id) {
        inventoryStore.calls.push(`getInventoryItem:${id}`);
        return { id, onHandQuantity: 100, allocatedQuantity: 79, unitOfMeasure: "lb" };
      },
    });

    const result = await approvePurchaseOrderForProduction(poStore, inventoryStore, {
      purchaseOrderId: "po-1",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("approved_for_production");
    expect(poStore.calls).toContain("listProductBomItems:product-1");
    expect(poStore.calls).toContain("findInventoryItemByMasterItemId:master-almond");
    expect(inventoryStore.calls).toContain("allocateInventoryItem:inv-1:21");
    expect(inventoryStore.calls).toContain("createReservation:line-1:21");
  });

  it("blocks approval when deposit status is not acceptable", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder() {
        return makePurchaseOrder({ status: "supply_chain_review", depositStatus: "required" });
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
        return makePurchaseOrder({ status: "supply_chain_review", depositStatus: "received", lines: [line] });
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
        return makePurchaseOrder({ status: "supply_chain_review", depositStatus: "received" });
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

  it("rolls back earlier reservations when a later approval reservation fails", async () => {
    const poStore = createPOStore({
      async findInventoryItemByMasterItemId(masterItemId) {
        poStore.calls.push(`findInventoryItemByMasterItemId:${masterItemId}`);
        return { id: masterItemId === "master-2" ? "inv-2" : "inv-1" };
      },
    });
    poStore.setPO(
      makePurchaseOrder({
        status: "supply_chain_review",
        depositStatus: "received",
        lines: [
          { ...makePurchaseOrder().lines[0], id: "line-1", masterItemId: "master-1" },
          { ...makePurchaseOrder().lines[0], id: "line-2", lineNumber: 2, masterItemId: "master-2" },
        ],
      }),
    );
    const inventoryStore = createInventoryStore({
      async getInventoryItem(id) {
        inventoryStore.calls.push(`getInventoryItem:${id}`);
        return { id, onHandQuantity: 100, allocatedQuantity: 0, unitOfMeasure: "lb" };
      },
      async allocateInventoryItem(id, quantity) {
        inventoryStore.calls.push(`allocateInventoryItem:${id}:${quantity}`);
        return id !== "inv-2";
      },
      async getActiveReservation(id) {
        inventoryStore.calls.push(`getActiveReservation:${id}`);
        return { id, inventoryItemId: "inv-1", purchaseOrderLineId: "line-1", quantity: 25, status: "active" };
      },
      async releaseInventoryItemAllocation(id, quantity) {
        inventoryStore.calls.push(`releaseInventoryItemAllocation:${id}:${quantity}`);
        return true;
      },
      async releaseReservationRecord(id) {
        inventoryStore.calls.push(`releaseReservationRecord:${id}`);
        return true;
      },
    });

    await expect(
      approvePurchaseOrderForProduction(poStore, inventoryStore, {
        purchaseOrderId: "po-1",
      }),
    ).rejects.toEqual(
      new InventoryError("INSUFFICIENT_INVENTORY", "Insufficient net available inventory"),
    );
    expect(inventoryStore.calls).toContain("allocateInventoryItem:inv-1:25");
    expect(inventoryStore.calls).toContain("allocateInventoryItem:inv-2:25");
    expect(inventoryStore.calls).toContain("releaseInventoryItemAllocation:inv-1:25");
    expect(inventoryStore.calls.some((call) => call.startsWith("releaseReservationRecord:reservation_"))).toBe(true);
    expect(poStore.calls).not.toContain("updatePurchaseOrderStatus:po-1:approved_for_production");
  });

  it("rolls back a partially created later reservation when its write path fails", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder(id) {
        poStore.calls.push(`getPurchaseOrder:${id}`);
        return makePurchaseOrder({
          status: "supply_chain_review",
          depositStatus: "received",
          lines: [
            { ...makePurchaseOrder().lines[0], id: "line-1", masterItemId: "master-1" },
            { ...makePurchaseOrder().lines[0], id: "line-2", lineNumber: 2, masterItemId: "master-2" },
          ],
        });
      },
      async findInventoryItemByMasterItemId(masterItemId) {
        poStore.calls.push(`findInventoryItemByMasterItemId:${masterItemId}`);
        return { id: masterItemId === "master-1" ? "inv-1" : "inv-2" };
      },
    });
    const inventoryStore = createRollbackInventoryStore();

    await expect(
      approvePurchaseOrderForProduction(poStore, inventoryStore, {
        purchaseOrderId: "po-1",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow("inventory reservation audit failed");

    expect(inventoryStore.items.get("inv-1")?.allocatedQuantity).toBe(0);
    expect(inventoryStore.items.get("inv-2")?.allocatedQuantity).toBe(0);
    expect(inventoryStore.reservations.size).toBe(2);
    expect([...inventoryStore.reservations.values()].every((reservation) => reservation.status === "released")).toBe(true);
    expect(poStore.calls).not.toContain("updatePurchaseOrderStatus:po-1:approved_for_production");
  });

  it("does not leave a status-only transition when the atomic transition write fails", async () => {
    const store = createPOStore({
      async transitionPurchaseOrder(input) {
        store.calls.push(`transitionPurchaseOrder:${input.fromStatus}->${input.toStatus}:${input.eventType}`);
        throw new Error("status history insert failed");
      },
    });

    await expect(
      submitPurchaseOrder(store, {
        purchaseOrderId: "po-1",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow("status history insert failed");

    expect(await store.getPurchaseOrder("po-1")).toMatchObject({ status: "draft" });
    expect(store.calls).not.toContain("updatePurchaseOrderStatus:po-1:supply_chain_review");
    expect(store.calls).not.toContain("createStatusEvent:draft->supply_chain_review:purchase_order.submitted");
  });
});
