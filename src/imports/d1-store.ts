import { ImportCommitConflictError, type ImportAction, type ImportModule, type ImportSnapshot, type ImportStore } from "./service";

type D1Row = Record<string, unknown>;
type ActionOf<TKind extends ImportAction["kind"]> = Extract<ImportAction, { kind: TKind }>;

export class D1ImportStore implements ImportStore {
  constructor(private readonly db: D1Database) {}

  async loadSnapshot(module: ImportModule): Promise<ImportSnapshot> {
    const snapshot = emptySnapshot();
    if (module === "customers") {
      snapshot.customers = await this.loadCustomers();
    } else if (module === "products") {
      [snapshot.products, snapshot.customers] = await Promise.all([this.loadProducts(), this.loadCustomers()]);
    } else if (module === "suppliers") {
      snapshot.suppliers = await this.loadSuppliers();
    } else {
      [snapshot.masterItems, snapshot.inventoryItems, snapshot.customers, snapshot.suppliers] = await Promise.all([
        this.loadMasterItems(), this.loadInventoryItems(), this.loadCustomers(), this.loadSuppliers(),
      ]);
    }
    return snapshot;
  }

  private async loadCustomers() {
    const rows = await this.db.prepare("SELECT id, name, contact_name, contact_email, phone, status FROM customers").all<D1Row>();
    return rows.results.map(row => ({
      id: text(row.id), name: text(row.name), status: row.status === "inactive" ? "inactive" as const : "active" as const,
      contactName: nullableText(row.contact_name), contactEmail: nullableText(row.contact_email), phone: nullableText(row.phone),
    }));
  }

  private async loadProducts() {
    const rows = await this.db.prepare(`SELECT id, customer_id, sku, name, description, status, production_room, size, size_unit,
      case_quantity, case_sticker, unit_price_cents, kosher, allergen, allergen_details, daily_production_rate, notes FROM products`).all<D1Row>();
    return rows.results.map(row => ({
      id: text(row.id), customerId: nullableText(row.customer_id), sku: text(row.sku), name: text(row.name),
      description: nullableText(row.description), status: row.status === "inactive" ? "inactive" as const : "active" as const,
      productionRoom: nullableText(row.production_room), size: nullableNumeric(row.size), sizeUnit: nullableText(row.size_unit),
      caseQuantity: nullableNumeric(row.case_quantity), caseSticker: nullableText(row.case_sticker), unitPriceCents: nullableNumeric(row.unit_price_cents),
      kosher: booleanValue(row.kosher), allergen: booleanValue(row.allergen), allergenDetails: nullableText(row.allergen_details),
      dailyProductionRate: nullableNumeric(row.daily_production_rate), notes: nullableText(row.notes),
    }));
  }

  private async loadSuppliers() {
    const rows = await this.db.prepare("SELECT id, title, status, payload_json, file_ids_json FROM suppliers").all<D1Row>();
    return rows.results.map(row => ({ id: text(row.id), title: text(row.title), status: row.status === "archived" ? "archived" as const : "active" as const, payload: jsonObject(row.payload_json), fileIds: jsonStrings(row.file_ids_json) }));
  }

  private async loadMasterItems() {
    const rows = await this.db.prepare("SELECT id, sku, name, item_type, unit_of_measure, customer_id, allergens_json, status FROM master_items").all<D1Row>();
    return rows.results.map(row => ({
      id: text(row.id), sku: text(row.sku), name: text(row.name), itemType: itemType(row.item_type),
      unitOfMeasure: text(row.unit_of_measure), customerId: nullableText(row.customer_id), allergens: jsonStrings(row.allergens_json),
      status: row.status === "archived" ? "archived" as const : "active" as const,
    }));
  }

  private async loadInventoryItems() {
    const rows = await this.db.prepare(`SELECT id, master_item_id, status, on_hand_quantity, allocated_quantity, reorder_point_quantity,
      unit_of_measure, location, category, supplier_id, customer_id, unit_cost_cents, lead_time_days, lot_number, lots_json FROM inventory_items`).all<D1Row>();
    return rows.results.map(row => ({
      id: text(row.id), masterItemId: text(row.master_item_id), status: row.status === "archived" ? "archived" as const : "active" as const,
      onHandQuantity: numeric(row.on_hand_quantity), allocatedQuantity: numeric(row.allocated_quantity),
      reorderPointQuantity: numeric(row.reorder_point_quantity), unitOfMeasure: text(row.unit_of_measure), location: nullableText(row.location),
      category: category(row.category), supplierId: nullableText(row.supplier_id), customerId: nullableText(row.customer_id),
      unitCostCents: nullableNumeric(row.unit_cost_cents), leadTimeDays: nullableNumeric(row.lead_time_days), lotNumber: nullableText(row.lot_number),
      lotsJson: nullableText(row.lots_json),
    }));
  }

