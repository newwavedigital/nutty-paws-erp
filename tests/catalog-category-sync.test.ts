import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerCatalogRoutes } from "../src/catalog/routes";
import { CatalogError, type CatalogStore, type MasterItemInput } from "../src/catalog/service";
import { D1CatalogStore } from "../src/catalog/d1-store";

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

const baseInput: MasterItemInput = {
  id: "master-sync-1",
  sku: "SYNC-1",
  name: "Sync Item",
  itemType: "raw_material",
  unitOfMeasure: "lb",
  customerId: null,
  allergens: [],
};

function masterRow(itemType: MasterItemInput["itemType"] = "raw_material") {
  return {
    id: baseInput.id,
    sku: baseInput.sku,
    name: baseInput.name,
    item_type: itemType,
    unit_of_measure: baseInput.unitOfMeasure,
    customer_id: null,
    allergens_json: "[]",
    status: "active",
    archived_at: null,
    archived_by_user_id: null,
  };
}

function createDb(options: {
  activeInventoryLink?: boolean;
  masterItemType?: MasterItemInput["itemType"];
  masterUpdateChanges?: number;
  failInventoryUpdate?: boolean;
} = {}) {
  const batches: PreparedStatement[][] = [];
  const db = {
    prepare(sql: string): PreparedStatement {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...values: unknown[]) {
          statement.binds = values;
          return statement;
        },
        async run() {
          if (/UPDATE\s+inventory_items/i.test(sql) && options.failInventoryUpdate) {
            throw new Error("inventory category sync failed");
          }
          if (/UPDATE\s+master_items/i.test(sql)) {
            return { meta: { changes: options.masterUpdateChanges ?? 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async first<T>() {
          if (/SELECT\s+1\s+AS\s+linked/i.test(sql)) {
            return (options.activeInventoryLink ? { linked: 1 } : null) as T | null;
          }
          if (/FROM\s+master_items/i.test(sql)) {
            return masterRow(options.masterItemType ?? baseInput.itemType) as T;
          }
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      } as PreparedStatement;
      return statement;
    },
    async batch(statements: PreparedStatement[]) {
      batches.push(statements);
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
  return { db, batches };
}

describe("Master List and Inventory category consistency", () => {
  it.each([
    ["raw_material", "Ingredient"],
    ["packaging", "Packaging"],
    ["finished_good", "Finished Good"],
  ] as const)("synchronizes %s to active Inventory category %s", async (itemType, category) => {
    const { db, batches } = createDb();
    const store = new D1CatalogStore(db);

    await expect(store.updateMasterItem(baseInput.id, { ...baseInput, itemType })).resolves.toMatchObject({ id: baseInput.id });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql).toMatch(/UPDATE\s+master_items/i);
    expect(batches[0][1].sql).toMatch(/UPDATE\s+inventory_items/i);
    expect(batches[0][1].sql).toMatch(/status\s*=\s*'active'/i);
    expect(batches[0][1].binds).toEqual([category, baseInput.id]);
  });

  it("leaves archived Inventory categories unchanged during a Master List edit", async () => {
    const { db, batches } = createDb();
    const store = new D1CatalogStore(db);

    await store.updateMasterItem(baseInput.id, { ...baseInput, itemType: "packaging" });

    expect(batches[0][1].sql).toContain("status = 'active'");
  });

  it("rejects other when an active Inventory row is linked", async () => {
    const { db, batches } = createDb({ activeInventoryLink: true, masterUpdateChanges: 0 });
    const store = new D1CatalogStore(db);

    await expect(store.updateMasterItem(baseInput.id, { ...baseInput, itemType: "other" })).rejects.toMatchObject({
      name: "CatalogError",
      code: "MASTER_ITEM_TYPE_CONFLICT",
      status: 409,
      message: expect.stringContaining("cannot be other"),
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].sql).not.toMatch(/UPDATE\s+inventory_items/i);
  });

  it("allows other for an unlinked Master List item", async () => {
    const { db } = createDb({ masterItemType: "other" });
    const store = new D1CatalogStore(db);

    await expect(store.updateMasterItem(baseInput.id, { ...baseInput, itemType: "other" })).resolves.toMatchObject({
      id: baseInput.id,
      itemType: "other",
    });
  });

  it("propagates Inventory sync failures from the atomic Master List batch", async () => {
    const { db, batches } = createDb({ failInventoryUpdate: true });
    const store = new D1CatalogStore(db);

    await expect(store.updateMasterItem(baseInput.id, { ...baseInput, itemType: "packaging" })).rejects.toThrow("inventory category sync failed");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("returns a clear 409 API error for an active-link other conflict", async () => {
    const existing = {
      id: baseInput.id,
      sku: baseInput.sku,
      name: baseInput.name,
      itemType: "raw_material" as const,
      unitOfMeasure: baseInput.unitOfMeasure,
      customerId: null,
      allergens: [],
      status: "active" as const,
    };
    const store: CatalogStore = {
      async listProducts() { return []; },
      async getProduct() { return null; },
      async listMasterItems() { return [existing]; },
      async getMasterItem() { return existing; },
      async updateMasterItem() {
        throw new CatalogError(
          "MASTER_ITEM_TYPE_CONFLICT",
          "Master List item type cannot be other while an active Inventory item is linked; change the Inventory category or archive the Inventory item first",
          { masterItemId: existing.id },
        );
      },
    };
    const app = createApp((route) => registerCatalogRoutes(route, () => store), undefined,);

    const response = await app.request(`/api/master-items/${existing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: existing.sku,
        name: existing.name,
        itemType: "other",
        unitOfMeasure: existing.unitOfMeasure,
        allergens: [],
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "MASTER_ITEM_TYPE_CONFLICT",
        message: expect.stringContaining("cannot be other"),
      },
    });
  });
});
