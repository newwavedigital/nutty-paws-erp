import { describe, expect, it } from "vitest";
import {
  QualityError,
  attachPostShipmentCoa,
  listQualityQueue,
  releaseQualityPurchaseOrder,
  skipQualityPurchaseOrder,
  type QualityPurchaseOrderRecord,
  type QualityStore,
} from "../src/quality/service";

function makePO(overrides: Partial<QualityPurchaseOrderRecord> = {}): QualityPurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "qa_review",
    requestedShipDate: null,
    notes: null,
    qaReleasedAt: null,
    qaReleasedByUserId: null,
    qaReleaseType: null,
    qaNotes: null,
    qaSkippedAt: null,
    qaSkippedByUserId: null,
    qaSkipReason: null,
    postShipmentCoaFileId: null,
    lines: [
      {
        id: "line-1",
        productId: "product-1",
        quantity: 10,
        description: "Product",
        productIsOwnBrand: true,
      },
    ],
    ...overrides,
  };
}

function createStore(overrides: Partial<QualityStore> = {}) {
  const calls: string[] = [];
  let po = makePO();
  const store: QualityStore & { calls: string[]; setPO(next: QualityPurchaseOrderRecord): void } = {
    calls,
    setPO(next) {
      po = next;
    },
    async listQualityQueue() {
      calls.push("listQualityQueue");
      return po.status === "qa_review" ? [po] : [];
    },
    async getPurchaseOrder(id) {
      calls.push(`getPurchaseOrder:${id}`);
      return id === po.id ? po : null;
    },
    async getActiveCoaFile(purchaseOrderId, fileId) {
      calls.push(`getActiveCoaFile:${purchaseOrderId}:${fileId}`);
      return purchaseOrderId === po.id && fileId === "coa-1"
        ? { id: "coa-1", ownerType: "purchase_order", ownerId: po.id, fileCategory: "coa", status: "active", fileName: "coa.pdf" }
        : null;
    },
    async releaseInventoryLots(purchaseOrderId) {
      calls.push(`releaseInventoryLots:${purchaseOrderId}`);
      return 2;
    },
    async updatePurchaseOrderQualityRelease(input) {
      calls.push(`updatePurchaseOrderQualityRelease:${input.routeStatus}:${input.releaseType}`);
      po = {
        ...po,
        status: input.routeStatus,
        qaReleasedAt: input.releasedAt,
        qaReleasedByUserId: input.releasedByUserId ?? null,
        qaReleaseType: input.releaseType,
        qaNotes: input.notes ?? null,
        qaSkippedAt: null,
        qaSkippedByUserId: null,
        qaSkipReason: null,
      };
      return po;
    },
    async updatePurchaseOrderQualitySkip(input) {
      calls.push(`updatePurchaseOrderQualitySkip:${input.routeStatus}:${input.skipReason}`);
      po = {
        ...po,
        status: input.routeStatus,
        qaReleasedAt: null,
        qaReleasedByUserId: null,
        qaReleaseType: null,
        qaNotes: input.notes ?? null,
        qaSkippedAt: input.skippedAt,
        qaSkippedByUserId: input.skippedByUserId ?? null,
        qaSkipReason: input.skipReason,
      };
      return po;
    },
    async attachPostShipmentCoaFile(input) {
      calls.push(`attachPostShipmentCoaFile:${input.fileId}`);
      po = { ...po, postShipmentCoaFileId: input.fileId };
      return po;
    },
    async updatePurchaseOrderQualityNotes(input) {
      calls.push(`updatePurchaseOrderQualityNotes:${input.notes ?? ""}`);
      po = { ...po, qaNotes: input.notes };
      return po;
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

describe("quality workflow service", () => {
  it("lists QA review purchase orders", async () => {
    const store = createStore();
    await expect(listQualityQueue(store)).resolves.toHaveLength(1);
    expect(store.calls).toContain("listQualityQueue");
  });

  it("rejects release without an active COA", async () => {
    const store = createStore({
      async getActiveCoaFile() {
        return null;
      },
    });

    await expect(
      releaseQualityPurchaseOrder(store, { purchaseOrderId: "po-1", coaFileId: "missing" }),
    ).rejects.toEqual(new QualityError("COA_REQUIRED", "A current active COA file is required"));
  });

  it("routes internal own-brand releases to completed and releases lots", async () => {
    const store = createStore({
      async releaseInventoryLots(purchaseOrderId) {
        store.calls.push(`releaseInventoryLots:${purchaseOrderId}`);
        return 1;
      },
    });

    const result = await releaseQualityPurchaseOrder(store, {
      purchaseOrderId: "po-1",
      coaFileId: "coa-1",
      notes: "looks good",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("completed");
    expect(result.qaReleaseType).toBe("internal_own_brand");
    expect(store.calls).toContain("updatePurchaseOrderQualityRelease:completed:internal_own_brand");
    expect(store.calls).toContain("releaseInventoryLots:po-1");
    expect(store.calls).toContain("audit:purchase_order.qa_released");
  });

  it("routes co-pack releases to shipping", async () => {
    const store = createStore({
      async getPurchaseOrder(id) {
        const po = makePO({
          id,
          status: "qa_review",
          lines: [
            {
              id: "line-1",
              productId: "product-2",
              quantity: 10,
              description: "Co-pack product",
              productIsOwnBrand: false,
            },
          ],
        });
        return po;
      },
    });

    const result = await releaseQualityPurchaseOrder(store, {
      purchaseOrderId: "po-1",
      coaFileId: "coa-1",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("shipping");
    expect(result.qaReleaseType).toBe("external_co_pack");
  });

  it("requires a reason for QA skip and writes audit events", async () => {
    const store = createStore();

    await expect(
      skipQualityPurchaseOrder(store, { purchaseOrderId: "po-1", reason: " " }),
    ).rejects.toEqual(new QualityError("QA_SKIP_REASON_REQUIRED", "A QA skip reason is required"));

    const result = await skipQualityPurchaseOrder(store, {
      purchaseOrderId: "po-1",
      reason: "CoA pending review",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("completed");
    expect(result.qaSkipReason).toBe("CoA pending review");
    expect(store.calls).toContain("updatePurchaseOrderQualitySkip:completed:CoA pending review");
    expect(store.calls).toContain("releaseInventoryLots:po-1");
    expect(store.calls).toContain("audit:purchase_order.qa_skipped");
  });

  it("allows post-shipment COA attachment only after QA release", async () => {
    const store = createStore({
      async getPurchaseOrder(id) {
        return makePO({ id, status: "shipping", postShipmentCoaFileId: null });
      },
    });

    const result = await attachPostShipmentCoa(store, {
      purchaseOrderId: "po-1",
      coaFileId: "coa-1",
      actorUserId: "user-1",
    });

    expect(result.postShipmentCoaFileId).toBe("coa-1");
    expect(store.calls).toContain("attachPostShipmentCoaFile:coa-1");
    expect(store.calls).toContain("audit:purchase_order.post_shipment_coa_attached");
  });

  it("blocks post-shipment COA attachment before release", async () => {
    const store = createStore({
      async getPurchaseOrder(id) {
        return makePO({ id, status: "qa_review" });
      },
    });

    await expect(
      attachPostShipmentCoa(store, { purchaseOrderId: "po-1", coaFileId: "coa-1" }),
    ).rejects.toEqual(new QualityError("POST_SHIPMENT_COA_NOT_ALLOWED", "Post-shipment COA can only be attached after QA release"));
  });
});
