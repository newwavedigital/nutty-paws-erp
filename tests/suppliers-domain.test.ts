import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { DataRecord } from "../src/records/service";
import { registerSupplierRoutes } from "../src/suppliers/routes";
import type { SupplierProductLineRecord, SupplierStore } from "../src/suppliers/service";

function supplierRecord(overrides: Partial<DataRecord> = {}): DataRecord {
  return {
    id: "supplier-1",
    module: "supplier",
    kind: "supplier",
    title: "Preferred Peanut Co.",
    status: "active",
    payload: { name: "Preferred Peanut Co.", productLines: [] },
    fileIds: [],
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function supplierLine(overrides: Partial<SupplierProductLineRecord> = {}): SupplierProductLineRecord {
  return {
    id: "supplier-line-1",
    supplierId: "supplier-1",
    inventoryItemId: "inventory-peanuts",
    productName: "Roasted Peanuts",
    productType: "Ingredient",
    pricePerUnitCents: 186,
    unitOfMeasure: "lb",
    moq: "2 pallets",
    notes: "Primary peanut supplier.",
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function createSupplierStore(seedRecords: DataRecord[] = [supplierRecord()], seedLines: SupplierProductLineRecord[] = [supplierLine()]) {
  const records = new Map(seedRecords.map((record) => [record.id, record]));
  const validInventoryIds = new Set(["inventory-peanuts", "inventory-labels"]);
  const lines = new Map<string, SupplierProductLineRecord[]>();
  for (const line of seedLines) {
    lines.set(line.supplierId, [...(lines.get(line.supplierId) ?? []), line]);
  }

  const store: SupplierStore & { lines: Map<string, SupplierProductLineRecord[]> } = {
    lines,
    async listRecords(input = {}) {
      return [...records.values()].filter((record) => {
        if (input.kind && record.kind !== input.kind) return false;
        if (input.status && record.status !== input.status) return false;
        return true;
      });
    },
    async getRecord(recordId) {
      return records.get(recordId) ?? null;
    },
    async createRecord(input) {
      const record = supplierRecord({
        id: input.id,
        module: input.module,
        kind: input.kind,
        title: input.title,
        payload: input.payload ?? {},
        fileIds: input.fileIds ?? [],
        createdByUserId: input.actorUserId ?? null,
        updatedByUserId: input.actorUserId ?? null,
      });
      records.set(record.id, record);
      return record;
    },
    async updateRecord(input) {
      const current = records.get(input.recordId);
      if (!current) return null;
      const updated = {
        ...current,
        title: input.title ?? current.title,
        payload: input.payload ?? current.payload,
        fileIds: input.fileIds ?? current.fileIds,
        updatedByUserId: input.actorUserId ?? null,
      };
      records.set(updated.id, updated);
      return updated;
    },
    async archiveRecord(input) {
      const current = records.get(input.recordId);
      if (!current) return null;
      const archived = { ...current, status: "archived" as const, updatedByUserId: input.actorUserId ?? null };
      records.set(archived.id, archived);
      return archived;
    },
    async createAuditEvent() {},
    async listSupplierProductLines(supplierId) {
      return lines.get(supplierId) ?? [];
    },
    async replaceSupplierProductLines(supplierId, nextLines) {
      lines.set(supplierId, nextLines.map((line, index) => supplierLine({
        id: line.id ?? `supplier-line-${index + 1}`,
        supplierId,
        inventoryItemId: line.inventoryItemId,
        productName: line.productName,
        productType: line.productType,
        pricePerUnitCents: line.pricePerUnitCents,
        unitOfMeasure: line.unitOfMeasure,
        moq: line.moq ?? null,
        notes: line.notes ?? null,
      })));
      return lines.get(supplierId) ?? [];
    },
    async isSupplierInventoryItem(inventoryItemId) {
      return validInventoryIds.has(inventoryItemId);
    },
  };

  return store;
}

describe("supplier domain routes", () => {
  it("lists supplier product lines from supplier_product_lines", async () => {
    const store = createSupplierStore([
      supplierRecord({ payload: { name: "Preferred Peanut Co.", productLines: [] } }),
    ], [
      supplierLine(),
    ]);
    const app = createApp((hono) => registerSupplierRoutes(hono, () => store));

    const response = await app.request("/api/suppliers");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: [
        {
          id: "supplier-1",
          payload: {
            productLines: [
              {
                inventoryItemId: "inventory-peanuts",
                product: "Roasted Peanuts",
                itemName: "Roasted Peanuts",
                type: "Ingredient",
                pricePerLb: 1.86,
                unit: "lb",
                moq: "2 pallets",
              },
            ],
          },
        },
      ],
    });
  });

  it("stores submitted supplier product lines outside generic payload JSON", async () => {
    const store = createSupplierStore([], []);
    const app = createApp((hono) => registerSupplierRoutes(hono, () => store));

    const response = await app.request("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "supplier",
        title: "Packaging Partner",
        payload: {
          name: "Packaging Partner",
          productLines: [
            {
              inventoryItemId: "inventory-labels",
              product: "Pressure Labels",
              itemName: "Pressure Labels",
              type: "Packaging",
              pricePerLb: 0.03,
              unit: "each",
              moq: "25,000 labels",
            },
          ],
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { data: DataRecord };
    const savedLines = store.lines.get(body.data.id);
    expect(savedLines).toMatchObject([
      {
        supplierId: body.data.id,
        inventoryItemId: "inventory-labels",
        productName: "Pressure Labels",
        productType: "Packaging",
        pricePerUnitCents: 3,
        unitOfMeasure: "each",
      },
    ]);
    expect(body.data.payload).toMatchObject({
      name: "Packaging Partner",
      productLines: [
        {
          inventoryItemId: "inventory-labels",
          itemName: "Pressure Labels",
          type: "Packaging",
          pricePerLb: 0.03,
        },
      ],
    });
  });

  it("preserves legacy payload-only supplier lines without inventory ids", async () => {
    const store = createSupplierStore([
      supplierRecord({
        payload: {
          name: "Legacy Supplier",
          productLines: [
            {
              product: "Legacy Allulose",
              itemName: "Legacy Allulose",
              type: "Ingredient",
              pricePerLb: 1.85,
            },
          ],
        },
      }),
    ], []);
    const app = createApp((hono) => registerSupplierRoutes(hono, () => store));

    const list = await app.request("/api/suppliers");
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      ok: true,
      data: [
        {
          payload: {
            productLines: [
              {
                inventoryItemId: "",
                itemName: "Legacy Allulose",
                type: "Ingredient",
                pricePerLb: 1.85,
              },
            ],
          },
        },
      ],
    });

    const update = await app.request("/api/suppliers/supplier-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Legacy Supplier Updated",
        payload: {
          name: "Legacy Supplier Updated",
          productLines: [
            {
              product: "Legacy Allulose",
              itemName: "Legacy Allulose",
              type: "Ingredient",
              pricePerLb: 1.85,
            },
          ],
        },
      }),
    });

    expect(update.status).toBe(200);
    const body = await update.json() as { data: DataRecord };
    expect(store.lines.get("supplier-1")).toEqual([]);
    expect(body.data.payload).toMatchObject({
      name: "Legacy Supplier Updated",
      productLines: [
        {
          inventoryItemId: "",
          itemName: "Legacy Allulose",
          type: "Ingredient",
          pricePerLb: 1.85,
        },
      ],
    });
  });

  it("rejects supplier product lines that do not resolve to inventory", async () => {
    const store = createSupplierStore([], []);
    const app = createApp((hono) => registerSupplierRoutes(hono, () => store));

    const response = await app.request("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "supplier",
        title: "Bad Supplier",
        payload: {
          name: "Bad Supplier",
          productLines: [
            {
              inventoryItemId: "missing-inventory",
              itemName: "Missing Item",
              type: "Ingredient",
              pricePerLb: 1,
            },
          ],
        },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Supplier product lines must reference active Ingredient or Packaging inventory items" },
    });
  });
});
