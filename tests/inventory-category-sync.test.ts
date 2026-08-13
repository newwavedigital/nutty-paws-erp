import { describe, expect, it } from "vitest";
import { D1InventoryStore } from "../src/inventory/d1-store";
import {
  itemTypeForInventoryCategory,
  type InventoryItemInput,
} from "../src/inventory/service";

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

function input(overrides: Partial<InventoryItemInput> = {}): InventoryItemInput {
  return {
    id: "inventory-sync-1",
    masterItemId: "master-sync-1",
    category: "Ingredient",
    supplierId: null,
    customerId: "general",
    onHandQuantity: 0,
    allocatedQuantity: 0,
    reorderPointQuantity: 0,
    unitOfMeasure: "lb",
    unitCostCents: null,
    leadTimeDays: null,
    location: null,
    lotNumber: null,
    lotsJson: null,
    ...overrides,
  };
}

function createDb(options: { failMasterSync?: boolean } = {}) {
  const batches: PreparedStatement[][] = [];
  const inventoryRow = {
    id: "inventory-sync-1",
    master_item_id: "master-sync-1",
    master_item_name: "Sync Item",
    item_type: "packaging",
    category: "Packaging",
    supplier_id: null,
    customer_id: "general",
    on_hand_quantity: 0,
    allocated_quantity: 0,
    reorder_point_quantity: 0,
    unit_of_measure: "ea",
    unit_cost_cents: null,
    lead_time_days: null,
    location: null,
    lot_number: null,
    lots_json: null,
    status: "active",
    archived_at: null,
    archived_by_user_id: null,
  };

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
          if (options.failMasterSync && /UPDATE\s+master_items/i.test(sql)) {
            throw new Error("master item sync failed");
          }
          return { meta: { changes: 1 } };
        },
        async all<T>() {
          if (/FROM\s+inventory_items\s+inv/i.test(sql)) {
            return { results: [inventoryRow] as T[] };
          }
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

describe("inventory category authority", () => {
  it.each([
    ["Ingredient", "raw_material"],
    ["Packaging", "packaging"],
    ["Finished Good", "finished_good"],
  ] as const)("maps %s to Master List item_type %s", (category, itemType) => {
    expect(itemTypeForInventoryCategory(category)).toBe(itemType);
  });

  it("creates inventory and synchronizes the linked Master List row in one D1 batch", async () => {
    const { db, batches } = createDb();
    const store = new D1InventoryStore(db);

    await expect(store.createInventoryItem(input({ category: "Packaging", unitOfMeasure: "ea" }))).resolves.toMatchObject({
      id: "inventory-sync-1",
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql).toMatch(/INSERT\s+INTO\s+inventory_items/i);
    expect(batches[0][1].sql).toMatch(/UPDATE\s+master_items/i);
    expect(batches[0][1].binds).toEqual(["packaging", "master-sync-1", "inventory-sync-1", "master-sync-1"]);
  });

  it("updates a category-changing inventory row and its linked Master List row in one D1 batch", async () => {
    const { db, batches } = createDb();
    const store = new D1InventoryStore(db);

    await expect(store.updateInventoryItem("inventory-sync-1", input({ category: "Finished Good" }))).resolves.toMatchObject({
      id: "inventory-sync-1",
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql).toMatch(/UPDATE\s+inventory_items/i);
    expect(batches[0][1].sql).toMatch(/UPDATE\s+master_items/i);
    expect(batches[0][1].binds).toEqual(["finished_good", "master-sync-1", "inventory-sync-1", "master-sync-1"]);
  });

  it("propagates a Master List sync failure from the atomic batch", async () => {
    const { db, batches } = createDb({ failMasterSync: true });
    const store = new D1InventoryStore(db);

    await expect(store.createInventoryItem(input())).rejects.toThrow("master item sync failed");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
