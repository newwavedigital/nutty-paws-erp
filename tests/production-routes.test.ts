import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerProductionRoutes } from "../src/production/routes";
import type { ProductionRunRecord, ProductionStore } from "../src/production/service";

function createProductionStore() {
  let run: ProductionRunRecord | null = null;
  let poStatus = "approved_for_production";
  const logs: unknown[] = [];
  const calls: string[] = [];
  const store: ProductionStore & { calls: string[] } = {
    calls,
    async getPurchaseOrder() {
      return {
        id: "po-1",
        poNumber: "PO-1001",
        customerId: "customer-1",
        status: poStatus,
        lines: [{ id: "line-1", productId: "product-1", quantity: 10, description: "Product" }],
      };
    },
    async getProductionRunByPurchaseOrderId() { return run; },
    async getProductionRun(id) { return run?.id === id ? run : null; },
    async upsertProductionRun(input) {
      run = {
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
      return run;
    },
    async updatePurchaseOrderStatus(_id, status) { poStatus = status; },
    async listProductBomItems(productId) {
      return [{ productId, masterItemId: "master-1", quantityPerUnit: 2, itemType: "raw_material", inventoryItemId: "inv-1", productIsOwnBrand: true }];
    },
    async findFinishedGoodInventoryItem() { return { id: "fg-1" }; },
    async replaceRunLines(_runId, lines) { if (run) run.lines = lines; },
    async replaceRunMaterials(_runId, materials) { if (run) run.materials = materials; },
    async listInventoryEffects() { return []; },
    async clearInventoryEffects() {},
    async adjustInventory(input) { calls.push(`adjustInventory:${input.inventoryItemId}:${input.quantityDelta}`); },
    async createInventoryEffect() {},
    async upsertInventoryLot() {},
    async finalizeRun(input) {
      if (run) run = { ...run, status: input.status, finalizedAt: "2026-06-19T00:00:00.000Z", reopenedAt: null, notes: input.notes ?? run.notes };
      return run as ProductionRunRecord;
    },
    async reopenRun(input) {
      if (run) run = { ...run, status: "reopened", reopenedAt: "2026-06-19T01:00:00.000Z", correctionCount: run.correctionCount + 1, notes: input.reason };
      return run as ProductionRunRecord;
    },
    async listProductionRuns() { return run ? [run] : []; },
    async upsertProductionLog(input) { logs.splice(0, logs.length, input); },
    async listProductionLogs() { return logs as never; },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
  return store;
}

function createRouteApp(store: ProductionStore) {
  return createApp((route) => registerProductionRoutes(route, () => store));
}

describe("production routes", () => {
  it("schedules, finalizes, reopens, and lists production logs", async () => {
    const store = createProductionStore();
    const app = createRouteApp(store);

    const schedule = await app.request("/api/production/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderId: "po-1",
        productionDate: "2026-06-20",
        productionEndDate: "2026-06-20",
        productionRoom: "Main",
      }),
    });
    const scheduledBody = await schedule.json() as { data: ProductionRunRecord };
    const finalize = await app.request(`/api/production/runs/${scheduledBody.data.id}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ purchaseOrderLineId: "line-1", productId: "product-1", quantityProduced: 10, casesProduced: 4, lotNumber: "LOT-1" }],
        materialActuals: [{ masterItemId: "master-1", actualUsedQuantity: 21, lotNumber: "RAW-1" }],
      }),
    });
    const logs = await app.request("/api/production/logs");
    const reopen = await app.request(`/api/production/runs/${scheduledBody.data.id}/reopen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Correct material usage" }),
    });

    expect(schedule.status).toBe(200);
    expect(finalize.status).toBe(200);
    expect(logs.status).toBe(200);
    await expect(logs.json()).resolves.toMatchObject({ data: [expect.objectContaining({ purchaseOrderId: "po-1" })] });
    expect(reopen.status).toBe(200);
  });

  it("rejects invalid schedule dates through the shared error envelope", async () => {
    const app = createRouteApp(createProductionStore());

    const response = await app.request("/api/production/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderId: "po-1",
        productionDate: "2026-06-21",
        productionEndDate: "2026-06-20",
        productionRoom: "Main",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_PRODUCTION_DATES" },
    });
  });
});
