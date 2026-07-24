import { describe, expect, it } from "vitest";
import { D1ImportStore } from "../src/imports/d1-store";
import { ImportCommitConflictError, type ImportAction, type ImportModule } from "../src/imports/service";

describe("D1 create-only bulk import store", () => {
  it.each([
    ["customers", ["customers"]], ["products", ["customers", "products"]], ["suppliers", ["suppliers"]],
    ["inventory", ["customers", "inventory_items", "master_items", "suppliers"]],
  ] as const)("loads only %s snapshot tables", async (module, expected) => {
    const sql: string[] = [];
    const db = { prepare(query: string) { sql.push(query); return { async all() { return { results: [] }; } }; } } as unknown as D1Database;
    await new D1ImportStore(db).loadSnapshot(module as ImportModule);
    expect(sql.map(query => /FROM\s+([a-z_]+)/i.exec(query)?.[1]).filter(Boolean).sort()).toEqual([...expected].sort());
  });

  it("normalizes populated D1 snapshots and fails malformed persisted values closed", async () => {
    const tableRows: Record<string, Array<Record<string, unknown>>> = {
      customers: [{ id: null, name: 42, contact_name: undefined, contact_email: null, phone: 555, status: "inactive" }],
      products: [{ id: "product-1", customer_id: null, sku: "SKU", name: "Product", description: null, status: "inactive", production_room: null, size: "bad", size_unit: null, case_quantity: 2, case_sticker: null, unit_price_cents: "bad", kosher: "1", allergen: 0, allergen_details: null, daily_production_rate: undefined, notes: null }],
      suppliers: [{ id: "supplier-1", title: "Supplier", status: "archived", payload_json: "bad-json", file_ids_json: '["file-1", 2]' }],
      master_items: [{ id: "master-1", sku: "INV", name: "Inventory", item_type: "unknown", unit_of_measure: null, customer_id: null, allergens_json: "bad-json", status: "archived" }],
      inventory_items: [{ id: "inventory-1", master_item_id: "master-1", status: "archived", on_hand_quantity: "bad", allocated_quantity: 3, reorder_point_quantity: null, unit_of_measure: null, location: undefined, category: "unknown", supplier_id: null, customer_id: null, unit_cost_cents: "bad", lead_time_days: "bad", lot_number: null, lots_json: 7 }],
    };
    const db = {
      prepare(query: string) {
        const table = /FROM\s+([a-z_]+)/i.exec(query)?.[1] ?? "";
        return { async all() { return { results: tableRows[table] ?? [] }; } };
      },
    } as unknown as D1Database;
    const store = new D1ImportStore(db);
    const [customers, products, suppliers, inventory] = await Promise.all([
      store.loadSnapshot("customers"), store.loadSnapshot("products"), store.loadSnapshot("suppliers"), store.loadSnapshot("inventory"),
    ]);
    expect(customers.customers[0]).toMatchObject({ id: "", name: "42", contactName: null, phone: "555", status: "inactive" });
    expect(products.products[0]).toMatchObject({ size: null, unitPriceCents: null, kosher: true, allergen: false, dailyProductionRate: null });
    expect(suppliers.suppliers[0]).toMatchObject({ status: "archived", payload: {}, fileIds: ["file-1"] });
    expect(inventory.masterItems[0]).toMatchObject({ itemType: "raw_material", unitOfMeasure: "", allergens: [], status: "archived" });
    expect(inventory.inventoryItems[0]).toMatchObject({ onHandQuantity: 0, allocatedQuantity: 3, reorderPointQuantity: 0, category: "Ingredient", unitCostCents: null, leadTimeDays: null, lotsJson: "7" });
  });

  it("writes create audits and Inventory opening balance history atomically under one import batch", async () => {
    const sql: string[] = [];
    let batch: unknown[] = [];
    const db = {
      prepare(query: string) { sql.push(query); return { bind(...bindings: unknown[]) { return { query, bindings }; } }; },
      async batch(statements: unknown[]) { batch = statements; return []; },
    } as unknown as D1Database;
    const actions: ImportAction[] = [
      { kind: "customer", sourceRow: 2, id: "customer-new", name: "New Customer", contactName: null, contactEmail: null, phone: null, status: "active" },
      { kind: "product", sourceRow: 3, id: "product-new", customerId: "customer-new", sku: "NEW-PRODUCT", name: "New Product", description: null, status: "active", productionRoom: null, size: null, sizeUnit: null, caseQuantity: null, caseSticker: null, unitPriceCents: null, kosher: false, allergen: false, allergenDetails: null, dailyProductionRate: null, notes: null },
      { kind: "supplier", sourceRow: 4, id: "supplier-new", name: "New Supplier", payload: { name: "New Supplier" }, fileIds: [] },
      { kind: "inventory", sourceRow: 5, masterItemId: "master-new", inventoryItemId: "inventory-new", sku: "NEW-INVENTORY", name: "New Inventory", itemType: "raw_material", category: "Ingredient", unitOfMeasure: "LBS", allergens: [], customerId: "general", supplierId: null, onHandQuantity: 10, reorderPointQuantity: 2, unitCostCents: null, leadTimeDays: null, location: null, lotNumber: null, lotsAfterJson: "[]" },
    ];
    await new D1ImportStore(db).commit(actions, "user-1");
    expect(batch).toHaveLength(11);
    const combined = sql.join("\n");
    expect(combined).toMatch(/INSERT INTO customers/);
    expect(combined).toMatch(/INSERT INTO products/);
    expect(combined).toMatch(/INSERT INTO suppliers/);
    expect(combined).toMatch(/INSERT INTO audit_events/);
    expect(combined).toMatch(/INSERT INTO master_items/);
    expect(combined).toMatch(/INSERT INTO inventory_items/);
    expect(combined).toMatch(/INSERT INTO inventory_adjustments/);
    expect(combined).not.toMatch(/ON CONFLICT|DO UPDATE/i);
    expect(combined).toContain("updated_by_user_id");
    expect(combined).toContain("bulk_import_opening_balance");
    expect(combined).toContain(" 0, json_extract(value,'$.reorderPointQuantity')");

    const statements = batch as Array<{ query: string; bindings: unknown[] }>;
    const auditRows = statements
      .filter(statement => /INSERT INTO audit_events/.test(statement.query))
      .flatMap(statement => JSON.parse(String(statement.bindings[0])) as Array<{ auditMetadata: string; actorUserId: string; auditAction: string }>);
    const auditMetadata = auditRows.map(row => JSON.parse(row.auditMetadata) as Record<string, unknown>);
    expect(auditRows).toHaveLength(5);
    expect(auditRows.slice(0, 4).map(row => row.auditAction)).toEqual([
      "customer.created", "product.created", "supplier.created", "inventory.created",
    ]);
    expect(auditRows[4].auditAction).toBe("bulk_import.committed");
    expect(new Set(auditMetadata.map(metadata => metadata.importBatchId)).size).toBe(1);
    expect(auditMetadata.slice(0, 4)).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: "customers", actorUserId: "user-1", sourceRow: 2, sourceKey: "New Customer" }),
      expect.objectContaining({ module: "products", actorUserId: "user-1", sourceRow: 3, sourceKey: "NEW-PRODUCT" }),
      expect.objectContaining({ module: "suppliers", actorUserId: "user-1", sourceRow: 4, sourceKey: "New Supplier" }),
      expect.objectContaining({ module: "inventory", actorUserId: "user-1", sourceRow: 5, sourceKey: "NEW-INVENTORY", openingQuantity: 10 }),
    ]));
    expect(auditMetadata[4]).toMatchObject({
      importBatchId: auditMetadata[0].importBatchId,
      module: "mixed",
      actorUserId: "user-1",
      recordCount: 4,
      createdRecords: expect.arrayContaining([
        expect.objectContaining({ entityType: "inventory_item", entityId: "inventory-new", sourceKey: "NEW-INVENTORY" }),
      ]),
    });

    const adjustmentStatement = statements.find(statement => /INSERT INTO inventory_adjustments/.test(statement.query));
    const adjustmentRow = JSON.parse(String(adjustmentStatement?.bindings[0]))[0] as { auditMetadata: string; onHandQuantity: number };
    expect(adjustmentRow.onHandQuantity).toBe(10);
    expect(JSON.parse(adjustmentRow.auditMetadata)).toMatchObject({
      importBatchId: auditMetadata[0].importBatchId,
      actorUserId: "user-1",
      sourceRow: 5,
      sourceKey: "NEW-INVENTORY",
    });
  });

  it("does not batch an empty action list", async () => {
    let batches = 0;
    const db = { prepare() { throw new Error("not called"); }, async batch() { batches += 1; return []; } } as unknown as D1Database;
    await new D1ImportStore(db).commit([], null);
    expect(batches).toBe(0);
  });

  it("maps late database uniqueness failures to a stale preview conflict", async () => {
    let batches = 0;
    let submittedStatements = 0;
    const db = {
      prepare(query: string) { return { bind() { return { query }; } }; },
      async batch(statements: unknown[]) {
        batches += 1;
        submittedStatements = statements.length;
        throw new Error("UNIQUE constraint failed: customers.name");
      },
    } as unknown as D1Database;
    const action: ImportAction = { kind: "customer", sourceRow: 2, id: "customer-new", name: "New", contactName: null, contactEmail: null, phone: null, status: "active" };
    await expect(new D1ImportStore(db).commit([action], null)).rejects.toBeInstanceOf(ImportCommitConflictError);
    expect(batches).toBe(1);
    expect(submittedStatements).toBe(3);
  });

  it("maps PRIMARY KEY collisions to a stale preview conflict", async () => {
    const db = {
      prepare(query: string) { return { bind() { return { query }; } }; },
      async batch() { throw new Error("PRIMARY KEY constraint failed: customers.id"); },
    } as unknown as D1Database;
    const action: ImportAction = { kind: "customer", sourceRow: 2, id: "customer-new", name: "New", contactName: null, contactEmail: null, phone: null, status: "active" };
    await expect(new D1ImportStore(db).commit([action], null)).rejects.toBeInstanceOf(ImportCommitConflictError);
  });

  it("rethrows non-constraint D1 failures", async () => {
    const db = {
      prepare(query: string) { return { bind() { return { query }; } }; },
      async batch() { throw new Error("database unavailable"); },
    } as unknown as D1Database;
    const action: ImportAction = { kind: "customer", sourceRow: 2, id: "customer-new", name: "New", contactName: null, contactEmail: null, phone: null, status: "active" };
    await expect(new D1ImportStore(db).commit([action], null)).rejects.toThrow("database unavailable");
  });

  it.each(["CHECK constraint failed: inventory_items", "FOREIGN KEY constraint failed"])("does not misclassify %s as a stale preview", async message => {
    const db = {
      prepare(query: string) { return { bind() { return { query }; } }; },
      async batch() { throw new Error(message); },
    } as unknown as D1Database;
    const action: ImportAction = { kind: "customer", sourceRow: 2, id: "customer-new", name: "New", contactName: null, contactEmail: null, phone: null, status: "active" };
    await expect(new D1ImportStore(db).commit([action], null)).rejects.toThrow(message);
  });

  it("chunks a large create-only inventory import within D1 limits", async () => {
    let batchSize = 0;
    const db = {
      prepare(query: string) { return { bind(...bindings: unknown[]) { return { query, bindings }; } }; },
      async batch(statements: unknown[]) { batchSize = statements.length; return []; },
    } as unknown as D1Database;
    const actions: ImportAction[] = Array.from({ length: 500 }, (_, index) => ({
      kind: "inventory", sourceRow: index + 2, masterItemId: `master-${index}`, inventoryItemId: `inventory-${index}`, sku: `SKU-${index}`, name: `Item ${index}`,
      itemType: "raw_material", category: "Ingredient", unitOfMeasure: "LBS", allergens: [], customerId: "general", supplierId: null,
      onHandQuantity: 1, reorderPointQuantity: 0, unitCostCents: null, leadTimeDays: null, location: null, lotNumber: null, lotsAfterJson: "[]",
    }));
    await new D1ImportStore(db).commit(actions, null);
    expect(batchSize).toBeLessThanOrEqual(100);
  });

  it("splits oversized create-only JSON payloads before batching", async () => {
    let batchSize = 0;
    const db = {
      prepare(query: string) { return { bind(...bindings: unknown[]) { return { query, bindings }; } }; },
      async batch(statements: unknown[]) { batchSize = statements.length; return []; },
    } as unknown as D1Database;
    const actions: ImportAction[] = Array.from({ length: 300 }, (_, index) => ({
      kind: "customer", sourceRow: index + 2, id: `customer-${index}`, name: `Customer ${index}`, contactName: null,
      contactEmail: null, phone: "x".repeat(2_000), status: "active",
    }));
    await new D1ImportStore(db).commit(actions, null);
    expect(batchSize).toBeGreaterThan(1);
  });
});
