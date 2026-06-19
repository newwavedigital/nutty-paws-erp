import { describe, expect, it } from "vitest";
import {
  ShippingError,
  listShippingLogs,
  listShippingQueue,
  markPurchaseOrderShipped,
  markPurchaseOrderStocked,
  updateShippingDetails,
  type ShippingLogRecord,
  type ShippingPurchaseOrderRecord,
  type ShippingStore,
} from "../src/shipping/service";

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
      {
        id: "line-1",
        productId: "product-1",
        quantity: 10,
        description: "Co-pack item",
        productIsOwnBrand: false,
      },
    ],
    shippingDetails: null,
    ...overrides,
  };
}

function createStore(overrides: Partial<ShippingStore> = {}) {
  const calls: string[] = [];
  let po = makePO();
  let log: ShippingLogRecord | null = null;
  const store: ShippingStore & { calls: string[]; setPO(next: ShippingPurchaseOrderRecord): void } = {
    calls,
    setPO(next) {
      po = next;
    },
    async listShippingQueue() {
      calls.push("listShippingQueue");
      return [po];
    },
    async listShippingLogs() {
      calls.push("listShippingLogs");
      return log ? [log] : [];
    },
    async getPurchaseOrder(id) {
      calls.push(`getPurchaseOrder:${id}`);
      return id === po.id ? po : null;
    },
    async getActiveShipmentDocument(purchaseOrderId, fileId) {
      calls.push(`getActiveShipmentDocument:${purchaseOrderId}:${fileId}`);
      return purchaseOrderId === po.id && fileId === "shipment-doc-1"
        ? {
            id: "shipment-doc-1",
            ownerType: "purchase_order",
            ownerId: po.id,
            fileCategory: "shipment_document",
            status: "active",
            fileName: "shipment.pdf",
          }
        : null;
    },
    async findActiveShipmentDocument(purchaseOrderId) {
      calls.push(`findActiveShipmentDocument:${purchaseOrderId}`);
      return purchaseOrderId === po.id
        ? {
            id: "shipment-doc-1",
            ownerType: "purchase_order",
            ownerId: po.id,
            fileCategory: "shipment_document",
            status: "active",
            fileName: "shipment.pdf",
          }
        : null;
    },
    async upsertShippingDetails(input) {
      calls.push(`upsertShippingDetails:${input.purchaseOrderId}`);
      const details = {
        id: "shipping-details-1",
        purchaseOrderId: po.id,
        bolNumber: input.bolNumber ?? null,
        proNumber: input.proNumber ?? null,
        carrier: input.carrier ?? null,
        freightClass: input.freightClass ?? null,
        notes: input.notes ?? null,
        palletListJson: input.palletListJson ?? null,
        shipmentDocumentFileId: input.shipmentDocumentFileId ?? null,
        updatedAt: "2026-06-19T00:00:00.000Z",
      };
      po = {
        ...po,
        shippingNotes: input.notes ?? po.shippingNotes,
        shipmentDocumentFileId: input.shipmentDocumentFileId ?? po.shipmentDocumentFileId,
        shippingDetails: details,
      };
      return details;
    },
    async markPurchaseOrderShipped(input) {
      calls.push(`markPurchaseOrderShipped:${input.shipmentDocumentFileId}`);
      po = {
        ...po,
        status: "completed",
        shippedAt: input.shippedAt,
        shippedByUserId: input.shippedByUserId ?? null,
        shipmentDocumentFileId: input.shipmentDocumentFileId,
        shippingNotes: input.notes ?? po.shippingNotes,
      };
      return po;
    },
    async markPurchaseOrderStocked(input) {
      calls.push("markPurchaseOrderStocked");
      po = {
        ...po,
        status: "completed",
        stockedAt: input.stockedAt,
        stockedByUserId: input.stockedByUserId ?? null,
      };
      return po;
    },
    async upsertShippingLog(input) {
      calls.push(`upsertShippingLog:${input.purchaseOrderId}`);
      const nextLog: ShippingLogRecord = {
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
      log = nextLog;
      return log;
    },
    async createStatusEvent(input) {
      calls.push(`createStatusEvent:${input.fromStatus}->${input.toStatus}:${input.eventType}`);
    },
    async createAuditEvent(input) {
      calls.push(`audit:${input.action}`);
    },
    ...overrides,
  };
  return store;
}

describe("shipping workflow service", () => {
  it("lists shipping queue and shipping logs", async () => {
    const store = createStore();

    await expect(listShippingQueue(store)).resolves.toHaveLength(1);
    await expect(listShippingLogs(store)).resolves.toEqual([]);

    expect(store.calls).toContain("listShippingQueue");
    expect(store.calls).toContain("listShippingLogs");
  });

  it("blocks mark shipped until an active shipment document exists", async () => {
    const store = createStore({
      async findActiveShipmentDocument() {
        return null;
      },
    });

    await expect(markPurchaseOrderShipped(store, { purchaseOrderId: "po-1" })).rejects.toEqual(
      new ShippingError("SHIPMENT_DOCUMENT_REQUIRED", "An active shipment document is required before marking shipped"),
    );
  });

  it("returns a cancelable warning when carrier or BOL is blank", async () => {
    const store = createStore();

    await expect(
      markPurchaseOrderShipped(store, {
        purchaseOrderId: "po-1",
        shipmentDocumentFileId: "shipment-doc-1",
        carrier: "",
        bolNumber: "",
      }),
    ).rejects.toMatchObject({
      code: "MISSING_CARRIER_BOL_WARNING",
      status: 409,
      details: {
        requiresConfirmation: true,
        missingFields: ["bolNumber", "carrier"],
      },
    });
  });

  it("marks a PO shipped, completes it, records shipped date, and writes one idempotent log", async () => {
    const store = createStore();

    const first = await markPurchaseOrderShipped(store, {
      purchaseOrderId: "po-1",
      shipmentDocumentFileId: "shipment-doc-1",
      carrier: "Acme Freight",
      bolNumber: "BOL-100",
      proNumber: "PRO-100",
      palletListJson: "[{\"pallet\":1}]",
      weight: 1200,
      actorUserId: "user-1",
    });
    const second = await markPurchaseOrderShipped(store, {
      purchaseOrderId: "po-1",
      shipmentDocumentFileId: "shipment-doc-1",
      carrier: "Acme Freight",
      bolNumber: "BOL-100",
      confirmMissingCarrierBol: true,
      actorUserId: "user-1",
    });

    expect(first.status).toBe("completed");
    expect(first.shippedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(second.shippedAt).toBe(first.shippedAt);
    expect(store.calls.filter((call) => call.startsWith("upsertShippingLog:po-1"))).toHaveLength(2);
    expect(store.calls).toContain("audit:purchase_order.shipped");
  });

  it("stores shipping details independently from mark shipped", async () => {
    const store = createStore();

    const details = await updateShippingDetails(store, {
      purchaseOrderId: "po-1",
      carrier: "Acme Freight",
      bolNumber: "BOL-100",
      notes: "Dock 4",
      shipmentDocumentFileId: "shipment-doc-1",
    });

    expect(details.carrier).toBe("Acme Freight");
    expect(details.bolNumber).toBe("BOL-100");
    expect(store.calls).toContain("upsertShippingDetails:po-1");
  });

  it("marks internal own-brand POs stocked to warehouse with stocked timestamp", async () => {
    const store = createStore();
    store.setPO(makePO({
      lines: [
        { id: "line-1", productId: "product-1", quantity: 5, description: "Own brand item", productIsOwnBrand: true },
      ],
    }));

    const result = await markPurchaseOrderStocked(store, {
      purchaseOrderId: "po-1",
      actorUserId: "warehouse-user",
    });

    expect(result.status).toBe("completed");
    expect(result.stockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.stockedByUserId).toBe("warehouse-user");
    expect(store.calls).toContain("audit:purchase_order.stocked");
  });
});