  async commit(actions: ImportAction[], actorUserId: string | null): Promise<void> {
    const importBatchId = `import_batch_${crypto.randomUUID()}`;
    const statements = [
      ...this.customerStatements(actions.filter((action): action is ActionOf<"customer"> => action.kind === "customer"), actorUserId, importBatchId),
      ...this.productStatements(actions.filter((action): action is ActionOf<"product"> => action.kind === "product"), actorUserId, importBatchId),
      ...this.supplierStatements(actions.filter((action): action is ActionOf<"supplier"> => action.kind === "supplier"), actorUserId, importBatchId),
      ...this.inventoryStatements(actions.filter((action): action is ActionOf<"inventory"> => action.kind === "inventory"), actorUserId, importBatchId),
      ...this.batchAuditStatements(actions, actorUserId, importBatchId),
    ];
    if (!statements.length) return;
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (/\b(?:unique|primary key)\s+constraint failed\b/i.test(error instanceof Error ? error.message : String(error))) {
        throw new ImportCommitConflictError();
      }
      throw error;
    }
  }

  private customerStatements(actions: ActionOf<"customer">[], actorUserId: string | null, importBatchId: string) {
    const rows = actions.map(row => auditRow(row, actorUserId, importBatchId, "customers", row.name, {
      entityId: row.id, entityType: "customer", action: "customer.created",
    }));
    return [
      ...jsonStatements(this.db, rows, `INSERT INTO customers (id, name, contact_name, contact_email, phone, status)
        SELECT json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.contactName'), json_extract(value,'$.contactEmail'), json_extract(value,'$.phone'), json_extract(value,'$.status') FROM json_each(?) WHERE true`),
      ...auditStatements(this.db, rows),
    ];
  }

  private productStatements(actions: ActionOf<"product">[], actorUserId: string | null, importBatchId: string) {
    const rows = actions.map(row => auditRow(row, actorUserId, importBatchId, "products", row.sku, {
      entityId: row.id, entityType: "product", action: "product.created",
    }));
    return [
      ...jsonStatements(this.db, rows, `INSERT INTO products (id, customer_id, sku, name, description, status, production_room, size, size_unit, case_quantity, case_sticker, unit_price_cents, kosher, allergen, allergen_details, daily_production_rate, notes)
        SELECT json_extract(value,'$.id'), json_extract(value,'$.customerId'), json_extract(value,'$.sku'), json_extract(value,'$.name'), json_extract(value,'$.description'), json_extract(value,'$.status'), json_extract(value,'$.productionRoom'), json_extract(value,'$.size'), json_extract(value,'$.sizeUnit'), json_extract(value,'$.caseQuantity'), json_extract(value,'$.caseSticker'), json_extract(value,'$.unitPriceCents'), json_extract(value,'$.kosher'), json_extract(value,'$.allergen'), json_extract(value,'$.allergenDetails'), json_extract(value,'$.dailyProductionRate'), json_extract(value,'$.notes') FROM json_each(?) WHERE true`),
      ...auditStatements(this.db, rows),
    ];
  }

  private supplierStatements(actions: ActionOf<"supplier">[], actorUserId: string | null, importBatchId: string) {
    const rows = actions.map(row => auditRow(row, actorUserId, importBatchId, "suppliers", row.name, {
      entityId: row.id, entityType: "supplier", action: "supplier.created",
      title: row.name, status: "active", fileIds: row.fileIds,
    }));
    return [
      ...jsonStatements(this.db, rows, `INSERT INTO suppliers (id, title, payload_json, file_ids_json, created_by_user_id, updated_by_user_id)
        SELECT json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.payload'), json_extract(value,'$.fileIds'), json_extract(value,'$.actorUserId'), json_extract(value,'$.actorUserId') FROM json_each(?) WHERE true`),
      ...auditStatements(this.db, rows),
    ];
  }

  private inventoryStatements(actions: ActionOf<"inventory">[], actorUserId: string | null, importBatchId: string) {
    const rows = actions.map(row => ({
      ...auditRow(row, actorUserId, importBatchId, "inventory", row.sku, {
        entityId: row.inventoryItemId,
        entityType: "inventory_item",
        action: "inventory.created",
        masterItemId: row.masterItemId,
        openingQuantity: row.onHandQuantity,
      }),
      adjustmentId: `adjustment_${crypto.randomUUID()}`,
    }));
    const master = jsonStatements(this.db, rows, `INSERT INTO master_items (id, sku, name, item_type, unit_of_measure, customer_id, allergens_json)
      SELECT json_extract(value,'$.masterItemId'), json_extract(value,'$.sku'), json_extract(value,'$.name'), json_extract(value,'$.itemType'), json_extract(value,'$.unitOfMeasure'), json_extract(value,'$.customerId'), json_extract(value,'$.allergens') FROM json_each(?) WHERE true`);
    const inventory = jsonStatements(this.db, rows, `INSERT INTO inventory_items (id, master_item_id, on_hand_quantity, allocated_quantity, reorder_point_quantity, unit_of_measure, location, category, supplier_id, customer_id, unit_cost_cents, lead_time_days, lot_number, lots_json)
      SELECT json_extract(value,'$.inventoryItemId'), json_extract(value,'$.masterItemId'), json_extract(value,'$.onHandQuantity'), 0, json_extract(value,'$.reorderPointQuantity'), json_extract(value,'$.unitOfMeasure'), json_extract(value,'$.location'), json_extract(value,'$.category'), json_extract(value,'$.supplierId'), json_extract(value,'$.customerId'), json_extract(value,'$.unitCostCents'), json_extract(value,'$.leadTimeDays'), json_extract(value,'$.lotNumber'), json_extract(value,'$.lotsAfterJson') FROM json_each(?) WHERE true`);
    const openingBalance = jsonStatements(this.db, rows, `INSERT INTO inventory_adjustments (id, inventory_item_id, quantity_before, quantity_after, quantity_delta, reason, note, lots_before_json, lots_after_json, adjusted_by_user_id)
      SELECT json_extract(value,'$.adjustmentId'), json_extract(value,'$.inventoryItemId'), 0, json_extract(value,'$.onHandQuantity'), json_extract(value,'$.onHandQuantity'), 'bulk_import_opening_balance', json_extract(value,'$.auditMetadata'), '[]', json_extract(value,'$.lotsAfterJson'), json_extract(value,'$.actorUserId') FROM json_each(?) WHERE true`);
    return [...master, ...inventory, ...openingBalance, ...auditStatements(this.db, rows)];
  }

  private batchAuditStatements(actions: ImportAction[], actorUserId: string | null, importBatchId: string) {
    if (!actions.length) return [];
    const modules = [...new Set(actions.map(actionModule))];
    const row = {
      auditId: `audit_${crypto.randomUUID()}`,
      actorUserId,
      auditEntityType: "bulk_import",
      auditEntityId: importBatchId,
      auditAction: "bulk_import.committed",
      auditMetadata: JSON.stringify({
        importBatchId,
        module: modules.length === 1 ? modules[0] : "mixed",
        actorUserId,
        recordCount: actions.length,
        createdRecords: actions.map(action => ({
          entityId: action.kind === "inventory" ? action.inventoryItemId : action.id,
          entityType: action.kind === "inventory" ? "inventory_item" : action.kind,
          sourceRow: action.sourceRow,
          sourceKey: action.kind === "customer" || action.kind === "supplier" ? action.name : action.sku,
        })),
      }),
    };
    return auditStatements(this.db, [row]);
  }
}

