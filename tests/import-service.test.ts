import { describe, expect, it } from "vitest";
import { commitImport, getImportSchema, previewImport, type ImportAction, type ImportModule, type ImportSnapshot, type ImportStore } from "../src/imports/service";

const existing: ImportSnapshot = {
  customers: [{ id: "customer-1", name: "Acme", status: "active" }],
  products: [{ id: "product-1", sku: "SKU-1", status: "active" }],
  suppliers: [{ id: "supplier-1", title: "Supply Co", status: "active", payload: { contact: "Sam", protected: "unchanged" }, fileIds: ["file-1"] }],
  masterItems: [{ id: "master-1", sku: "INV-1", status: "archived" }],
  inventoryItems: [{ id: "inventory-1", masterItemId: "master-1", status: "active", onHandQuantity: 20, allocatedQuantity: 5, lotsJson: '[{"lotNumber":"a"},{"lotNumber":"b"}]' }],
};

const rows = {
  customers: { name: "", contact_name: "", contact_email: "", phone: "", status: "" },
  products: { sku: "", name: "", customer_name: "", status: "", production_room: "", size: "", size_unit: "", case_quantity: "", case_sticker: "", unit_price: "", kosher: "", allergen: "", allergen_details: "", daily_production_rate: "", notes: "" },
  suppliers: { name: "", contact_name: "", email: "", phone: "", website: "", moq: "", notes: "" },
  inventory: { sku: "", name: "", category: "", unit_of_measure: "", allergens: "", customer_name: "", supplier_name: "", on_hand_quantity: "", reorder_point_quantity: "", unit_cost: "", lead_time_days: "", location: "", lot_number: "" },
};

function headers(module: keyof typeof rows) { return getImportSchema(module).columns.map(column => column.key); }
function empty(module: keyof typeof rows) { return { ...rows[module] }; }
function allNew(module: ImportModule) {
  if (module === "customers") return { ...empty(module), name: "New Customer" };
  if (module === "products") return { ...empty(module), sku: "NEW-PRODUCT", name: "New Product", customer_name: "Acme" };
  if (module === "suppliers") return { ...empty(module), name: "New Supplier" };
  return { ...empty(module), sku: "NEW-INVENTORY", name: "New Inventory", category: "Ingredient", unit_of_measure: "LBS", on_hand_quantity: "0", customer_name: "Acme", supplier_name: "Supply Co" };
}
function storeFor(snapshot: ImportSnapshot = existing) {
  const commits: ImportAction[][] = [];
  const store: ImportStore = { async loadSnapshot() { return snapshot; }, async commit(actions) { commits.push(actions); } };
  return { store, commits };
}

