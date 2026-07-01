import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { NotifySubmittedPurchaseOrder } from "../src/notifications/service";
import { registerPurchaseOrderRoutes } from "../src/purchase-orders/routes";
import type { InventoryStore } from "../src/inventory/service";
import type { PurchaseOrderRecord, PurchaseOrderStore } from "../src/purchase-orders/service";

function makePO(overrides: Partial<PurchaseOrderRecord> = {}): PurchaseOrderRecord {
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
  let po = makePO();
  const store: PurchaseOrderStore = {
    async createPurchaseOrder() {},
    async createPurchaseOrderLine() {},
    async listPurchaseOrders() {
      return [po];
    },
    async getPurchaseOrder(id) {
      return id === po.id ? po : null;
    },
    async updatePurchaseOrderSafeFields(id, input) {
      po = { ...po, ...input };
      return id === po.id ? po : null;
    },
    async updatePurchaseOrderStatus(id, status) {
      po = { ...po, status };
    },
    async updatePurchaseOrderDepositStatus(id, depositStatus) {
      po = { ...po, depositStatus };
    },
    async updateLineSupplyChainStatus(lineId, status) {
      po = {
        ...po,
        lines: po.lines.map((line) => (line.id === lineId ? { ...line, supplyChainStatus: status } : line)),
      };
    },
    async createStatusEvent() {},
    async createAuditEvent() {},
    async findInventoryItemByMasterItemId() {
      return { id: "inv-1" };
    },
    async listProductBomItems() {
      return [];
    },
    ...overrides,
  };

  return store;
}

function createInventoryStore(overrides: Partial<InventoryStore> = {}) {
  const store: InventoryStore = {
    async getInventoryItem(id) {
      return { id, onHandQuantity: 100, allocatedQuantity: 0, unitOfMeasure: "lb" };
    },
    async allocateInventoryItem() {
      return true;
    },
    async createReservation() {},
    async createMovement() {},
    async createAuditEvent() {},
    async getActiveReservation() {
      return null;
    },
    async releaseReservationRecord() {},
    async releaseInventoryItemAllocation() {},
    ...overrides,
  };

  return store;
}

function createRouteApp(
  poStore: PurchaseOrderStore = createPOStore(),
  inventoryStore: InventoryStore = createInventoryStore(),
  notifySubmittedPurchaseOrder?: NotifySubmittedPurchaseOrder,
) {
  return createApp((route) =>
    registerPurchaseOrderRoutes(route, () => poStore, () => inventoryStore, undefined, notifySubmittedPurchaseOrder),
  );
}