type AuditDescriptor = {
  entityId: string;
  entityType: string;
  action: string;
  [key: string]: unknown;
};

function auditRow<T extends { sourceRow: number }>(
  row: T,
  actorUserId: string | null,
  importBatchId: string,
  module: ImportModule,
  sourceKey: string,
  descriptor: AuditDescriptor,
) {
  const { entityId, entityType, action, ...metadata } = descriptor;
  return {
    ...row,
    actorUserId,
    auditId: `audit_${crypto.randomUUID()}`,
    auditEntityId: entityId,
    auditEntityType: entityType,
    auditAction: action,
    auditMetadata: JSON.stringify({
      importBatchId,
      module,
      actorUserId,
      sourceRow: row.sourceRow,
      sourceKey,
      ...metadata,
    }),
  };
}

function auditStatements<T>(db: D1Database, rows: T[]) {
  return jsonStatements(db, rows, `INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, action, metadata_json)
    SELECT json_extract(value,'$.auditId'), json_extract(value,'$.actorUserId'), json_extract(value,'$.auditEntityType'), json_extract(value,'$.auditEntityId'), json_extract(value,'$.auditAction'), json_extract(value,'$.auditMetadata') FROM json_each(?) WHERE true`);
}

function actionModule(action: ImportAction): ImportModule {
  return action.kind === "customer" ? "customers"
    : action.kind === "product" ? "products"
    : action.kind === "supplier" ? "suppliers"
    : "inventory";
}

function jsonStatements<T>(db: D1Database, rows: T[], sql: string) {
  return jsonChunks(rows).map(chunk => db.prepare(sql).bind(JSON.stringify(chunk)));
}

function jsonChunks<T>(rows: T[]) {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 2;
  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
    if (current.length && bytes + rowBytes > 450_000) {
      chunks.push(current); current = []; bytes = 2;
    }
    current.push(row); bytes += rowBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function text(value: unknown) { return String(value ?? ""); }
function emptySnapshot(): ImportSnapshot { return { customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] }; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumeric(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function booleanValue(value: unknown) { return value === true || value === 1 || value === "1"; }
function itemType(value: unknown): "raw_material" | "packaging" | "finished_good" { return value === "packaging" || value === "finished_good" ? value : "raw_material"; }
function category(value: unknown): "Ingredient" | "Packaging" | "Finished Good" { return value === "Packaging" || value === "Finished Good" ? value : "Ingredient"; }
function jsonObject(value: unknown) { try { const parsed = JSON.parse(text(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function jsonStrings(value: unknown) { try { const parsed = JSON.parse(text(value)); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
