import { describe, expect, test, vi } from "vitest";
import { D1AuthStore, roleIdFor } from "../src/auth/d1-store";
import { D1CatalogStore } from "../src/catalog/d1-store";
import { D1CustomerStore } from "../src/customers/d1-store";
import { D1FileStore } from "../src/files/d1-store";
import { D1InventoryStore } from "../src/inventory/d1-store";
import { sendSubmittedPurchaseOrderEmail } from "../src/notifications/sendgrid";
import { D1PickPackStore } from "../src/pick-pack/d1-store";
import { D1ProcurementStore } from "../src/procurement/d1-store";
import { D1ProductionStore } from "../src/production/d1-store";
import { D1PurchaseOrderStore } from "../src/purchase-orders/d1-store";
import { D1QualityStore } from "../src/quality/d1-store";
import { D1DataRecordStore } from "../src/records/d1-store";
import { D1ResearchStore } from "../src/research/d1-store";
import { D1ShippingStore } from "../src/shipping/d1-store";

type QueryKind = "first" | "all" | "run";
type QueryCall = { kind: QueryKind; sql: string; binds: unknown[] };

class FakeD1Statement {
  private binds: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly resolve: (call: QueryCall) => unknown,
  ) {}

  bind(...values: unknown[]) {
    this.binds = values;
    return this;
  }

  async first<T>() {
    return this.resolve({ kind: "first", sql: this.sql, binds: this.binds }) as T | null;
  }

  async all<T>() {
    return { results: this.resolve({ kind: "all", sql: this.sql, binds: this.binds }) as T[] };
  }

  async run() {
    return this.resolve({ kind: "run", sql: this.sql, binds: this.binds }) as D1Result;
  }
}