describe("purchase order routes", () => {
  it("creates purchase orders using the shared success envelope", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/purchase-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        poNumber: "PO-NEW-1001",
        customerId: "customer-1",
        requestedShipDate: "2026-07-01",
        notes: "rush",
        actorUserId: "user-1",
        lines: [{ description: "Almond butter", quantity: 25, unitOfMeasure: "lb", masterItemId: "master-1" }],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string; lines: Array<{ id: string }> } };
    expect(body).toMatchObject({
      ok: true,
      data: {
        poNumber: "PO-NEW-1001",
        status: "draft",
        depositStatus: "not_required",
      },
      meta: { requestId: null },
    });
    expect(body.data.id).toMatch(/^po_/);
    expect(body.data.lines[0].id).toMatch(/^po_line_/);
  });

  it("lists and reads purchase orders", async () => {
    const app = createRouteApp();

    const listResponse = await app.request("/api/purchase-orders");
    const readResponse = await app.request("/api/purchase-orders/po-1");

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({ ok: true, data: [makePO()] });
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({ ok: true, data: makePO() });
  });

  it("updates safe fields without accepting unsafe status changes", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/purchase-orders/po-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "updated", requestedShipDate: "2026-08-01", status: "cancelled" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { notes: "updated", requestedShipDate: "2026-08-01", status: "draft" },
    });
  });

  it("runs workflow command endpoints", async () => {
    const poStore = createPOStore();
    const app = createRouteApp(poStore);

    const submit = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });
    const review = await app.request("/api/purchase-orders/po-1/lines/line-1/supply-chain-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplyChainStatus: "available" }),
    });
    const deposit = await app.request("/api/purchase-orders/po-1/deposit-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ depositStatus: "received" }),
    });
    const cancel = await app.request("/api/purchase-orders/po-1/cancel", { method: "POST" });

    expect(submit.status).toBe(200);
    expect(review.status).toBe(200);
    expect(deposit.status).toBe(200);
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({
      ok: true,
      data: { status: "cancelled" },
    });
  });

  it("returns Supply Chain queue status when a purchase order is submitted", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { status: "supply_chain_review" },
    });
  });

  it("logs submitted-PO notification delivery after successful submit", async () => {
    const auditEvents: Array<{ action: string; metadata: Record<string, unknown> }> = [];
    const poStore = createPOStore({
      async createAuditEvent(input) {
        auditEvents.push({ action: input.action, metadata: input.metadata });
      },
    });
    const app = createRouteApp(poStore, createInventoryStore(), async () => ({ status: "sent" }));

    const response = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual({
      action: "purchase_order.notification_sent",
      metadata: { channel: "sendgrid", notificationType: "submitted_po", status: "sent" },
    });
  });

  it("logs submitted-PO notification failures without blocking submit", async () => {
    const auditEvents: Array<{ action: string; metadata: Record<string, unknown> }> = [];
    const poStore = createPOStore({
      async createAuditEvent(input) {
        auditEvents.push({ action: input.action, metadata: input.metadata });
      },
    });
    const app = createRouteApp(poStore, createInventoryStore(), async () => ({
      status: "failed",
      error: "SendGrid down",
    }));

    const response = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual({
      action: "purchase_order.notification_failed",
      metadata: {
        channel: "sendgrid",
        notificationType: "submitted_po",
        status: "failed",
        error: "SendGrid down",
      },
    });
  });

  it("logs submitted-PO notification skips after successful submit", async () => {
    const auditEvents: Array<{ action: string; metadata: Record<string, unknown> }> = [];
    const poStore = createPOStore({
      async createAuditEvent(input) {
        auditEvents.push({ action: input.action, metadata: input.metadata });
      },
    });
    const app = createRouteApp(poStore, createInventoryStore(), async () => ({
      status: "skipped",
      reason: "disabled",
    }));

    const response = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual({
      action: "purchase_order.notification_skipped",
      metadata: {
        channel: "sendgrid",
        notificationType: "submitted_po",
        status: "skipped",
        reason: "disabled",
      },
    });
  });

  it("does not notify when non-draft submit is rejected", async () => {
    const poStore = createPOStore({
      async getPurchaseOrder(id) {
        return id === "po-1" ? makePO({ status: "supply_chain_review" }) : null;
      },
    });
    let notifyCount = 0;
    const app = createRouteApp(poStore, createInventoryStore(), async () => {
      notifyCount += 1;
      return { status: "sent" };
    });

    const response = await app.request("/api/purchase-orders/po-1/submit", { method: "POST" });

    expect(response.status).toBe(409);
    expect(notifyCount).toBe(0);
  });

  it("blocks ordinary edits to approved-for-production purchase orders", async () => {
    const app = createRouteApp(
      createPOStore({
        async getPurchaseOrder(id) {
          return id === "po-1" ? makePO({ status: "approved_for_production" }) : null;
        },
      }),
    );

    const response = await app.request("/api/purchase-orders/po-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "late change" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "PO_LOCKED_FOR_PRODUCTION",
        message: "Approved-for-production purchase orders cannot be edited from ordinary PO entry",
      },
      meta: { requestId: null },
    });
  });

  it("returns validation errors for invalid request bodies", async () => {
    const app = createRouteApp();

    const response = await app.request("/api/purchase-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns blocked workflow errors through the shared error envelope", async () => {
    const app = createRouteApp(createPOStore({ async getPurchaseOrder() { return makePO({ depositStatus: "required" }); } }));

    const response = await app.request("/api/purchase-orders/po-1/approve-for-production", { method: "POST" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "DEPOSIT_NOT_READY",
        message: "Deposit status is not ready for production",
      },
      meta: { requestId: null },
    });
  });
});
