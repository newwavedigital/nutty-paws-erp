import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerShippingRoutes } from "../src/shipping/routes";
import type { ShippingPurchaseOrderRecord, ShippingStore } from "../src/shipping/service";

function makePO(overrides: Partial<ShippingPurchaseOrderRecord> = {}): ShippingPurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "shipping",
    requestedShipDate: null,
    notes: null,
    shippedAt: null,
    shippedByUserId: null,
    stockedAt: null,
    stockedByUserId: null,
    shippingNotes: null,
    shipmentDocumentFileId: null,
    lines: [
      { id: "line-1", productId: "product-1", quantity: 10, description: "Own brand item", productIsOwnBrand: true },
    ],
    shippingDetails: null,
    ...overrides,
  };
}

function createShippingStore(): ShippingStore {
  let po = makePO();
  let details = po.shippingDetails;
  let logCount = 0;
  return {
    async listShippingQueue() {
      return [po];
    },
    async listShippingLogs() {
      return logCount
        ? [
            {
              id: "shipping-log-1",
              purchaseOrderId: "po-1",
              shippingLogNumber: "SL-000001",
              shippedAt: po.shippedAt,
              stockedAt: po.stockedAt,
              carrier: details?.carrier ?? "Acme Freight",
              bolNumber: details?.bolNumber ?? "BOL-100",
              proNumber: details?.proNumber ?? null,
              palletListJson: details?.palletListJson ?? null,
              weight: null,
              itemsSnapshotJson: "[]",
              createdAt: "2026-06-19T00:00:00.000Z",
            },
          ]
        : [];
    },
    async getPurchaseOrder(id) {
      return id === po.id ? { ...po, shippingDetails: details } : null;
    },
    async getActiveShipmentDocument(purchaseOrderId, fileId) {
      return purchaseOrderId === po.id && fileId === "shipment-doc-1"
        ? { id: "shipment-doc-1", ownerType: "purchase_order", ownerId: po.id, fileCategory: "shipment_document", status: "active", fileName: "shipment.pdf" }
        : null;
    },
    async findActiveShipmentDocument(purchaseOrderId) {
      return purchaseOrderId === po.id
        ? { id: "shipment-doc-1", ownerType: "purchase_order", ownerId: po.id, fileCategory: "shipment_document", status: "active", fileName: "shipment.pdf" }
        : null;
    },
    async upsertShippingDetails(input) {
      details = {
        id: "shipping-details-1",
        purchaseOrderId: input.purchaseOrderId,
        bolNumber: input.bolNumber ?? null,
        proNumber: input.proNumber ?? null,
        carrier: input.carrier ?? null,
        freightClass: input.freightClass ?? null,
        notes: input.notes ?? null,
        palletListJson: input.palletListJson ?? null,
        shipmentDocumentFileId: input.shipmentDocumentFileId ?? null,
        updatedAt: "2026-06-19T00:00:00.000Z",
      };
      return details;
    },
    async markPurchaseOrderShipped(input) {
      po = {
        ...po,
        status: "completed",
        shippedAt: input.shippedAt,
        shippedByUserId: input.shippedByUserId ?? null,
        shipmentDocumentFileId: input.shipmentDocumentFileId,
        shippingNotes: input.notes ?? null,
      };
      return { ...po, shippingDetails: details };
    },
    async markPurchaseOrderStocked(input) {
      po = {
        ...po,
        status: "completed",
        stockedAt: input.stockedAt,
        stockedByUserId: input.stockedByUserId ?? null,
        lines: [{ id: "line-1", productId: "product-1", quantity: 10, description: "Own brand", productIsOwnBrand: true }],
      };
      return { ...po, shippingDetails: details };
    },
    async upsertShippingLog(input) {
      logCount = 1;
      return {
        id: "shipping-log-1",
        purchaseOrderId: input.purchaseOrderId,
        shippingLogNumber: "SL-000001",
        shippedAt: input.shippedAt ?? null,
        stockedAt: input.stockedAt ?? null,
        carrier: input.carrier ?? null,
        bolNumber: input.bolNumber ?? null,
        proNumber: input.proNumber ?? null,
        palletListJson: input.palletListJson ?? null,
        weight: input.weight ?? null,
        itemsSnapshotJson: input.itemsSnapshotJson,
        createdAt: "2026-06-19T00:00:00.000Z",
      };
    },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createRouteApp() {
  const shippingStore = createShippingStore();
  const app = createApp((route) => {
    registerShippingRoutes(route, () => shippingStore);
  });
  return app;
}

describe("shipping routes", () => {
  it("supports queue, details update, mark shipped, mark stocked, and logs", async () => {
    const app = createRouteApp();

    const queue = await app.request("/api/shipping/queue");
    const details = await app.request("/api/shipping/purchase-orders/po-1/details", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        carrier: "Acme Freight",
        bolNumber: "BOL-100",
        proNumber: "PRO-100",
        shipmentDocumentFileId: "shipment-doc-1",
      }),
    });
    const warning = await app.request("/api/shipping/purchase-orders/po-1/mark-shipped", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipmentDocumentFileId: "shipment-doc-1", carrier: "", bolNumber: "" }),
    });
    const shipped = await app.request("/api/shipping/purchase-orders/po-1/mark-shipped", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipmentDocumentFileId: "shipment-doc-1", confirmMissingCarrierBol: true }),
    });
    const stocked = await app.request("/api/shipping/purchase-orders/po-1/mark-stocked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const logs = await app.request("/api/shipping/logs");

    expect(queue.status).toBe(200);
    await expect(queue.json()).resolves.toMatchObject({ ok: true, data: [{ id: "po-1" }] });
    expect(details.status).toBe(200);
    await expect(details.json()).resolves.toMatchObject({ ok: true, data: { carrier: "Acme Freight", bolNumber: "BOL-100" } });
    expect(warning.status).toBe(409);
    await expect(warning.json()).resolves.toMatchObject({ ok: false, error: { code: "MISSING_CARRIER_BOL_WARNING" } });
    expect(shipped.status).toBe(200);
    await expect(shipped.json()).resolves.toMatchObject({ ok: true, data: { status: "completed", shippedAt: expect.any(String) } });
    expect(stocked.status).toBe(200);
    await expect(stocked.json()).resolves.toMatchObject({ ok: true, data: { status: "completed", stockedAt: expect.any(String) } });
    expect(logs.status).toBe(200);
    await expect(logs.json()).resolves.toMatchObject({ ok: true, data: [{ purchaseOrderId: "po-1" }] });
  });
});
