import { describe, expect, it } from "vitest";
import {
  ProductionError,
  finalizeProductionRun,
  listProductionLogs,
  reopenProductionRun,
  scheduleProductionRun,
  type ProductionRunRecord,
  type ProductionStore,
} from "../src/production/service";

function createStore(overrides: Partial<ProductionStore> = {}) {
  const calls: string[] = [];
  let currentRun: ProductionRunRecord | null = null;
  let poStatus = "approved_for_production";
  const logs: unknown[] = [];
  const effects = new Map<string, number>();

  const store: ProductionStore & { calls: string[]; setRun(run: ProductionRunRecord | null): void; setPoStatus(status: string): void } = {
    calls,
    setRun(run) { currentRun = run; },
    setPoStatus(status) { poStatus = status; },
    async getPurchaseOrder(id) {
      calls.push(`getPurchaseOrder:${id}`);
      if (id !== "po-1") return null;
      return {
        id: "po-1",
        poNumber: "PO-1001",
        customerId: "customer-1",
        status: poStatus,
        lines: [
          { id: "line-1", productId: "product-own", quantity: 10, description: "Own butter" },
          { id: "line-2", productId: "product-copack", quantity: 5, description: "Co-pack butter" },
        ],
      };
    },
    async getProductionRunByPurchaseOrderId(purchaseOrderId) {
      calls.push(`getProductionRunByPurchaseOrderId:${purchaseOrderId}`);
      return currentRun;
    },
    async getProductionRun(id) {
      calls.push(`getProductionRun:${id}`);
      return currentRun?.id === id ? currentRun : null;
    },
    async upsertProductionRun(input) {
      calls.push(`upsertProductionRun:${input.purchaseOrderId}:${input.status}`);
      currentRun = {
        id: input.id,
        purchaseOrderId: input.purchaseOrderId,
        productionDate: input.productionDate,
        productionEndDate: input.productionEndDate,
        productionRoom: input.productionRoom,
        status: input.status,
        finalizedAt: null,
        reopenedAt: null,
        correctionCount: input.correctionCount,
        notes: input.notes ?? null,
        lines: [],
        materials: [],
      };
      return currentRun;
    },
    async updatePurchaseOrderStatus(id, status) {
      calls.push(`updatePurchaseOrderStatus:${id}:${status}`);
      poStatus = status;
    },
    async listProductBomItems(productId) {
      calls.push(`listProductBomItems:${productId}`);
      if (productId === "product-own") {
        return [
          { productId, masterItemId: "master-ingredient", quantityPerUnit: 2, itemType: "raw_material", inventoryItemId: "inv-ingredient", productIsOwnBrand: true },
          { productId, masterItemId: "master-packaging", quantityPerUnit: 1, itemType: "packaging", inventoryItemId: "inv-packaging", productIsOwnBrand: true },
        ];
      }
      return [
        { productId, masterItemId: "master-ingredient", quantityPerUnit: 3, itemType: "raw_material", inventoryItemId: "inv-ingredient", productIsOwnBrand: false },
      ];
    },
    async findFinishedGoodInventoryItem(productId) {
      calls.push(`findFinishedGoodInventoryItem:${productId}`);
      return productId === "product-own" ? { id: "inv-fg-own" } : { id: "inv-fg-copack" };
    },
    async replaceRunLines(runId, lines) {
      calls.push(`replaceRunLines:${runId}:${lines.length}`);
      if (currentRun) currentRun.lines = lines;
    },
    async replaceRunMaterials(runId, materials) {
      calls.push(`replaceRunMaterials:${runId}:${materials.length}`);
      if (currentRun) currentRun.materials = materials;
    },
    async listInventoryEffects(runId) {
      calls.push(`listInventoryEffects:${runId}`);
      return Array.from(effects, ([inventoryItemId, quantityDelta]) => ({ inventoryItemId, quantityDelta }));
    },
    async clearInventoryEffects(runId) {
      calls.push(`clearInventoryEffects:${runId}`);
      effects.clear();
    },
    async adjustInventory(input) {
      calls.push(`adjustInventory:${input.inventoryItemId}:${input.quantityDelta}`);
      effects.set(input.inventoryItemId, (effects.get(input.inventoryItemId) ?? 0) + input.quantityDelta);
    },
    async createInventoryEffect(input) {
      calls.push(`createInventoryEffect:${input.inventoryItemId}:${input.quantityDelta}`);
      effects.set(input.inventoryItemId, input.quantityDelta);
    },
    async upsertInventoryLot(input) {
      calls.push(`upsertInventoryLot:${input.productId}:${input.lotNumber}:${input.quantityProduced}`);
    },
    async finalizeRun(input) {
      calls.push(`finalizeRun:${input.id}:${input.status}`);
      if (currentRun) {
        currentRun = { ...currentRun, status: input.status, finalizedAt: "2026-06-19T00:00:00.000Z", reopenedAt: null, notes: input.notes ?? currentRun.notes };
      }
      return currentRun as ProductionRunRecord;
    },
    async reopenRun(input) {
      calls.push(`reopenRun:${input.id}`);
      if (currentRun) currentRun = { ...currentRun, status: "reopened", reopenedAt: "2026-06-19T01:00:00.000Z", correctionCount: currentRun.correctionCount + 1 };
      return currentRun as ProductionRunRecord;
    },
    async listProductionRuns() {
      calls.push("listProductionRuns");
      return currentRun ? [currentRun] : [];
    },
    async upsertProductionLog(input) {
      calls.push(`upsertProductionLog:${input.purchaseOrderId}:${input.logId}`);
      logs.splice(0, logs.length, input);
    },
    async listProductionLogs() {
      calls.push("listProductionLogs");
      return logs as never;
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

describe("production workflow service", () => {
  it("schedules an approved purchase order and moves it into production", async () => {
    const store = createStore();

    const run = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-21",
      productionRoom: "Squeeze Pack",
      actorUserId: "user-1",
    });

    expect(run).toMatchObject({
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-21",
      productionRoom: "Squeeze Pack",
      status: "scheduled",
    });
    expect(store.calls).toContain("updatePurchaseOrderStatus:po-1:in_production");
    expect(store.calls).toContain("audit:production_run.scheduled");
  });

  it("rejects production end dates before start dates", async () => {
    await expect(
      scheduleProductionRun(createStore(), {
        purchaseOrderId: "po-1",
        productionDate: "2026-06-21",
        productionEndDate: "2026-06-20",
        productionRoom: "Squeeze Pack",
      }),
    ).rejects.toEqual(new ProductionError("INVALID_PRODUCTION_DATES", "Production end date must be on or after the start date"));
  });

  it("finalizes production with BOM calculations, lot records, QA routing, and one production log", async () => {
    const store = createStore();
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    const finalized = await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      actorUserId: "user-1",
      lines: [
        { purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" },
        { purchaseOrderLineId: "line-2", productId: "product-copack", quantityProduced: 5, casesProduced: 2, lotNumber: "LOT-COPACK" },
      ],
      materialActuals: [
        { masterItemId: "master-ingredient", actualUsedQuantity: 40, lotNumber: "RAW-1" },
        { masterItemId: "master-packaging", productId: "product-own", purchaseOrderLineId: "line-1", actualUsedQuantity: 9.45, lotNumber: "PKG-1" },
      ],
      notes: "first pass",
    });

    expect(finalized.status).toBe("finalized");
    expect(store.calls.some((call) => call.startsWith("replaceRunLines:production_run_"))).toBe(true);
    expect(store.calls.some((call) => call.startsWith("replaceRunMaterials:production_run_"))).toBe(true);
    expect(store.calls).toContain("adjustInventory:inv-ingredient:-40");
    expect(store.calls).toContain("adjustInventory:inv-packaging:-9.45");
    expect(store.calls).toContain("adjustInventory:inv-fg-own:9");
    expect(store.calls).not.toContain("adjustInventory:inv-fg-copack:5");
    expect(store.calls).toContain("upsertInventoryLot:product-own:LOT-OWN:9");
    expect(store.calls).toContain("updatePurchaseOrderStatus:po-1:qa_review");
    expect(store.calls.filter((call) => call.startsWith("upsertProductionLog:po-1:"))).toHaveLength(1);
  });

  it("derives the product from the purchase-order line when the client omits it", async () => {
    const store = createStore();
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    const finalized = await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      lines: [{ purchaseOrderLineId: "line-1", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
    });

    expect(finalized.lines[0]).toMatchObject({ productId: "product-own" });
    expect(store.calls).toContain("listProductBomItems:product-own");
  });

  it("rejects finalization when a submitted product does not match the PO line", async () => {
    const store = createStore();
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await expect(
      finalizeProductionRun(store, {
        productionRunId: scheduled.id,
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-copack", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
        materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
      }),
    ).rejects.toEqual(
      new ProductionError("PURCHASE_ORDER_LINE_PRODUCT_MISMATCH", "Production line product does not match the purchase order line"),
    );
    expect(store.calls.some((call) => call.startsWith("replaceRunLines:"))).toBe(false);
  });

  it("blocks own-brand finalization before mutating when finished-good inventory is not mapped", async () => {
    const store = createStore({
      async findFinishedGoodInventoryItem(productId) {
        store.calls.push(`findFinishedGoodInventoryItem:${productId}`);
        return null;
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await expect(
      finalizeProductionRun(store, {
        productionRunId: scheduled.id,
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
        materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
      }),
    ).rejects.toEqual(
      new ProductionError(
        "FINISHED_GOOD_INVENTORY_NOT_FOUND",
        "Finished-good inventory item is required before finalizing own-brand production",
      ),
    );
    expect(store.calls).toContain("findFinishedGoodInventoryItem:product-own");
    expect(store.calls.some((call) => call.startsWith("replaceRunLines:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("adjustInventory:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("finalizeRun:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("upsertProductionLog:"))).toBe(false);
  });

  it("rolls back production inventory effects when a later finalization write fails", async () => {
    const store = createStore({
      async upsertInventoryLot(input) {
        store.calls.push(`upsertInventoryLot:${input.productId}:${input.lotNumber}:${input.quantityProduced}`);
        throw new Error("finished-good lot write failed");
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await expect(
      finalizeProductionRun(store, {
        productionRunId: scheduled.id,
        actorUserId: "user-1",
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
        materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
      }),
    ).rejects.toThrow("finished-good lot write failed");

    expect(store.calls).toContain("adjustInventory:inv-ingredient:-18.9");
    expect(store.calls).toContain("adjustInventory:inv-packaging:-9.45");
    expect(store.calls).toContain("adjustInventory:inv-fg-own:9");
    expect(store.calls).toContain("adjustInventory:inv-fg-own:-9");
    expect(store.calls).toContain("adjustInventory:inv-packaging:9.45");
    expect(store.calls).toContain("adjustInventory:inv-ingredient:18.9");
    expect(store.calls.some((call) => call.startsWith("finalizeRun:"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("updatePurchaseOrderStatus:po-1:qa_review"))).toBe(false);
    expect(store.calls.some((call) => call.startsWith("upsertProductionLog:"))).toBe(false);
  });

  it("uses atomic finalization transaction hook for run, PO, log, status event, and audit writes", async () => {
    const store = createStore({
      async finalizeRunTransaction(input) {
        store.calls.push(`transaction:finalize:${input.run.id}:${input.purchaseOrder.status}`);
        const finalized: ProductionRunRecord = {
          id: input.run.id,
          purchaseOrderId: input.productionLog.purchaseOrderId,
          productionDate: input.productionLog.productionDate,
          productionEndDate: input.productionLog.productionEndDate,
          productionRoom: input.productionLog.productionRoom,
          status: "finalized",
          finalizedAt: "2026-06-19T00:00:00.000Z",
          reopenedAt: null,
          correctionCount: 0,
          notes: input.run.notes ?? null,
          lines: [],
          materials: [],
        };
        store.setRun(finalized);
        store.setPoStatus(input.purchaseOrder.status);
        return finalized;
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    const finalized = await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      actorUserId: "user-1",
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
    });

    expect(finalized.status).toBe("finalized");
    expect(store.calls.some((call) => call.startsWith("transaction:finalize:production_run_") && call.endsWith(":qa_review"))).toBe(true);
    expect(store.calls.some((call) => call.startsWith("finalizeRun:"))).toBe(false);
    expect(store.calls.filter((call) => call === "updatePurchaseOrderStatus:po-1:qa_review")).toHaveLength(0);
    expect(store.calls.some((call) => call.startsWith("upsertProductionLog:"))).toBe(false);
    expect(store.calls.some((call) => call.includes("purchase_order.production_finalized"))).toBe(false);
    expect(store.calls).not.toContain("audit:production_run.finalized");
  });

  it("uses the full sanitized PO number for production log IDs to avoid numeric prefix collisions", async () => {
    let capturedLogId = "";
    const store = createStore({
      async getPurchaseOrder(id) {
        const po = await createStore().getPurchaseOrder(id);
        return po ? { ...po, poNumber: "STAGE2-FILE-MR5HAP8Z" } : null;
      },
      async finalizeRunTransaction(input) {
        capturedLogId = input.productionLog.logId;
        const finalized: ProductionRunRecord = {
          id: input.run.id,
          purchaseOrderId: input.productionLog.purchaseOrderId,
          productionDate: input.productionLog.productionDate,
          productionEndDate: input.productionLog.productionEndDate,
          productionRoom: input.productionLog.productionRoom,
          status: "finalized",
          finalizedAt: "2026-06-19T00:00:00.000Z",
          reopenedAt: null,
          correctionCount: 0,
          notes: input.run.notes ?? null,
          lines: [],
          materials: [],
        };
        store.setRun(finalized);
        store.setPoStatus(input.purchaseOrder.status);
        return finalized;
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      actorUserId: "user-1",
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
    });

    expect(capturedLogId).toBe("PRD-STAGE2-FILE-MR5HAP8Z");
  });

  it("rolls back inventory effects when atomic finalization transaction fails", async () => {
    const store = createStore({
      async finalizeRunTransaction(input) {
        store.calls.push(`transaction:finalize:fail:${input.run.id}`);
        throw new Error("production finalization batch failed");
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await expect(
      finalizeProductionRun(store, {
        productionRunId: scheduled.id,
        actorUserId: "user-1",
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
        materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
      }),
    ).rejects.toThrow("production finalization batch failed");

    expect(store.calls).toContain("adjustInventory:inv-ingredient:-18.9");
    expect(store.calls).toContain("adjustInventory:inv-packaging:-9.45");
    expect(store.calls).toContain("adjustInventory:inv-fg-own:9");
    expect(store.calls).toContain("adjustInventory:inv-fg-own:-9");
    expect(store.calls).toContain("adjustInventory:inv-packaging:9.45");
    expect(store.calls).toContain("adjustInventory:inv-ingredient:18.9");
    expect(store.calls.some((call) => call.startsWith("transaction:finalize:fail:production_run_"))).toBe(true);
    expect(store.calls.some((call) => call.startsWith("finalizeRun:"))).toBe(false);
    expect(store.calls.filter((call) => call === "updatePurchaseOrderStatus:po-1:qa_review")).toHaveLength(0);
    expect(store.calls.some((call) => call.startsWith("upsertProductionLog:"))).toBe(false);
  });

  it("deduplicates duplicate BOM rows before calculating production material usage", async () => {
    const store = createStore({
      async listProductBomItems(productId) {
        store.calls.push(`listProductBomItems:${productId}`);
        return [
          { productId, masterItemId: "master-ingredient", quantityPerUnit: 2, itemType: "raw_material", inventoryItemId: "inv-ingredient-a", productIsOwnBrand: true },
          { productId, masterItemId: "master-ingredient", quantityPerUnit: 2, itemType: "raw_material", inventoryItemId: "inv-ingredient-b", productIsOwnBrand: true },
        ];
      },
    });
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });

    await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [],
    });

    expect(store.calls).toContain("adjustInventory:inv-ingredient-a:-18.9");
    expect(store.calls).not.toContain("adjustInventory:inv-ingredient-b:-18.9");
    expect(store.calls.some((call) => call === "adjustInventory:inv-ingredient-a:-37.8")).toBe(false);
  });

  it("blocks duplicate finalization until the run is reopened for correction", async () => {
    const store = createStore();
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });
    await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
    });

    await expect(
      finalizeProductionRun(store, {
        productionRunId: scheduled.id,
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
        materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
      }),
    ).rejects.toEqual(new ProductionError("PRODUCTION_ALREADY_FINALIZED", "Production run is already finalized"));
  });

  it("reopens and re-finalizes a finalized run without duplicate production logs", async () => {
    const store = createStore();
    const scheduled = await scheduleProductionRun(store, {
      purchaseOrderId: "po-1",
      productionDate: "2026-06-20",
      productionEndDate: "2026-06-20",
      productionRoom: "Main",
    });
    await finalizeProductionRun(store, {
      productionRunId: scheduled.id,
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 9, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 18.9, lotNumber: "RAW-1" }],
    });

    const reopened = await reopenProductionRun(store, {
      productionRunId: scheduled.id,
      reason: "Correct lot quantity",
      actorUserId: "user-1",
    });
    const corrected = await finalizeProductionRun(store, {
      productionRunId: reopened.id,
      actorUserId: "user-1",
      lines: [{ purchaseOrderLineId: "line-1", productId: "product-own", quantityProduced: 8, casesProduced: 3, lotNumber: "LOT-OWN" }],
      materialActuals: [{ masterItemId: "master-ingredient", actualUsedQuantity: 16.8, lotNumber: "RAW-1" }],
    });
    const logs = await listProductionLogs(store);

    expect(corrected.status).toBe("finalized");
    expect(logs).toHaveLength(1);
    expect(store.calls.some((call) => call.startsWith("reopenRun:production_run_"))).toBe(true);
    expect(store.calls.some((call) => call.startsWith("clearInventoryEffects:production_run_"))).toBe(true);
    expect(store.calls.filter((call) => call.startsWith("upsertProductionLog:po-1:"))).toHaveLength(2);
  });
});