function fakeDb(resolve: (call: QueryCall) => unknown = defaultResolve) {
  return {
    prepare(sql: string) {
      return new FakeD1Statement(sql, resolve);
    },
    async batch(statements: FakeD1Statement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
}

function emptyDb() {
  return fakeDb((call) => {
    if (call.kind === "run") return { meta: { changes: 0 } };
    if (call.kind === "all") return [];
    if (has(call.sql, "COUNT(*)")) return { count: 0 };
    if (has(call.sql, "MAX(CAST")) return { max_id: null, max_sequence: null };
    return null;
  });
}

function has(sql: string, fragment: string) {
  return sql.toLowerCase().includes(fragment.toLowerCase());
}

function defaultResolve(call: QueryCall) {
  if (call.kind === "run") return { meta: { changes: 1 } };
  if (call.kind === "all") return rowsFor(call.sql);
  if (has(call.sql, "COUNT(*)")) return { count: 2 };
  if (has(call.sql, "MAX(CAST")) return { max_id: 1042, max_sequence: 1042 };
  return rowsFor(call.sql)[0] ?? null;
}

function rowsFor(sql: string): Record<string, unknown>[] {
  if (has(sql, "FROM users")) return [userRow()];
  if (has(sql, "FROM roles")) return [{ name: "Admin" }];
  if (has(sql, "FROM customer_user_access")) return [{ customer_id: "customer-1", access_level: "manager" }];
  if (has(sql, "FROM sessions")) {
    return [{ id: "session-1", user_id: "user-1", token_hash: "token-hash", expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null }];
  }
  if (has(sql, "FROM customers")) return [customerRow()];
  if (has(sql, "FROM inventory_reservations")) return [reservationRow()];
  if (has(sql, "FROM receiving_entries")) return [receivingRow()];
  if (has(sql, "FROM move_entries")) return [moveRow()];
  if (has(sql, "FROM production_inventory_effects")) return [{ inventory_item_id: "inv-1", quantity_delta: -2 }];
  if (has(sql, "FROM product_bom_items")) return [bomRow()];
  if (has(sql, "FROM inventory_items") || has(sql, "JOIN inventory_items")) return [inventoryRow()];
  if (has(sql, "FROM products")) return [productRow()];
  if (has(sql, "FROM master_items")) return [masterItemRow()];
  if (has(sql, "FROM file_metadata")) return [fileRow()];
  if (has(sql, "FROM procurement_order_lines")) return [procurementLineRow()];
  if (has(sql, "FROM procurement_orders")) return [procurementOrderRow()];
  if (has(sql, "FROM production_run_lines")) return [productionLineRow()];
  if (has(sql, "FROM production_run_materials")) return [productionMaterialRow()];
  if (has(sql, "FROM production_logs")) return [productionLogRow()];
  if (has(sql, "FROM production_runs")) return [productionRunRow()];
  if (has(sql, "FROM pick_pack_order_lines")) return [pickPackLineRow()];
  if (has(sql, "FROM pick_pack_shipping_details")) return [pickPackShippingDetailsRow()];
  if (has(sql, "FROM pick_pack_orders")) return [pickPackOrderRow()];
  if (has(sql, "FROM shipping_details")) return [shippingDetailsRow()];
  if (has(sql, "FROM shipping_logs")) return [shippingLogRow()];
  if (has(sql, "FROM rd_request_notes")) return [researchNoteRow()];
  if (has(sql, "FROM rd_request_comments")) return [researchCommentRow()];
  if (has(sql, "FROM rd_requests")) return [researchRequestRow()];
  if (has(sql, "FROM suppliers") || has(sql, "FROM content_library_entries") || has(sql, "FROM team_chat_entries")) return [dataRecordRow()];
  if (has(sql, "FROM purchase_order_lines")) return [purchaseOrderLineRow()];
  if (has(sql, "FROM purchase_orders")) return [purchaseOrderRow()];
  return [];
}

function userRow() {
  return { id: "user-1", email: "admin@example.com", display_name: "Admin User", user_type: "employee", password_hash: "hash", is_active: 1 };
}

function customerRow() {
  return { id: "customer-1", name: "Bnutty", contact_name: "Bonnie", contact_email: "ops@example.com", phone: "555-0100", status: "active" };
}

function productRow() {
  return {
    id: "product-1",
    customer_id: "customer-1",
    sku: "SKU-1",
    name: "Nut Butter",
    description: "Chunky",
    status: "active",
    production_room: "Room A",
    size: 12,
    size_unit: "oz",
    case_quantity: 24,
    case_sticker: "Case",
    unit_price_cents: 999,
    kosher: 1,
    allergen: 1,
    allergen_details: "Peanuts",
    daily_production_rate: 100,
    notes: "Stable",
  };
}

function masterItemRow() {
  return { id: "master-1", sku: "RAW-1", name: "Peanuts", item_type: "raw_material", unit_of_measure: "lb", customer_id: null, allergens_json: '["peanut"]' };
}

function bomRow() {
  return { id: "bom-1", product_id: "product-1", master_item_id: "master-1", inventory_item_id: "inv-1", quantity_per_unit: 2, percent_of_formula: 50 };
}

function fileRow() {
  return {
    id: "file-1",
    owner_type: "purchase_order",
    owner_id: "po-1",
    file_category: "coa",
    storage_provider: "r2",
    storage_key: "files/file-1.pdf",
    file_name: "coa.pdf",
    content_type: "application/pdf",
    size_bytes: 100,
    uploaded_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    status: "active",
    deleted_at: null,
    deleted_by_user_id: null,
  };
}

function inventoryRow() {
  return {
    id: "inv-1",
    master_item_id: "master-1",
    master_item_name: "Peanuts",
    item_type: "raw_material",
    category: "Ingredient",
    supplier_id: "supplier-1",
    customer_id: "customer-1",
    on_hand_quantity: 20,
    allocated_quantity: 5,
    reorder_point_quantity: 10,
    unit_of_measure: "lb",
    unit_cost_cents: 150,
    lead_time_days: 7,
    location: "A1",
    lot_number: "LOT-1",
    lots_json: '[{"lot":"LOT-1"}]',
  };
}

function reservationRow() {
  return { id: "reservation-1", inventory_item_id: "inv-1", purchase_order_line_id: "line-1", quantity: 3, status: "active" };
}

function receivingRow() {
  return {
    id: "receiving-1",
    receiving_id: "REC-1001",
    master_item_id: "master-1",
    inventory_item_id: "inv-1",
    item_name: "Peanuts",
    date: "2026-01-02",
    time: "08:00",
    packages: 2,
    quantity_per_package: 10,
    total_quantity: 20,
    unit_of_measure: "lb",
    lot_number: "LOT-1",
    allergens_json: '["peanut"]',
    received_by: "user-1",
    carrier: "Carrier",
    supplier_id: "supplier-1",
  };
}

function moveRow() {
  return {
    id: "move-1",
    move_id: "MOVE-1001",
    receiving_id: "REC-1001",
    master_item_id: "master-1",
    inventory_item_id: "inv-1",
    item_name: "Peanuts",
    lot_number: "LOT-1",
    date: "2026-01-03",
    time: "09:00",
    case_count: 2,
    quantity_per_case: 5,
    quantity_moved: 10,
    unit_of_measure: "lb",
    moved_by: "user-1",
    from_location: "Dock",
    to_location: "A1",
  };
}

function purchaseOrderRow() {
  return {
    id: "po-1",
    po_number: "PO-1",
    customer_id: "customer-1",
    status: "qa_review",
    deposit_status: "not_required",
    requested_ship_date: "2026-02-01",
    notes: "Ship soon",
    qa_released_at: null,
    qa_released_by_user_id: null,
    qa_release_type: null,
    qa_notes: null,
    qa_skipped_at: null,
    qa_skipped_by_user_id: null,
    qa_skip_reason: null,
    post_shipment_coa_file_id: null,
  };
}

function purchaseOrderLineRow() {
  return {
    id: "line-1",
    purchase_order_id: "po-1",
    customer_id: "customer-1",
    line_number: 1,
    description: "Nut Butter",
    quantity: 10,
    unit_of_measure: "case",
    product_id: "product-1",
    master_item_id: "master-1",
    supply_chain_status: "pending",
    product_is_own_brand: 1,
  };
}

function procurementOrderRow() {
  return {
    id: "proc-1",
    procurement_order_number: "PROC-1001",
    quickbooks_po_number: "QB-1",
    supplier_id: "supplier-1",
    supplier_name_snapshot: "Supplier",
    status: "ordered",
    date_ordered: "2026-01-01",
    expected_date: "2026-01-10",
    received_date: null,
    notes: "Rush",
  };
}

function procurementLineRow() {
  return {
    id: "proc-line-1",
    procurement_order_id: "proc-1",
    line_number: 1,
    master_item_id: "master-1",
    inventory_item_id: "inv-1",
    description: "Peanuts",
    quantity_ordered: 20,
    quantity_received: 5,
    unit_of_measure: "lb",
    unit_cost_cents: 150,
    suggested_quantity: 20,
    source_reason: "reorder_point",
    source_purchase_order_line_id: "line-1",
    purchase_order_line_id: "line-1",
    required_quantity: 12,
    remaining_quantity: 6,
  };
}

function productionRunRow() {
  return {
    id: "run-1",
    purchase_order_id: "po-1",
    status: "in_progress",
    scheduled_date: "2026-01-05",
    started_at: "2026-01-05T08:00:00.000Z",
    completed_at: null,
    finalized_at: null,
    finalized_by_user_id: null,
    reopened_at: null,
    reopened_by_user_id: null,
    reopen_reason: null,
    notes: "Batch",
  };
}

function productionLineRow() {
  return { id: "run-line-1", production_run_id: "run-1", purchase_order_line_id: "line-1", product_id: "product-1", quantity_planned: 10, quantity_completed: 4 };
}

function productionMaterialRow() {
  return { id: "run-material-1", production_run_id: "run-1", inventory_item_id: "inv-1", master_item_id: "master-1", quantity_required: 20, quantity_consumed: 8 };
}

function productionLogRow() {
  return { id: "log-1", production_run_id: "run-1", event_type: "note", message: "Started", created_by_user_id: "user-1", created_at: "2026-01-05T08:00:00.000Z" };
}

function shippingDetailsRow() {
  return { purchase_order_id: "po-1", bol_number: "BOL-1", carrier: "Carrier", tracking_number: "TRK-1", shipped_at: "2026-01-06T12:00:00.000Z", notes: "Left dock" };
}

function shippingLogRow() {
  return {
    id: "ship-log-1",
    shipping_log_number: "SHIP-1043",
    purchase_order_id: "po-1",
    bol_number: "BOL-1",
    carrier: "Carrier",
    tracking_number: "TRK-1",
    shipped_at: "2026-01-06T12:00:00.000Z",
    stocked_at: null,
    status: "shipped",
    notes: "Left dock",
  };
}

function pickPackOrderRow() {
  return {
    id: "pick-1",
    pick_pack_number: "PICK-1",
    customer_id: "customer-1",
    customer_po_number: "CPO-1",
    date_submitted: "2026-01-01",
    date_needed_to_ship: "2026-02-01",
    status: "open",
    po_file_id: "file-1",
    notes: "Pick",
    picked_at: null,
    picked_by_user_id: null,
    shipped_at: null,
    shipped_by_user_id: null,
    short_stock_confirmed: 0,
    short_stock_json: "[]",
    created_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
}

function pickPackLineRow() {
  return {
    id: "pick-line-1",
    pick_pack_order_id: "pick-1",
    line_number: 1,
    inventory_item_id: "inv-1",
    quantity: 5,
    picked_quantity: 0,
    short_quantity: 0,
    item_name: "Finished Good",
    sku: "FG-1",
    customer_id: "customer-1",
    on_hand_quantity: 20,
  };
}

function pickPackShippingDetailsRow() {
  return {
    id: "pick-ship-1",
    pick_pack_order_id: "pick-1",
    shipping_mode: "ship",
    carrier: "Carrier",
    tracking_number: "TRK-1",
    bol_number: "BOL-1",
    pallet_count: 2,
    weight: "100 lb",
    dimensions_json: '{"length":10}',
    notes: "Left",
    updated_at: "2026-01-06T12:00:00.000Z",
  };
}

function researchRequestRow() {
  return {
    id: "rd-1",
    customer_id: "customer-1",
    title: "New butter",
    description: "Crunchy",
    status: "new",
    priority: "medium",
    target_date: "2026-03-01",
    created_by_user_id: "user-1",
    assigned_to_user_id: "user-2",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
}

function researchNoteRow() {
  return { id: "note-1", request_id: "rd-1", note: "Internal", created_by_user_id: "user-1", created_at: "2026-01-01T01:00:00.000Z" };
}

function researchCommentRow() {
  return { id: "comment-1", request_id: "rd-1", comment: "Customer comment", created_by_user_id: "user-1", created_at: "2026-01-01T02:00:00.000Z" };
}

function dataRecordRow() {
  return {
    id: "record-1",
    module: "suppliers",
    kind: "supplier",
    title: "Supplier",
    status: "active",
    payload_json: '{"rating":"A"}',
    file_ids_json: '["file-1"]',
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
}

describe("D1 store coverage adapters", () => {
  test("exercises auth and customer D1 adapters", async () => {
    const auth = new D1AuthStore(fakeDb());
    await expect(auth.getUserByEmail("ADMIN@example.com")).resolves.toMatchObject({ id: "user-1", isActive: true });
    await expect(auth.getUserById("user-1")).resolves.toMatchObject({ displayName: "Admin User" });
    await auth.createUser({ id: "user-2", email: "user@example.com", displayName: "User", userType: "employee", passwordHash: null, isActive: false });
    await expect(auth.listUsers()).resolves.toHaveLength(1);
    await expect(auth.updateUser("user-1", { displayName: "Updated", isActive: true })).resolves.toMatchObject({ id: "user-1" });
    await expect(auth.countUsers()).resolves.toBe(2);
    await expect(auth.listUserRoles("user-1")).resolves.toEqual(["Admin"]);
    await auth.setUserRoles("user-1", ["Admin", "Customer"]);
    await expect(auth.listCustomerAccess("user-1")).resolves.toEqual([{ customerId: "customer-1", accessLevel: "manager" }]);
    await auth.setCustomerAccess("user-1", [{ customerId: "customer-1", accessLevel: "viewer" }]);
    await auth.createSession({ id: "session-1", userId: "user-1", tokenHash: "token-hash", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null });
    await expect(auth.getSessionByTokenHash("token-hash")).resolves.toMatchObject({ id: "session-1" });
    await auth.revokeSession("session-1");
    expect(roleIdFor("Supply Chain & Procurement")).toBe("role_supply_chain_procurement");

    const customers = new D1CustomerStore(fakeDb());
    await expect(customers.listCustomers()).resolves.toHaveLength(1);
    await expect(customers.getCustomer("customer-1")).resolves.toMatchObject({ contactName: "Bonnie" });
    await expect(customers.updateCustomer("customer-1", { phone: "555-9999" })).resolves.toMatchObject({ phone: "555-9999" });
  });

  test("exercises catalog, files, and data-record D1 adapters", async () => {
    const catalog = new D1CatalogStore(fakeDb());
    const productInput = {
      id: "product-1",
      customerId: "customer-1",
      sku: "SKU-1",
      name: "Nut Butter",
      description: "Chunky",
      status: "active",
      productionRoom: "Room A",
      size: 12,
      sizeUnit: "oz",
      caseQuantity: 24,
      caseSticker: "Case",
      unitPriceCents: 999,
      kosher: true,
      allergen: true,
      allergenDetails: "Peanuts",
      dailyProductionRate: 100,
      notes: "Stable",
      bomItems: [{ masterItemId: "master-1", quantityPerUnit: 2, percentOfFormula: 50 }],
    } as any;
    await expect(catalog.listProducts()).resolves.toMatchObject([{ id: "product-1", bomItems: [{ id: "bom-1" }] }]);
    await expect(catalog.getProduct("product-1")).resolves.toMatchObject({ sku: "SKU-1" });
    await expect(catalog.createProduct(productInput)).resolves.toMatchObject({ id: "product-1" });
    await expect(catalog.updateProduct("product-1", productInput)).resolves.toMatchObject({ id: "product-1" });
    await expect(catalog.replaceProductBomItems("product-1", productInput.bomItems)).resolves.toMatchObject({ id: "product-1" });
    await expect(catalog.listMasterItems()).resolves.toMatchObject([{ id: "master-1", allergens: ["peanut"] }]);
    await expect(catalog.getMasterItem("master-1")).resolves.toMatchObject({ itemType: "raw_material" });
    await expect(catalog.createMasterItem({ id: "master-1", sku: "RAW-1", name: "Peanuts", itemType: "raw_material", unitOfMeasure: "lb", customerId: null, allergens: ["peanut"] })).resolves.toMatchObject({ id: "master-1" });
    await expect(catalog.updateMasterItem("master-1", { id: "master-1", sku: "RAW-1", name: "Peanuts", itemType: "raw_material", unitOfMeasure: "lb", customerId: null, allergens: ["peanut"] } as any)).resolves.toMatchObject({ id: "master-1" });

    const files = new D1FileStore(fakeDb());
    await files.createFileMetadata({
      id: "file-1",
      ownerType: "purchase_order",
      ownerId: "po-1",
      fileCategory: "coa",
      storageProvider: "r2",
      storageKey: "files/file-1.pdf",
      fileName: "coa.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      uploadedByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      deletedAt: null,
      deletedByUserId: null,
    });
    await expect(files.listFilesByOwner("purchase_order", "po-1")).resolves.toHaveLength(1);
    await expect(files.getFileMetadata("file-1")).resolves.toMatchObject({ storageProvider: "r2" });
    await expect(files.softDeleteFile("file-1", { deletedByUserId: "user-1" })).resolves.toMatchObject({ id: "file-1" });
    await files.createAuditEvent({ actorUserId: "user-1", entityType: "file", entityId: "file-1", action: "deleted", metadata: { reason: "test" } });
    await expect(files.resolveOwnerCustomerId("customer", "customer-1")).resolves.toBe("customer-1");
    await expect(files.resolveOwnerCustomerId("purchase_order", "po-1")).resolves.toBe("customer-1");
    await expect(files.resolveOwnerCustomerId("purchase_order_line", "line-1")).resolves.toBe("customer-1");
    await expect(files.resolveOwnerCustomerId("rd_request", "rd-1")).resolves.toBe("customer-1");
    await expect(files.resolveOwnerCustomerId("product", "product-1")).resolves.toBe("customer-1");
    await expect(files.resolveOwnerCustomerId("inventory_item", "inv-1")).resolves.toBe("customer-1");

    const records = new D1DataRecordStore(fakeDb(), "suppliers", "suppliers");
    await expect(records.listRecords({ kind: "supplier", status: "active" })).resolves.toMatchObject([{ id: "record-1" }]);
    await expect(records.listRecords()).resolves.toMatchObject([{ payload: { rating: "A" } }]);
    await expect(records.getRecord("record-1")).resolves.toMatchObject({ fileIds: ["file-1"] });
    await expect(records.createRecord({ id: "record-1", module: "suppliers", kind: "supplier", title: "Supplier", payload: { rating: "A" }, fileIds: ["file-1"], actorUserId: "user-1" })).resolves.toMatchObject({ id: "record-1" });
    await expect(records.updateRecord({ recordId: "record-1", title: "Updated", actorUserId: "user-1" })).resolves.toMatchObject({ id: "record-1" });
    await expect(records.archiveRecord({ recordId: "record-1", actorUserId: "user-1" })).resolves.toMatchObject({ id: "record-1" });
    await records.createAuditEvent({ actorUserId: "user-1", entityType: "supplier", entityId: "record-1", action: "archived", metadata: {} });
    expect(() => new D1DataRecordStore(fakeDb(), "unsafe_table", "bad")).toThrow("Unsupported data record table");
  });

  test("exercises inventory, purchase-order, and procurement D1 adapters", async () => {
    const inventory = new D1InventoryStore(fakeDb());
    await expect(inventory.getInventoryItem("inv-1")).resolves.toMatchObject({ onHandQuantity: 20 });
    await expect(inventory.allocateInventoryItem("inv-1", 2)).resolves.toBe(true);
    await inventory.createReservation({ id: "reservation-1", inventoryItemId: "inv-1", purchaseOrderLineId: "line-1", quantity: 2, actorUserId: "user-1" });
    await inventory.createMovement({ inventoryItemId: "inv-1", movementType: "reserved", quantityDelta: -2, referenceType: "inventory_reservation", referenceId: "line-1", actorUserId: "user-1" });
    await inventory.createAuditEvent({ actorUserId: "user-1", entityType: "inventory_reservation", entityId: "inv-1", action: "inventory.reserved", metadata: {} });
    await expect(inventory.getActiveReservation("reservation-1")).resolves.toMatchObject({ status: "active" });
    await inventory.releaseReservationRecord("reservation-1");
    await inventory.releaseInventoryItemAllocation("inv-1", 2);
    await expect(inventory.listInventoryItems()).resolves.toMatchObject([{ netAvailableQuantity: 15 }]);
    await expect(inventory.createInventoryItem({ id: "inv-1", masterItemId: "master-1", category: "Ingredient", supplierId: "supplier-1", customerId: "customer-1", onHandQuantity: 20, allocatedQuantity: 5, reorderPointQuantity: 10, unitOfMeasure: "lb", unitCostCents: 150, leadTimeDays: 7, location: "A1", lotNumber: "LOT-1", lotsJson: "[]" })).resolves.toMatchObject({ id: "inv-1" });
    await expect(inventory.updateInventoryItem("inv-1", { id: "inv-1", masterItemId: "master-1", category: "Ingredient", supplierId: "supplier-1", customerId: "customer-1", onHandQuantity: 20, allocatedQuantity: 5, reorderPointQuantity: 10, unitOfMeasure: "lb", unitCostCents: 150, leadTimeDays: 7, location: "A1", lotNumber: "LOT-1", lotsJson: "[]" } as any)).resolves.toMatchObject({ id: "inv-1" });
    await expect(inventory.masterItemExists("master-1")).resolves.toBe(true);
    await expect(inventory.listReceivingEntries()).resolves.toMatchObject([{ allergens: ["peanut"] }]);
    await expect(inventory.nextReceivingSequence()).resolves.toBe(1043);
    await expect(inventory.createReceivingEntry({ id: "receiving-1", receivingId: "REC-1001", masterItemId: "master-1", inventoryItemId: "inv-1", itemName: "Peanuts", date: "2026-01-02", time: "08:00", packages: 2, quantityPerPackage: 10, totalQuantity: 20, unitOfMeasure: "lb", lotNumber: "LOT-1", allergens: ["peanut"], receivedBy: "user-1", carrier: "Carrier", supplierId: "supplier-1" })).resolves.toMatchObject({ id: "receiving-1" });
    await expect(inventory.getReceivingEntryByBusinessId("REC-1001")).resolves.toMatchObject({ receivingId: "REC-1001" });
    await expect(inventory.listMoveEntries()).resolves.toMatchObject([{ moveId: "MOVE-1001" }]);
    await expect(inventory.nextMoveSequence()).resolves.toBe(1043);
    await expect(inventory.createMoveEntry({ id: "move-1", moveId: "MOVE-1001", receivingId: "REC-1001", masterItemId: "master-1", inventoryItemId: "inv-1", itemName: "Peanuts", lotNumber: "LOT-1", date: "2026-01-03", time: "09:00", caseCount: 2, quantityPerCase: 5, quantityMoved: 10, unitOfMeasure: "lb", movedBy: "user-1", fromLocation: "Dock", toLocation: "A1" })).resolves.toMatchObject({ id: "move-1" });

    const purchaseOrders = new D1PurchaseOrderStore(fakeDb());
    await purchaseOrders.createPurchaseOrder({ id: "po-1", poNumber: "PO-1", customerId: "customer-1", requestedShipDate: "2026-02-01", notes: "Ship", createdByUserId: "user-1" });
    await purchaseOrders.createPurchaseOrderLine({ id: "line-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Nut Butter", quantity: 10, unitOfMeasure: "case", productId: "product-1", masterItemId: "master-1" });
    await expect(purchaseOrders.listPurchaseOrders()).resolves.toMatchObject([{ lines: [{ id: "line-1" }] }]);
    await expect(purchaseOrders.getPurchaseOrder("po-1")).resolves.toMatchObject({ id: "po-1" });
    await expect(purchaseOrders.updatePurchaseOrderSafeFields("po-1", { notes: "Updated" })).resolves.toMatchObject({ id: "po-1" });
    await purchaseOrders.updatePurchaseOrderStatus("po-1", "submitted");
    await purchaseOrders.updatePurchaseOrderDepositStatus("po-1", "received");
    await purchaseOrders.updateLineSupplyChainStatus("line-1", "available");
    await purchaseOrders.createStatusEvent({ purchaseOrderId: "po-1", fromStatus: "draft", toStatus: "submitted", eventType: "submit", actorUserId: "user-1", note: "Submitted" });
    await purchaseOrders.createAuditEvent({ actorUserId: "user-1", entityType: "purchase_order", entityId: "po-1", action: "updated", metadata: {} });
    await expect(purchaseOrders.findInventoryItemByMasterItemId("master-1")).resolves.toEqual({ id: "inv-1" });
    await expect(purchaseOrders.listProductBomItems("product-1")).resolves.toMatchObject([{ masterItemId: "master-1" }]);

    const procurement = new D1ProcurementStore(fakeDb());
    await expect(procurement.listNeedToOrderRows()).resolves.toBeInstanceOf(Array);
    await expect(procurement.nextOrderSequence()).resolves.toBe(1043);
    await expect(procurement.nextReceiptSequence()).resolves.toBe(1043);
    await procurement.createOrder({ id: "proc-1", procurementOrderNumber: "PROC-1001", quickBooksPoNumber: "QB-1", supplierId: "supplier-1", supplierNameSnapshot: "Supplier", status: "draft", dateOrdered: null, expectedDate: "2026-01-10", receivedDate: null, notes: "Rush", createdByUserId: "user-1", submittedByUserId: undefined });
    await procurement.createOrderLine({ id: "proc-line-1", procurementOrderId: "proc-1", lineNumber: 1, masterItemId: "master-1", inventoryItemId: "inv-1", description: "Peanuts", quantityOrdered: 20, quantityReceived: 0, unitOfMeasure: "lb", unitCostCents: 150, suggestedQuantity: 20, sourceReason: "net_below_reorder", sourcePurchaseOrderLineId: "line-1" });
    await expect(procurement.listOrders()).resolves.toMatchObject([{ id: "proc-1", lines: [{ id: "proc-line-1" }] }]);
    await expect(procurement.getOrder("proc-1")).resolves.toMatchObject({ id: "proc-1" });
    await procurement.updateOrder({ id: "proc-1", status: "ordered", quickBooksPoNumber: "QB-2", submittedByUserId: "user-1" });
    await procurement.updateLineReceivedQuantity({ lineId: "proc-line-1", quantityReceived: 5 });
    await procurement.createReceipt({ id: "receipt-1", receiptNumber: "RECPT-1", procurementOrderId: "proc-1", receiptDate: "2026-01-04", receivedByUserId: "user-1", isFinal: false });
    await procurement.createReceiptLine({ id: "receipt-line-1", procurementReceiptId: "receipt-1", procurementOrderLineId: "proc-line-1", inventoryItemId: "inv-1", receivedQuantity: 5, lotNumber: "LOT-1", location: "A1" });
    await procurement.increaseInventory({ inventoryItemId: "inv-1", quantity: 5, referenceId: "receipt-line-1", actorUserId: "user-1", lotNumber: "LOT-1", location: "A1" });
    await procurement.createAuditEvent({ actorUserId: "user-1", entityType: "procurement_order", entityId: "proc-1", action: "received", metadata: {} });
  });

  test("exercises production, pick-pack, quality, shipping, and research D1 adapters", async () => {
    const production = new D1ProductionStore(fakeDb());
    await expect(production.getPurchaseOrder("po-1")).resolves.toMatchObject({ id: "po-1" });
    await expect(production.getProductionRunByPurchaseOrderId("po-1")).resolves.toMatchObject({ id: "run-1" });
    await expect(production.getProductionRun("run-1")).resolves.toMatchObject({ id: "run-1" });
    await production.upsertProductionRun({ id: "run-1", purchaseOrderId: "po-1", productionDate: "2026-01-05", productionEndDate: "2026-01-05", productionRoom: "Main", status: "scheduled", correctionCount: 0, notes: "Batch" });
    await production.updatePurchaseOrderStatus("po-1", "production");
    await expect(production.listProductBomItems("product-1")).resolves.toMatchObject([{ inventoryItemId: "inv-1" }]);
    await expect(production.findFinishedGoodInventoryItem("product-1")).resolves.toEqual({ id: "inv-1" });
    await production.replaceRunLines("run-1", [productionLineRow() as any]);
    await production.replaceRunMaterials("run-1", [productionMaterialRow() as any]);
    await expect(production.listInventoryEffects("run-1")).resolves.toEqual([{ inventoryItemId: "inv-1", quantityDelta: -2 }]);
    await production.clearInventoryEffects("run-1");
    await production.adjustInventory({ inventoryItemId: "inv-1", quantityDelta: -2, referenceType: "production_run", referenceId: "run-1", actorUserId: "user-1" });
    await production.createInventoryEffect({ id: "effect-1", productionRunId: "run-1", inventoryItemId: "inv-1", quantityDelta: -2, effectType: "consume_material" });
    await production.upsertInventoryLot({ productId: "product-1", inventoryItemId: "inv-1", lotNumber: "LOT-1", purchaseOrderId: "po-1", productionRunId: "run-1", productionDate: "2026-01-05", quantityProduced: 10 });
    await expect(production.finalizeRun({ id: "run-1", status: "finalized", notes: "Done", actorUserId: "user-1" })).resolves.toMatchObject({ id: "run-1" });
    await expect(production.reopenRun({ id: "run-1", reason: "Fix", actorUserId: "user-1" })).resolves.toMatchObject({ id: "run-1" });
    await expect(production.listProductionRuns()).resolves.toMatchObject([{ id: "run-1" }]);
    await production.upsertProductionLog({ logId: "PRD-1043", purchaseOrderId: "po-1", productionRunId: "run-1", productionDate: "2026-01-05", productionEndDate: "2026-01-05", productionRoom: "Main", completedAt: "2026-01-05T08:00:00.000Z", overallWastePercent: 0, lineSnapshot: [], materialSnapshot: [], notes: "Started" });
    await expect(production.listProductionLogs()).resolves.toMatchObject([{ id: "log-1" }]);
    await production.createStatusEvent({ purchaseOrderId: "po-1", fromStatus: "approved_for_production", toStatus: "production", eventType: "start", actorUserId: "user-1", note: "Start" });
    await production.createAuditEvent({ actorUserId: "user-1", entityType: "production_run", entityId: "run-1", action: "finalized", metadata: {} });

    const pickPack = new D1PickPackStore(fakeDb());
    await expect(pickPack.listOrders()).resolves.toMatchObject([{ id: "pick-1" }]);
    await expect(pickPack.getOrder("pick-1")).resolves.toMatchObject({ id: "pick-1" });
    await expect(pickPack.customerExists("customer-1")).resolves.toBe(true);
    await expect(pickPack.getFinishedGoodInventoryItem("inv-1")).resolves.toMatchObject({ id: "inv-1" });
    await expect(pickPack.nextPickPackSequence()).resolves.toBe(1043);
    const pickPackLine = { id: "pick-line-1", pickPackOrderId: "pick-1", lineNumber: 1, inventoryItemId: "inv-1", itemName: "Finished Good", sku: "FG-1", customerId: "customer-1", quantity: 5, pickedQuantity: 0, shortQuantity: 0, onHandQuantity: 20 };
    await pickPack.createOrder({ id: "pick-1", pickPackNumber: "PICK-1", customerId: "customer-1", customerPoNumber: "CPO-1", dateSubmitted: "2026-01-01", dateNeededToShip: "2026-02-01", poFileId: "file-1", notes: "Pick", lines: [pickPackLine], actorUserId: "user-1" });
    await pickPack.replaceOrderLines("pick-1", [{ id: "pick-line-1", pickPackOrderId: "pick-1", lineNumber: 1, inventoryItemId: "inv-1", description: "Finished Good", quantityRequested: 5, quantityPicked: 0, unitOfMeasure: "case" }] as any);
    await pickPack.updateOrder({ orderId: "pick-1", customerId: "customer-1", customerPoNumber: "CPO-2", dateSubmitted: "2026-01-01", dateNeededToShip: "2026-02-01", poFileId: "file-1", notes: "Picking", actorUserId: "user-1" });
    await pickPack.completePickPackPick({ orderId: "pick-1", pickedAt: "2026-01-06T10:00:00.000Z", pickedByUserId: "user-1", shortStockConfirmed: false, shortStockJson: "[]", shortStock: [], lines: [pickPackLine], inventoryAdjustments: [{ inventoryItemId: "inv-1", quantityDelta: -5, referenceType: "pick_pack_order", referenceId: "pick-1" }], actorUserId: "user-1" });
    await pickPack.markOrderShipped({ orderId: "pick-1", shippedAt: "2026-01-06T12:00:00.000Z", shippedByUserId: "user-1", actorUserId: "user-1" });
    await pickPack.upsertShippingDetails({ orderId: "pick-1", shippingMode: "pallet", bolNumber: "BOL-1", carrier: "Carrier", trackingNumber: "TRK-1", palletCount: 2, weight: 100, dimensionsJson: "{\"length\":10}", notes: "Left", actorUserId: "user-1" });
    await pickPack.createStatusEvent({ orderId: "pick-1", fromStatus: "open", toStatus: "picked", eventType: "start", actorUserId: "user-1", note: "Start" });
    await pickPack.createAuditEvent({ actorUserId: "user-1", entityType: "pick_pack_order", entityId: "pick-1", action: "picked", metadata: {} });

    const quality = new D1QualityStore(fakeDb());
    await expect(quality.listQualityQueue()).resolves.toMatchObject([{ id: "po-1" }]);
    await expect(quality.getPurchaseOrder("po-1")).resolves.toMatchObject({ id: "po-1" });
    await expect(quality.getActiveCoaFile("po-1", "file-1")).resolves.toMatchObject({ id: "file-1" });
    await expect(quality.releaseInventoryLots("po-1")).resolves.toBe(1);
    await expect(quality.updatePurchaseOrderQualityRelease({ purchaseOrderId: "po-1", routeStatus: "shipping", releaseType: "external_co_pack", releasedAt: "2026-01-06T12:00:00.000Z", releasedByUserId: "user-1", notes: "OK" })).resolves.toMatchObject({ id: "po-1" });
    await expect(quality.updatePurchaseOrderQualitySkip({ purchaseOrderId: "po-1", routeStatus: "shipping", skippedAt: "2026-01-06T12:00:00.000Z", skippedByUserId: "user-1", skipReason: "Not required", notes: "Skip" })).resolves.toMatchObject({ id: "po-1" });
    await expect(quality.attachPostShipmentCoaFile({ purchaseOrderId: "po-1", fileId: "file-1" })).resolves.toMatchObject({ id: "po-1" });
    await quality.createStatusEvent({ purchaseOrderId: "po-1", fromStatus: "qa_review", toStatus: "shipping", eventType: "release", actorUserId: "user-1", note: "Released" });
    await quality.createAuditEvent({ actorUserId: "user-1", entityType: "purchase_order", entityId: "po-1", action: "qa_release", metadata: {} });

    const shipping = new D1ShippingStore(fakeDb());
    await expect(shipping.listShippingQueue()).resolves.toMatchObject([{ id: "po-1" }]);
    await expect(shipping.listShippingLogs()).resolves.toMatchObject([{ id: "ship-log-1" }]);
    await expect(shipping.getPurchaseOrder("po-1")).resolves.toMatchObject({ id: "po-1" });
    await expect(shipping.getActiveShipmentDocument("po-1", "file-1")).resolves.toMatchObject({ id: "file-1" });
    await expect(shipping.findActiveShipmentDocument("po-1")).resolves.toMatchObject({ id: "file-1" });
    await shipping.upsertShippingDetails({ purchaseOrderId: "po-1", bolNumber: "BOL-1", carrier: "Carrier", proNumber: "PRO-1", notes: "Left" });
    await shipping.markPurchaseOrderShipped({ purchaseOrderId: "po-1", shippedAt: "2026-01-06T12:00:00.000Z", shippedByUserId: "user-1", shipmentDocumentFileId: "file-1", notes: "Done" });
    await shipping.markPurchaseOrderStocked({ purchaseOrderId: "po-1", stockedAt: "2026-01-07T12:00:00.000Z", stockedByUserId: "user-1" });
    await shipping.upsertShippingLog({ purchaseOrderId: "po-1", bolNumber: "BOL-1", carrier: "Carrier", proNumber: "PRO-1", shippedAt: "2026-01-06T12:00:00.000Z", stockedAt: null, itemsSnapshotJson: "[]" });
    await shipping.createStatusEvent({ purchaseOrderId: "po-1", fromStatus: "shipping", toStatus: "completed", eventType: "stocked", actorUserId: "user-1", note: "Stocked" });
    await shipping.createAuditEvent({ actorUserId: "user-1", entityType: "shipping_log", entityId: "ship-log-1", action: "stocked", metadata: {} });

    const research = new D1ResearchStore(fakeDb());
    await expect(research.customerExists("customer-1")).resolves.toBe(true);
    await expect(research.listResearchRequests("all" as any)).resolves.toMatchObject([{ id: "rd-1" }]);
    await expect(research.listResearchRequests("open" as any)).resolves.toMatchObject([{ id: "rd-1" }]);
    await expect(research.getResearchRequest("rd-1")).resolves.toMatchObject({ id: "rd-1" });
    await research.createResearchRequest({ id: "rd-1", customerId: "customer-1", title: "New butter", description: "Crunchy", priority: "medium", targetDate: "2026-03-01", createdByUserId: "user-1", assignedToUserId: "user-2" } as any);
    await research.updateResearchRequest({ requestId: "rd-1", title: "Updated", status: "in_progress", priority: "high", targetDate: "2026-04-01", assignedToUserId: "user-2", actorUserId: "user-1" } as any);
    await research.addResearchRequestNote({ requestId: "rd-1", note: "Internal", actorUserId: "user-1" });
    await research.addResearchRequestComment({ requestId: "rd-1", comment: "Customer", actorUserId: "user-1" });
    await research.updateResearchRequestStatus({ requestId: "rd-1", fromStatus: "new", toStatus: "in_progress", actorUserId: "user-1", note: "Start" } as any);
    await research.createAuditEvent({ actorUserId: "user-1", entityType: "rd_request", entityId: "rd-1", action: "updated", metadata: {} });
  });

  test("sends submitted purchase-order email payloads and surfaces SendGrid failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await expect(sendSubmittedPurchaseOrderEmail({ apiKey: "key", to: ["ops@example.com"], from: "erp@example.com", cc: ["sales@example.com"], subject: "PO Submitted", text: "Submitted" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://api.sendgrid.com/v3/mail/send", expect.objectContaining({ method: "POST" }));

    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
    await expect(sendSubmittedPurchaseOrderEmail({ apiKey: "key", to: ["ops@example.com"], from: "erp@example.com", cc: [], subject: "PO Submitted", text: "Submitted" })).rejects.toThrow("SendGrid request failed with 500");
    fetchMock.mockRestore();
  });

  test("exercises empty-result and fallback branches in D1 adapters", async () => {
    const auth = new D1AuthStore(emptyDb());
    await expect(auth.getUserByEmail("missing@example.com")).resolves.toBeNull();
    await expect(auth.getUserById("missing")).resolves.toBeNull();
    await expect(auth.listUsers()).resolves.toEqual([]);
    await expect(auth.updateUser("missing", { displayName: "Nope" })).resolves.toBeNull();
    await expect(auth.countUsers()).resolves.toBe(0);
    await expect(auth.listUserRoles("missing")).resolves.toEqual([]);
    await expect(auth.listCustomerAccess("missing")).resolves.toEqual([]);
    await expect(auth.getSessionByTokenHash("missing")).resolves.toBeNull();

    const customers = new D1CustomerStore(emptyDb());
    await expect(customers.listCustomers()).resolves.toEqual([]);
    await expect(customers.getCustomer("missing")).resolves.toBeNull();
    await expect(customers.updateCustomer("missing", { name: "Missing" })).resolves.toBeNull();

    const catalog = new D1CatalogStore(emptyDb());
    await expect(catalog.listProducts()).resolves.toEqual([]);
    await expect(catalog.getProduct("missing")).resolves.toBeNull();
    await expect(catalog.listMasterItems()).resolves.toEqual([]);
    await expect(catalog.getMasterItem("missing")).resolves.toBeNull();

    const catalogFallback = new D1CatalogStore(fakeDb((call) => {
      if (call.kind === "run") return { meta: { changes: 1 } };
      if (call.kind === "all" && has(call.sql, "FROM master_items")) {
        return [
          { ...masterItemRow(), item_type: "packaging", customer_id: undefined, allergens_json: "not-json" },
          { ...masterItemRow(), id: "master-2", item_type: "finished_good", allergens_json: '{"bad":true}' },
        ];
      }
      if (call.kind === "first" && has(call.sql, "FROM products")) return null;
      return defaultResolve(call);
    }));
    await expect(catalogFallback.listMasterItems()).resolves.toMatchObject([
      { itemType: "packaging", customerId: "general", allergens: [] },
      { itemType: "finished_good", allergens: [] },
    ]);
    await expect(catalogFallback.replaceProductBomItems("missing", [])).resolves.toBeNull();

    const files = new D1FileStore(emptyDb());
    await expect(files.listFilesByOwner("customer", "missing")).resolves.toEqual([]);
    await expect(files.getFileMetadata("missing")).resolves.toBeNull();
    await expect(files.softDeleteFile("missing", {})).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("purchase_order", "missing")).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("purchase_order_line", "missing")).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("rd_request", "missing")).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("product", "missing")).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("inventory_item", "missing")).resolves.toBeNull();
    await expect(files.resolveOwnerCustomerId("unknown" as any, "missing")).resolves.toBeNull();

    const inventory = new D1InventoryStore(emptyDb());
    await expect(inventory.getInventoryItem("missing")).resolves.toBeNull();
    await expect(inventory.allocateInventoryItem("missing", 1)).resolves.toBe(false);
    await expect(inventory.getActiveReservation("missing")).resolves.toBeNull();
    await expect(inventory.listInventoryItems()).resolves.toEqual([]);
    await expect(inventory.updateInventoryItem("missing", { id: "missing", masterItemId: "missing", category: "Ingredient", supplierId: null, customerId: null, onHandQuantity: 0, allocatedQuantity: undefined, reorderPointQuantity: 0, unitOfMeasure: "lb", unitCostCents: null, leadTimeDays: null, location: null, lotNumber: null, lotsJson: null } as any)).resolves.toBeNull();
    await expect(inventory.masterItemExists("missing")).resolves.toBe(false);
    await expect(inventory.listReceivingEntries()).resolves.toEqual([]);
    await expect(inventory.nextReceivingSequence()).resolves.toBe(1001);
    await expect(inventory.getReceivingEntryByBusinessId("missing")).resolves.toBeNull();
    await expect(inventory.listMoveEntries()).resolves.toEqual([]);
    await expect(inventory.nextMoveSequence()).resolves.toBe(1001);

    const inventoryFallback = new D1InventoryStore(fakeDb((call) => {
      if (call.kind === "run") return { meta: { changes: 1 } };
      if (call.kind === "all" && has(call.sql, "FROM inventory_items")) {
        return [
          { ...inventoryRow(), id: "inv-packaging", item_type: "packaging", category: undefined, customer_id: undefined, allocated_quantity: 0, reorder_point_quantity: undefined, unit_cost_cents: undefined, lead_time_days: undefined, location: undefined, lot_number: undefined, lots_json: undefined },
          { ...inventoryRow(), id: "inv-fg", item_type: "finished_good", category: undefined },
          { ...inventoryRow(), id: "inv-other", item_type: "other", category: undefined },
        ];
      }
      if (call.kind === "all" && has(call.sql, "FROM receiving_entries")) return [{ ...receivingRow(), allergens_json: "not-json" }];
      return defaultResolve(call);
    }));
    await expect(inventoryFallback.listInventoryItems()).resolves.toMatchObject([
      { category: "Packaging", customerId: "general" },
      { category: "Finished Good" },
      { category: "Ingredient" },
    ]);
    await expect(inventoryFallback.listReceivingEntries()).resolves.toMatchObject([{ allergens: [] }]);

    const purchaseOrders = new D1PurchaseOrderStore(emptyDb());
    await expect(purchaseOrders.listPurchaseOrders()).resolves.toEqual([]);
    await expect(purchaseOrders.getPurchaseOrder("missing")).resolves.toBeNull();
    await expect(purchaseOrders.updatePurchaseOrderSafeFields("missing", {})).resolves.toBeNull();
    await expect(purchaseOrders.findInventoryItemByMasterItemId("missing")).resolves.toBeNull();
    await expect(purchaseOrders.listProductBomItems("missing")).resolves.toEqual([]);

    const procurement = new D1ProcurementStore(emptyDb());
    await expect(procurement.listNeedToOrderRows()).resolves.toEqual([]);
    await expect(procurement.nextOrderSequence()).resolves.toBe(1001);
    await expect(procurement.nextReceiptSequence()).resolves.toBe(2001);
    await expect(procurement.listOrders()).resolves.toEqual([]);
    await expect(procurement.getOrder("missing")).resolves.toBeNull();

    const records = new D1DataRecordStore(fakeDb((call) => {
      if (call.kind === "run") return { meta: { changes: 1 } };
      if (call.kind === "first" || call.kind === "all") return [{ ...dataRecordRow(), payload_json: "not-json", file_ids_json: '{"bad":true}' }];
      return [];
    }), "team_chat_entries", "team-chat");
    await expect(records.listRecords()).resolves.toMatchObject([{ payload: {}, fileIds: [] }]);
    await expect(records.getRecord("record-1")).resolves.toMatchObject({ payload: {}, fileIds: [] });

    const missingRecords = new D1DataRecordStore(emptyDb(), "feedback_items", "feedback");
    await expect(missingRecords.getRecord("missing")).resolves.toBeNull();
    await expect(missingRecords.updateRecord({ recordId: "missing", title: "Nope" })).resolves.toBeNull();
    await expect(missingRecords.archiveRecord({ recordId: "missing" })).resolves.toBeNull();

    const quality = new D1QualityStore(emptyDb());
    await expect(quality.listQualityQueue()).resolves.toEqual([]);
    await expect(quality.getPurchaseOrder("missing")).resolves.toBeNull();
    await expect(quality.getActiveCoaFile("missing", "missing")).resolves.toBeNull();
    await expect(quality.releaseInventoryLots("missing")).resolves.toBe(0);
    await expect(quality.updatePurchaseOrderQualityRelease({ purchaseOrderId: "missing", routeStatus: "shipping", releaseType: "external_co_pack", releasedAt: "now" })).resolves.toBeNull();
    await expect(quality.updatePurchaseOrderQualitySkip({ purchaseOrderId: "missing", routeStatus: "shipping", skippedAt: "now", skipReason: "skip" })).resolves.toBeNull();
    await expect(quality.attachPostShipmentCoaFile({ purchaseOrderId: "missing", fileId: "missing" })).resolves.toBeNull();

    const shipping = new D1ShippingStore(emptyDb());
    await expect(shipping.listShippingQueue()).resolves.toEqual([]);
    await expect(shipping.listShippingLogs()).resolves.toEqual([]);
    await expect(shipping.getPurchaseOrder("missing")).resolves.toBeNull();
    await expect(shipping.getActiveShipmentDocument("missing", "missing")).resolves.toBeNull();
    await expect(shipping.findActiveShipmentDocument("missing")).resolves.toBeNull();

    const research = new D1ResearchStore(emptyDb());
    await expect(research.customerExists("missing")).resolves.toBe(false);
    await expect(research.listResearchRequests("all" as any)).resolves.toEqual([]);
    await expect(research.getResearchRequest("missing")).resolves.toBeNull();

    const pickPack = new D1PickPackStore(emptyDb());
    await expect(pickPack.listOrders()).resolves.toEqual([]);
    await expect(pickPack.getOrder("missing")).resolves.toBeNull();
    await expect(pickPack.customerExists("missing")).resolves.toBe(false);
    await expect(pickPack.getFinishedGoodInventoryItem("missing")).resolves.toBeNull();
    await expect(pickPack.nextPickPackSequence()).resolves.toBe(1001);

    const production = new D1ProductionStore(emptyDb());
    await expect(production.getPurchaseOrder("missing")).resolves.toBeNull();
    await expect(production.getProductionRunByPurchaseOrderId("missing")).resolves.toBeNull();
    await expect(production.getProductionRun("missing")).resolves.toBeNull();
    await expect(production.listProductBomItems("missing")).resolves.toEqual([]);
    await expect(production.findFinishedGoodInventoryItem("missing")).resolves.toBeNull();
    await expect(production.listInventoryEffects("missing")).resolves.toEqual([]);
    await expect(production.listProductionRuns()).resolves.toEqual([]);
    await expect(production.listProductionLogs()).resolves.toEqual([]);
  });
});