describe("create-only bulk import", () => {
  it("publishes explicit create-only target and inventory guidance", () => {
    const descriptions = ["customers", "products", "suppliers", "inventory"].map(module => getImportSchema(module as ImportModule).columns.find(column => column.key === getImportSchema(module as ImportModule).keyColumn)?.description ?? "");
    const onHand = getImportSchema("inventory").columns.find(column => column.key === "on_hand_quantity")?.description ?? "";
    expect(descriptions.every(description => description.includes("block the whole file") && description.includes("portal"))).toBe(true);
    expect(onHand).toContain("zero allocated quantity");
    expect(onHand).not.toContain("cannot be lower");
  });
  it.each(["customers", "products", "suppliers", "inventory"] as const)("previews and commits all-new %s rows as creates", async module => {
    const { store, commits } = storeFor();
    const preview = await previewImport(store, module, headers(module), [allNew(module)], [7]);
    expect(preview.preview).toMatchObject({ valid: true, creates: 1, records: [{ row: 7 }] });
    expect(preview.preview).not.toHaveProperty("updates");
    expect(preview.preview).not.toHaveProperty("changes");
    await commitImport(store, module, headers(module), [allNew(module)], "user-1", [7]);
    expect(commits).toHaveLength(1);
    expect(commits[0][0]).not.toHaveProperty("operation");
  });

  it.each([
    ["customers", () => ({ ...empty("customers"), name: "  acme  " }), "name"],
    ["products", () => ({ ...empty("products"), sku: " sku-1 ", name: "Ignored" }), "sku"],
    ["suppliers", () => ({ ...empty("suppliers"), name: " supply co " }), "name"],
    ["inventory", () => ({ ...empty("inventory"), sku: " inv-1 ", name: "Ignored", category: "Ingredient", unit_of_measure: "LBS", on_hand_quantity: "0" }), "sku"],
  ] as const)("blocks an existing normalized %s target", async (module, makeRow, field) => {
    const { store, commits } = storeFor();
    const result = await commitImport(store, module, headers(module), [makeRow()], null, [12]);
    expect(result).toMatchObject({ valid: false, creates: 0, records: [] });
    expect(result.errors).toContainEqual(expect.objectContaining({ row: 12, field, code: "IMPORT_RECORD_EXISTS" }));
    expect(commits).toEqual([]);
  });

  it("uses NFKC/case/space normalization but keeps punctuation distinct", async () => {
    const { store } = storeFor({ ...existing, customers: [{ id: "customer-1", name: "Café", status: "active" }] });
    const equivalent = await previewImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "  CAFÉ  " }]);
    const distinct = await previewImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "Café!" }]);
    expect(equivalent.preview.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_RECORD_EXISTS" }));
    expect(distinct.preview).toMatchObject({ valid: true, creates: 1 });
  });

  it("allows a new active Supplier to reuse an archived normalized name", async () => {
    const { store } = storeFor({
      ...existing,
      suppliers: [{ id: "supplier-archived", title: " Archived Supply ", status: "archived", payload: {}, fileIds: [] }],
    });
    const result = await previewImport(store, "suppliers", headers("suppliers"), [
      { ...empty("suppliers"), name: "archived supply" },
    ]);
    expect(result.preview).toMatchObject({ valid: true, creates: 1 });
  });

  it("blocks a mixed file atomically and leaves existing records untouched", async () => {
    const { store, commits } = storeFor();
    const original = JSON.stringify(existing);
    const result = await commitImport(store, "customers", headers("customers"), [
      { ...empty("customers"), name: "Brand New" }, { ...empty("customers"), name: "ACME", contact_email: "new@example.com" },
    ], "user-1");
    expect(result).toMatchObject({ valid: false, creates: 0, records: [] });
    expect(commits).toEqual([]);
    expect(JSON.stringify(existing)).toBe(original);
  });

  it("blocks all-existing files and duplicate target identifiers", async () => {
    const { store } = storeFor();
    const allExisting = await previewImport(store, "products", headers("products"), [{ ...empty("products"), sku: "SKU-1", name: "One" }]);
    const duplicate = await previewImport(store, "customers", headers("customers"), [
      { ...empty("customers"), name: "New" }, { ...empty("customers"), name: " new " },
    ]);
    expect(allExisting.preview).toMatchObject({ valid: false, creates: 0, records: [] });
    expect(duplicate.preview.errors).toContainEqual(expect.objectContaining({ row: 3, message: expect.stringContaining("Duplicate") }));
  });

  it("revalidates a fresh snapshot on commit and fails closed when preview is stale", async () => {
    const fresh: ImportSnapshot = { customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] };
    const stale: ImportSnapshot = { ...fresh, customers: [{ id: "customer-race", name: "Race", status: "active" }] };
    let loads = 0;
    const commits: ImportAction[][] = [];
    const store: ImportStore = { async loadSnapshot() { return loads++ === 0 ? fresh : stale; }, async commit(actions) { commits.push(actions); } };
    const preview = await previewImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "Race" }]);
    const commit = await commitImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "Race" }], "user-1");
    expect(preview.preview.valid).toBe(true);
    expect(commit).toMatchObject({ valid: false, creates: 0, records: [] });
    expect(commits).toEqual([]);
  });

  it("keeps customer and supplier relationships read-only", async () => {
    const { store } = storeFor();
    const product = await previewImport(store, "products", headers("products"), [allNew("products")]);
    const inventory = await previewImport(store, "inventory", headers("inventory"), [allNew("inventory")]);
    expect(product.actions[0]).toMatchObject({ customerId: "customer-1" });
    expect(inventory.actions[0]).toMatchObject({ customerId: "customer-1", supplierId: "supplier-1" });
    expect(product.actions[0]).not.toHaveProperty("customer");
  });

  it("blocks an Inventory Master SKU regardless of item state or lots", async () => {
    const { store } = storeFor();
    const result = await previewImport(store, "inventory", headers("inventory"), [{ ...empty("inventory"), sku: "INV-1", name: "Ignored", category: "Ingredient", unit_of_measure: "LBS", on_hand_quantity: "999" }], [25]);
    expect(result.preview.errors).toContainEqual(expect.objectContaining({ row: 25, field: "sku", code: "IMPORT_RECORD_EXISTS", message: expect.stringContaining("This Inventory SKU") }));
    expect(result.preview.errors.map(error => error.code)).not.toContain("INVENTORY_MULTI_LOT");
  });

  it("never changes existing customer, product, supplier, or inventory state when their target keys are imported", async () => {
    const preserved: ImportSnapshot = {
      customers: [{ id: "customer-1", name: "Acme", status: "active", contactName: "Alex", contactEmail: "old@acme.example", phone: "555-0100" }],
      products: [{ id: "product-1", sku: "SKU-1", status: "active", customerId: "customer-1", name: "Old product", notes: "keep" }],
      suppliers: [{ id: "supplier-1", title: "Supply Co", status: "active", payload: { name: "Supply Co", notes: "keep", custom: { untouched: true } }, fileIds: ["file-1", "file-2"] }],
      masterItems: [{ id: "master-1", sku: "INV-1", status: "active", name: "Old Inventory", itemType: "raw_material", unitOfMeasure: "LBS", allergens: ["peanut"] }],
      inventoryItems: [{ id: "inventory-1", masterItemId: "master-1", status: "active", onHandQuantity: 20, allocatedQuantity: 5, reorderPointQuantity: 8, lotsJson: '[{"lotNumber":"old","qty":20}]' }],
    };
    const before = structuredClone(preserved);
    const { store, commits } = storeFor(preserved);
    const inputs: Array<[ImportModule, Record<string, unknown>]> = [
      ["customers", { ...empty("customers"), name: "acme", contact_email: "new@acme.example" }],
      ["products", { ...empty("products"), sku: "sku-1", name: "New product" }],
      ["suppliers", { ...empty("suppliers"), name: "supply co", notes: "replace" }],
      ["inventory", { ...empty("inventory"), sku: "inv-1", name: "New inventory", category: "Ingredient", unit_of_measure: "LBS", on_hand_quantity: "999", lot_number: "new" }],
    ];
    for (const [module, row] of inputs) {
      const result = await commitImport(store, module, headers(module), [row], "user-1");
      expect(result).toMatchObject({ valid: false, creates: 0, records: [] });
    }
    expect(commits).toEqual([]);
    expect(preserved).toEqual(before);
  });

  it("preserves row numbering, validation, and the 500-row limit", async () => {
    const { store } = storeFor({ customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] });
    const bad = await previewImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "One", contact_email: "bad" }], [33]);
    const maximum = await previewImport(store, "customers", headers("customers"), Array.from({ length: 500 }, (_, i) => ({ ...empty("customers"), name: `Customer ${i}` })));
    const tooMany = await previewImport(store, "customers", headers("customers"), Array.from({ length: 501 }, (_, i) => ({ ...empty("customers"), name: `Customer ${i}` })));
    expect(bad.preview.errors).toContainEqual(expect.objectContaining({ row: 33, field: "contact_email" }));
    expect(maximum.preview).toMatchObject({ valid: true, creates: 500 });
    expect(tooMany.preview.errors).toContainEqual(expect.objectContaining({ row: 0, field: "file" }));
  });

  it("collects create-only validation failures across typed fields and relationship references", async () => {
    const { store } = storeFor({
      ...existing,
      customers: [{ id: "customer-1", name: "Acme", status: "active" }, { id: "customer-2", name: "Duplicate Customer", status: "active" }, { id: "customer-3", name: "duplicate customer", status: "active" }],
      suppliers: [{ id: "supplier-1", title: "Supply Co", status: "active", payload: {}, fileIds: [] }, { id: "supplier-2", title: "Duplicate Supplier", status: "active", payload: {}, fileIds: [] }, { id: "supplier-3", title: "duplicate supplier", status: "active", payload: {}, fileIds: [] }],
    });
    const product = await previewImport(store, "products", headers("products"), [{
      ...empty("products"), sku: "NEW", name: "Product", customer_name: "Missing", status: "wrong", size: "12", size_unit: "ounce",
      case_quantity: "1.5", unit_price: "90071992547409.92", daily_production_rate: "1.5", kosher: "maybe", allergen: "sometimes",
    }]);
    const inventory = await previewImport(store, "inventory", headers("inventory"), [{
      ...empty("inventory"), sku: "NEW-INV", name: "Inventory", category: "not-a-category", unit_of_measure: "lb", customer_name: "Duplicate Customer",
      supplier_name: "Duplicate Supplier", on_hand_quantity: "-1", reorder_point_quantity: "bad", unit_cost: "1.005", lead_time_days: "1.5",
    }]);
    const multipleTarget = await previewImport(store, "customers", headers("customers"), [{ ...empty("customers"), name: "Duplicate Customer" }]);
    expect(product.preview.errors.map(error => error.field)).toEqual(expect.arrayContaining(["customer_name", "status", "size_unit", "case_quantity", "unit_price", "daily_production_rate", "kosher", "allergen"]));
    expect(inventory.preview.errors.map(error => error.field)).toEqual(expect.arrayContaining(["category", "unit_of_measure", "customer_name", "supplier_name", "on_hand_quantity", "reorder_point_quantity", "unit_cost", "lead_time_days"]));
    expect(multipleTarget.preview.errors).toContainEqual(expect.objectContaining({ field: "name", code: "IMPORT_RECORD_EXISTS", recordKey: "Duplicate Customer", message: expect.stringContaining("Multiple existing") }));
  });

  it("rejects unsafe numeric magnitudes and excessive decimal precision before persistence", async () => {
    const { store } = storeFor({ customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] });
    const product = await previewImport(store, "products", headers("products"), [{
      ...empty("products"), sku: "SAFE-NUMBER", name: "Safe Number", size: "1000000000.000001", size_unit: "oz",
      case_quantity: "9007199254740993", daily_production_rate: "1.0000001",
    }]);
    const inventory = await previewImport(store, "inventory", headers("inventory"), [{
      ...empty("inventory"), sku: "SAFE-INVENTORY", name: "Safe Inventory", category: "Ingredient", unit_of_measure: "LBS",
      on_hand_quantity: "1000000000.000001", reorder_point_quantity: "0.0000001", lead_time_days: "9007199254740993",
    }]);
    expect(product.preview.errors.map(error => error.field)).toEqual(expect.arrayContaining(["size", "case_quantity", "daily_production_rate"]));
    expect(inventory.preview.errors.map(error => error.field)).toEqual(expect.arrayContaining(["on_hand_quantity", "reorder_point_quantity", "lead_time_days"]));
  });

  it("rejects malformed files, headers, row metadata, and oversized cells without loading a snapshot", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return existing; }, async commit() {} };
    const malformed = await previewImport(store, "customers", ["name", "name", "unknown"], [{ name: "x".repeat(10_001) }, null], [2, 2]);
    const noRows = await previewImport(store, "customers", headers("customers"), [], []);
    expect(malformed.preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "name", message: expect.stringContaining("Duplicate header") }),
      expect.objectContaining({ field: "unknown", message: expect.stringContaining("Unknown template") }),
      expect.objectContaining({ field: "rowNumbers" }),
      expect.objectContaining({ field: "row" }),
      expect.objectContaining({ field: "name", message: expect.stringContaining("10,000") }),
    ]));
    expect(noRows.preview.errors).toContainEqual(expect.objectContaining({ field: "file", message: expect.stringContaining("does not contain") }));
    expect(loads).toBe(1);
  });

  it("covers missing and alternate Inventory category/unit paths", async () => {
    const { store } = storeFor({ customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] });
    const missing = await previewImport(store, "inventory", headers("inventory"), [{ ...empty("inventory"), sku: "MISSING", name: "Missing", category: "", unit_of_measure: "", on_hand_quantity: "0" }]);
    const packaging = await previewImport(store, "inventory", headers("inventory"), [{ ...empty("inventory"), sku: "PACK", name: "Packaging", category: "packaging", unit_of_measure: "Each", on_hand_quantity: "1" }]);
    const finished = await previewImport(store, "inventory", headers("inventory"), [{ ...empty("inventory"), sku: "FINISHED", name: "Finished", category: "finished-goods", unit_of_measure: "LBS", on_hand_quantity: "1" }]);
    expect(missing.preview.errors.map(error => error.field)).toEqual(expect.arrayContaining(["category", "unit_of_measure"]));
    expect(packaging.actions[0]).toMatchObject({ category: "Packaging", itemType: "packaging" });
    expect(finished.actions[0]).toMatchObject({ category: "Finished Good", itemType: "finished_good" });
  });
});
