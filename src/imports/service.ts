export type ImportModule = "customers" | "products" | "suppliers" | "inventory";

export type ImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  description: string;
  validation?: {
    kind?: "identifier" | "decimal" | "whole" | "currency" | "enum" | "boolean";
    maxLength?: number;
    allowedValues?: string[];
    unit?: string;
  };
};

export type ImportSchema = {
  module: ImportModule;
  label: string;
  keyColumn: string;
  maxRows: number;
  maxFileBytes: number;
  columns: ImportColumn[];
};

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
  code?: "IMPORT_RECORD_EXISTS";
  recordKey?: string;
};

export type ImportPreviewRecord = {
  row: number;
  key: string;
};

type ParsedImportRow = Record<string, unknown> | null;

export type ImportPreview = {
  module: ImportModule;
  valid: boolean;
  totalRows: number;
  creates: number;
  records: ImportPreviewRecord[];
  errors: ImportRowError[];
};

export type CustomerSnapshot = {
  id: string;
  name: string;
  status: "active" | "inactive";
  contactName?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
};

export type ProductSnapshot = {
  id: string;
  sku: string;
  status: "active" | "inactive";
  customerId?: string | null;
  name?: string;
  description?: string | null;
  productionRoom?: string | null;
  size?: number | null;
  sizeUnit?: string | null;
  caseQuantity?: number | null;
  caseSticker?: string | null;
  unitPriceCents?: number | null;
  kosher?: boolean;
  allergen?: boolean;
  allergenDetails?: string | null;
  dailyProductionRate?: number | null;
  notes?: string | null;
};

export type SupplierSnapshot = {
  id: string;
  title: string;
  status: "active" | "archived";
  payload: Record<string, unknown>;
  fileIds: string[];
};

export type MasterItemSnapshot = {
  id: string;
  sku: string;
  status: "active" | "archived";
  name?: string;
  itemType?: "raw_material" | "packaging" | "finished_good";
  unitOfMeasure?: string;
  customerId?: string | null;
  allergens?: string[];
};

export type InventoryItemSnapshot = {
  id: string;
  masterItemId: string;
  status: "active" | "archived";
  onHandQuantity: number;
  allocatedQuantity: number;
  lotsJson: string | null;
  reorderPointQuantity?: number;
  unitOfMeasure?: string;
  location?: string | null;
  category?: "Ingredient" | "Packaging" | "Finished Good";
  supplierId?: string | null;
  customerId?: string | null;
  unitCostCents?: number | null;
  leadTimeDays?: number | null;
  lotNumber?: string | null;
};

export type ImportSnapshot = {
  customers: CustomerSnapshot[];
  products: ProductSnapshot[];
  suppliers: SupplierSnapshot[];
  masterItems: MasterItemSnapshot[];
  inventoryItems: InventoryItemSnapshot[];
};

type CustomerAction = {
  kind: "customer";
  sourceRow: number;
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  status: "active" | "inactive";
};

type ProductAction = {
  kind: "product";
  sourceRow: number;
  id: string;
  customerId: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  productionRoom: string | null;
  size: number | null;
  sizeUnit: string | null;
  caseQuantity: number | null;
  caseSticker: string | null;
  unitPriceCents: number | null;
  kosher: boolean;
  allergen: boolean;
  allergenDetails: string | null;
  dailyProductionRate: number | null;
  notes: string | null;
};

type SupplierAction = {
  kind: "supplier";
  sourceRow: number;
  id: string;
  name: string;
  payload: Record<string, unknown>;
  fileIds: string[];
};

type InventoryAction = {
  kind: "inventory";
  sourceRow: number;
  masterItemId: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  itemType: "raw_material" | "packaging" | "finished_good";
  category: "Ingredient" | "Packaging" | "Finished Good";
  unitOfMeasure: string;
  allergens: string[];
  customerId: string;
  supplierId: string | null;
  onHandQuantity: number;
  reorderPointQuantity: number;
  unitCostCents: number | null;
  leadTimeDays: number | null;
  location: string | null;
  lotNumber: string | null;
  lotsAfterJson: string;
};

export type ImportAction = CustomerAction | ProductAction | SupplierAction | InventoryAction;

export interface ImportStore {
  loadSnapshot(module: ImportModule): Promise<ImportSnapshot>;
  commit(actions: ImportAction[], actorUserId: string | null): Promise<void>;
}

export class ImportCommitConflictError extends Error {
  constructor() {
    super("A record was added after preview. Preview the file again before importing.");
    this.name = "ImportCommitConflictError";
  }
}

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_CELL_CHARACTERS = 10_000;
export const MAX_IMPORT_IDENTIFIER_CHARACTERS = 255;
// Keep imported real-number values within a range where six decimal places
// remain meaningful in the JavaScript/D1 number path. Counts additionally
// require a safe integer so they can never be rounded before persistence.
export const MAX_IMPORT_DECIMAL_VALUE = 1_000_000_000;
export const MAX_IMPORT_DECIMAL_PLACES = 6;

const PRODUCT_SIZE_UNITS = ["oz", "lb", "ct", "ml", "g"] as const;
const INVENTORY_UNITS = ["LBS", "Each"] as const;

const schemas: Record<ImportModule, ImportSchema> = {
  customers: schema("customers", "Customers", "name", [
    column("name", "Name", true, "Enter a unique customer name. Existing normalized names block the whole file; edit the customer in the portal or remove the row (255 characters maximum).", identifierValidation()),
    column("contact_name", "Contact Name", false, "Enter the primary contact's name."),
    column("contact_email", "Contact Email", false, "Enter the primary contact's email address."),
    column("phone", "Phone", false, "Enter the primary contact's phone number."),
    column("status", "Status", false, "Enter active or inactive. Leave blank to use active.", enumValidation(["active", "inactive"])),
  ]),
  products: schema("products", "Products", "sku", [
    column("sku", "SKU", true, "Enter a unique product SKU. Existing normalized SKUs block the whole file; edit the product in the portal or remove the row (255 characters maximum).", identifierValidation()),
    column("name", "Name", true, "Enter the product name shown in the portal."),
    column("customer_name", "Customer Name", false, "Leave blank or enter General if this product is not assigned to a specific customer. Otherwise, enter the exact name of an existing active customer (255 characters maximum).", identifierValidation()),
    column("status", "Status", false, "Enter active or inactive. Leave blank to use active.", enumValidation(["active", "inactive"])),
    column("production_room", "Production Room", false, "Enter the production room name or label."),
    column("size", "Size", false, "Enter a non-negative package size as a number only. Enter its unit in size_unit.", { kind: "decimal", unit: "size_unit" }),
    column("size_unit", "Size Unit", false, "If size is entered, choose oz, lb, ct, ml, or g.", enumValidation(PRODUCT_SIZE_UNITS)),
    column("case_quantity", "Case Quantity", false, "Enter the non-negative whole number of items in each case.", { kind: "whole", unit: "items per case" }),
    column("case_sticker", "Case Sticker", false, "Enter the text printed on the case sticker."),
    column("unit_price", "Unit Price", false, "Enter the price per unit without a currency symbol, using no more than two decimal places.", { kind: "currency", unit: "dollars per unit" }),
    column("kosher", "Kosher", false, "Enter Yes or No. True/False and 1/0 are also accepted.", { kind: "boolean", allowedValues: ["Yes", "No"] }),
    column("allergen", "Allergen", false, "Enter Yes or No. True/False and 1/0 are also accepted.", { kind: "boolean", allowedValues: ["Yes", "No"] }),
    column("allergen_details", "Allergen Details", false, "Enter any allergen details for this product."),
    column("daily_production_rate", "Daily Production Rate", false, "Enter the non-negative whole number of finished units produced per day.", { kind: "whole", unit: "finished units per day" }),
    column("notes", "Notes", false, "Enter any product notes. Formula and BOM lines are not imported."),
  ]),
  suppliers: schema("suppliers", "Suppliers", "name", [
    column("name", "Name", true, "Enter a unique supplier name. Existing normalized names block the whole file; edit the supplier in the portal or remove the row (255 characters maximum).", identifierValidation()),
    column("contact_name", "Contact Name", false, "Enter the primary contact's name."),
    column("email", "Email", false, "Enter the primary contact's email address."),
    column("phone", "Phone", false, "Enter the primary contact's phone number."),
    column("website", "Website", false, "Enter the supplier's website address."),
    column("moq", "MOQ", false, "Enter a non-negative minimum order quantity as a number only. The portal does not store a separate MOQ unit.", { kind: "decimal" }),
    column("notes", "Notes", false, "Enter any supplier notes. Documents and product lines are not imported."),
  ]),
  inventory: schema("inventory", "Inventory", "sku", [
    column("sku", "SKU", true, "Enter the Master List SKU for this item. Existing normalized SKUs block the whole file; edit Inventory in the portal or remove the row (255 characters maximum).", identifierValidation()),
    column("name", "Name", true, "Enter the item name used in both the Master List and Inventory."),
    column("category", "Category", true, "Choose Ingredient, Packaging, or Finished Good.", enumValidation(["Ingredient", "Packaging", "Finished Good"])),
    column("unit_of_measure", "Unit Of Measure", true, "Choose LBS or Each. All quantities in this row use this unit.", enumValidation(INVENTORY_UNITS)),
    column("allergens", "Allergens", false, "Enter allergen names separated by semicolons."),
    column("customer_name", "Customer Name", false, "Leave blank or enter General if this item is not assigned to a specific customer. Otherwise, enter the exact name of an existing active customer (255 characters maximum).", identifierValidation()),
    column("supplier_name", "Supplier Name", false, "Leave blank if no supplier is assigned. Otherwise, enter the exact name of an existing active supplier (255 characters maximum).", identifierValidation()),
    column("on_hand_quantity", "On Hand Quantity", true, "Enter the non-negative quantity currently on hand, using the selected Unit Of Measure. New Inventory records start with zero allocated quantity.", { kind: "decimal", unit: "unit_of_measure" }),
    column("reorder_point_quantity", "Reorder Point Quantity", false, "Enter a non-negative reorder quantity using the selected Unit Of Measure. Leave blank to use zero.", { kind: "decimal", unit: "unit_of_measure" }),
    column("unit_cost", "Unit Cost", false, "Enter the cost per inventory unit without a currency symbol, using no more than two decimal places.", { kind: "currency", unit: "dollars per inventory unit" }),
    column("lead_time_days", "Lead Time Days", false, "Enter the non-negative whole number of calendar days.", { kind: "whole", unit: "calendar days" }),
    column("location", "Location", false, "Enter one storage location for this item, such as Warehouse A or Shelf B3."),
    column("lot_number", "Lot Number", false, "Optional lot or batch number for this new SKU. Use one row per new SKU."),
  ]),
};

function schema(module: ImportModule, label: string, keyColumn: string, columns: ImportColumn[]): ImportSchema {
  return { module, label, keyColumn, maxRows: MAX_IMPORT_ROWS, maxFileBytes: MAX_IMPORT_FILE_BYTES, columns };
}

function column(key: string, label: string, required: boolean, description: string, validation?: ImportColumn["validation"]): ImportColumn {
  return { key, label, required, description, ...(validation ? { validation } : {}) };
}

function identifierValidation(): ImportColumn["validation"] {
  return { kind: "identifier", maxLength: MAX_IMPORT_IDENTIFIER_CHARACTERS };
}

function enumValidation(values: readonly string[]): ImportColumn["validation"] {
  return { kind: "enum", allowedValues: [...values] };
}

export function isImportModule(value: string): value is ImportModule {
  return value === "customers" || value === "products" || value === "suppliers" || value === "inventory";
}

export function getImportSchema(module: ImportModule) {
  return schemas[module];
}

export async function previewImport(
  store: ImportStore,
  module: ImportModule,
  headers: unknown,
  rows: unknown,
  rowNumbers?: unknown,
): Promise<{ preview: ImportPreview; actions: ImportAction[] }> {
  const errors: ImportRowError[] = [];
  const schema = getImportSchema(module);
  const parsedHeaders = validateHeaders(schema, headers, errors);
  const sourceRows = validateRowNumbers(rows, rowNumbers, errors);
  const parsedRows = validateRowsContainer(rows, sourceRows, errors);
  validateCellSizes(schema, parsedRows, sourceRows, errors);
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    errors.push({ row: 0, field: "file", message: `Files are limited to ${MAX_IMPORT_ROWS} data rows.` });
  }
  if (parsedRows.length === 0) {
    errors.push({ row: 0, field: "file", message: "The file does not contain any data rows." });
  }
  if (parsedRows.length === 0 || parsedHeaders.length === 0) {
    return result(module, parsedRows.length, [], errors);
  }

  const snapshot = await store.loadSnapshot(module);
  const actions = prepareActions(module, parsedRows.slice(0, MAX_IMPORT_ROWS), sourceRows.slice(0, MAX_IMPORT_ROWS), snapshot, errors);
  return result(module, parsedRows.length, actions, errors);
}

export async function commitImport(
  store: ImportStore,
  module: ImportModule,
  headers: unknown,
  rows: unknown,
  actorUserId: string | null,
  rowNumbers?: unknown,
): Promise<ImportPreview> {
  const prepared = await previewImport(store, module, headers, rows, rowNumbers);
  if (!prepared.preview.valid) return prepared.preview;
  await store.commit(prepared.actions, actorUserId);
  return prepared.preview;
}

function result(
  module: ImportModule,
  totalRows: number,
  actions: ImportAction[],
  errors: ImportRowError[],
) {
  const valid = errors.length === 0;
  const preview: ImportPreview = {
    module,
    valid,
    totalRows,
    creates: valid ? actions.length : 0,
    records: valid ? actions.map((action) => ({ row: action.sourceRow, key: actionKey(action) })) : [],
    errors,
  };
  return { preview, actions: valid ? actions : [] };
}

function validateHeaders(schema: ImportSchema, headers: unknown, errors: ImportRowError[]) {
  if (!Array.isArray(headers) || headers.some((header) => typeof header !== "string")) {
    errors.push({ row: 1, field: "headers", message: "The header row is missing or invalid." });
    return [];
  }
  const normalized = headers.map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase());
  const expected = schema.columns.map((entry) => entry.key);
  const duplicates = normalized.filter((header, index) => normalized.indexOf(header) !== index);
  for (const duplicate of new Set(duplicates)) {
    errors.push({ row: 1, field: duplicate || "headers", message: `Duplicate header: ${duplicate || "(blank)"}.` });
  }
  for (const missing of expected.filter((header) => !normalized.includes(header))) {
    errors.push({ row: 1, field: missing, message: `Missing required template column: ${missing}.` });
  }
  for (const unknown of normalized.filter((header) => !expected.includes(header))) {
    errors.push({ row: 1, field: unknown || "headers", message: `Unknown template column: ${unknown || "(blank)"}.` });
  }
  return normalized;
}

function validateRowNumbers(rows: unknown, rowNumbers: unknown, errors: ImportRowError[]) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const fallback = Array.from({ length: rowCount }, (_, index) => index + 2);
  if (rowNumbers === undefined) return fallback;
  if (!Array.isArray(rowNumbers)) {
    errors.push({ row: 0, field: "rowNumbers", message: "Source row numbers must be supplied as an array." });
    return fallback;
  }
  if (rowNumbers.length !== rowCount) {
    errors.push({ row: 0, field: "rowNumbers", message: "Source row numbers must match the number of data rows." });
  }
  let previous = 1;
  return fallback.map((fallbackRow, index) => {
    const value = rowNumbers[index];
    if (!Number.isInteger(value) || value < 2) {
      errors.push({ row: 0, field: "rowNumbers", message: `Source row number at position ${index + 1} must be a whole number of 2 or greater.` });
      return fallbackRow;
    }
    if (value <= previous) {
      errors.push({ row: 0, field: "rowNumbers", message: "Source row numbers must be strictly increasing." });
      return fallbackRow;
    }
    previous = value;
    return value;
  });
}

function validateRowsContainer(rows: unknown, rowNumbers: number[], errors: ImportRowError[]) {
  if (!Array.isArray(rows)) {
    errors.push({ row: 0, field: "file", message: "Rows must be supplied as an array." });
    return [];
  }
  return rows.map((row, index): ParsedImportRow => {
    const valid = Boolean(row) && typeof row === "object" && !Array.isArray(row);
    if (!valid) errors.push({ row: rowNumbers[index] ?? index + 2, field: "row", message: "Row must be an object." });
    return valid ? row as Record<string, unknown> : null;
  });
}

function validateCellSizes(schema: ImportSchema, rows: ParsedImportRow[], rowNumbers: number[], errors: ImportRowError[]) {
  rows.forEach((row, index) => {
    if (!row) return;
    for (const column of schema.columns) {
      const value = row[column.key];
      if (typeof value === "string" && value.length > MAX_IMPORT_CELL_CHARACTERS) {
        errors.push({ row: rowNumbers[index] ?? index + 2, field: column.key, message: `${column.key} is limited to ${MAX_IMPORT_CELL_CHARACTERS.toLocaleString()} characters.` });
      }
    }
  });
}

function prepareActions(
  module: ImportModule,
  rows: ParsedImportRow[],
  rowNumbers: number[],
  snapshot: ImportSnapshot,
  errors: ImportRowError[],
): ImportAction[] {
  switch (module) {
    case "customers": return prepareCustomers(rows, rowNumbers, snapshot, errors);
    case "products": return prepareProducts(rows, rowNumbers, snapshot, errors);
    case "suppliers": return prepareSuppliers(rows, rowNumbers, snapshot, errors);
    case "inventory": return prepareInventory(rows, rowNumbers, snapshot, errors);
  }
}

function prepareCustomers(rows: ParsedImportRow[], rowNumbers: number[], snapshot: ImportSnapshot, errors: ImportRowError[]) {
  const index = indexBy(snapshot.customers, (row) => row.name);
  const seen = new Set<string>();
  const actions: CustomerAction[] = [];
  rows.forEach((row, offset) => {
    if (!row) return;
    const rowNumber = rowNumbers[offset] ?? offset + 2;
    const name = requiredText(row, "name", rowNumber, errors);
    const nameValid = validateIdentifier(name, "name", rowNumber, errors);
    const key = normalizedKey(name);
    const keyValid = uniqueFileKey(key, "name", rowNumber, seen, errors);
    const matches = index.get(key) ?? [];
    existingTargetError(matches, "name", name, "Customer", rowNumber, errors);
    const contactEmail = optionalText(row, "contact_email");
    validateEmail(contactEmail, "contact_email", rowNumber, errors);
    const status = enumValue(row, "status", rowNumber, errors, ["active", "inactive"] as const, "active");
    if (!nameValid || !keyValid || matches.length || !name || !status) return;
    actions.push({
      kind: "customer",
      sourceRow: rowNumber,
      id: `customer_${crypto.randomUUID()}`,
      name,
      contactName: optionalText(row, "contact_name"),
      contactEmail,
      phone: optionalText(row, "phone"),
      status,
    });
  });
  return actions;
}

function prepareProducts(rows: ParsedImportRow[], rowNumbers: number[], snapshot: ImportSnapshot, errors: ImportRowError[]) {
  const productIndex = indexBy(snapshot.products, (row) => row.sku);
  const customerIndex = indexBy(snapshot.customers.filter((row) => row.status === "active"), (row) => row.name);
  const seen = new Set<string>();
  const actions: ProductAction[] = [];
  rows.forEach((row, offset) => {
    if (!row) return;
    const rowNumber = rowNumbers[offset] ?? offset + 2;
    const sku = requiredText(row, "sku", rowNumber, errors);
    const name = requiredText(row, "name", rowNumber, errors);
    const skuValid = validateIdentifier(sku, "sku", rowNumber, errors);
    validateOptionalIdentifier(row, "customer_name", rowNumber, errors);
    const key = normalizedKey(sku);
    const keyValid = uniqueFileKey(key, "sku", rowNumber, seen, errors);
    const matches = productIndex.get(key) ?? [];
    existingTargetError(matches, "sku", sku, "Product", rowNumber, errors);
    const customerId = resolveCustomer(row, "customer_name", rowNumber, customerIndex, errors, null);
    const status = enumValue(row, "status", rowNumber, errors, ["active", "inactive"] as const, "active");
    const size = optionalDecimal(row, "size", rowNumber, errors);
    const sizeUnit = optionalEnumValue(row, "size_unit", rowNumber, errors, PRODUCT_SIZE_UNITS);
    validatePairedFields(size, sizeUnit, "size", "size_unit", rowNumber, errors);
    const caseQuantity = optionalWholeNumber(row, "case_quantity", rowNumber, errors);
    const unitPriceCents = optionalMoneyCents(row, "unit_price", rowNumber, errors);
    const dailyProductionRate = optionalWholeNumber(row, "daily_production_rate", rowNumber, errors);
    const kosher = booleanValue(row, "kosher", rowNumber, errors, false);
    const allergen = booleanValue(row, "allergen", rowNumber, errors, false);
    if (!skuValid || !keyValid || matches.length || !sku || !name || !status || customerId === undefined || sizeUnit === undefined || kosher === undefined || allergen === undefined) return;
    const notes = optionalText(row, "notes");
    actions.push({
      kind: "product",
      sourceRow: rowNumber,
      id: `product_${crypto.randomUUID()}`,
      customerId,
      sku,
      name,
      description: notes,
      status,
      productionRoom: optionalText(row, "production_room"),
      size,
      sizeUnit,
      caseQuantity,
      caseSticker: optionalText(row, "case_sticker"),
      unitPriceCents,
      kosher,
      allergen,
      allergenDetails: optionalText(row, "allergen_details"),
      dailyProductionRate,
      notes,
    });
  });
  return actions;
}

function prepareSuppliers(rows: ParsedImportRow[], rowNumbers: number[], snapshot: ImportSnapshot, errors: ImportRowError[]) {
  const index = indexBy(snapshot.suppliers.filter((row) => row.status === "active"), (row) => row.title);
  const seen = new Set<string>();
  const actions: SupplierAction[] = [];
  rows.forEach((row, offset) => {
    if (!row) return;
    const rowNumber = rowNumbers[offset] ?? offset + 2;
    const name = requiredText(row, "name", rowNumber, errors);
    const nameValid = validateIdentifier(name, "name", rowNumber, errors);
    const key = normalizedKey(name);
    const keyValid = uniqueFileKey(key, "name", rowNumber, seen, errors);
    const matches = index.get(key) ?? [];
    existingTargetError(matches, "name", name, "Supplier", rowNumber, errors);
    const email = optionalText(row, "email");
    validateEmail(email, "email", rowNumber, errors);
    const moq = optionalDecimal(row, "moq", rowNumber, errors);
    if (!nameValid || !keyValid || matches.length || !name) return;
    actions.push({
      kind: "supplier",
      sourceRow: rowNumber,
      id: `supplier_${crypto.randomUUID()}`,
      name,
      payload: {
        name,
        contact: optionalText(row, "contact_name") ?? "",
        email: email ?? "",
        phone: optionalText(row, "phone") ?? "",
        website: optionalText(row, "website") ?? "",
        moq: moq ?? "",
        notes: optionalText(row, "notes") ?? "",
      },
      fileIds: [],
    });
  });
  return actions;
}

function prepareInventory(rows: ParsedImportRow[], rowNumbers: number[], snapshot: ImportSnapshot, errors: ImportRowError[]) {
  const masterIndex = indexBy(snapshot.masterItems, (row) => row.sku);
  const customerIndex = indexBy(snapshot.customers.filter((row) => row.status === "active"), (row) => row.name);
  const supplierIndex = indexBy(snapshot.suppliers.filter((row) => row.status === "active"), (row) => row.title);
  const seen = new Set<string>();
  const actions: InventoryAction[] = [];
  rows.forEach((row, offset) => {
    if (!row) return;
    const rowNumber = rowNumbers[offset] ?? offset + 2;
    const sku = requiredText(row, "sku", rowNumber, errors);
    const name = requiredText(row, "name", rowNumber, errors);
    const skuValid = validateIdentifier(sku, "sku", rowNumber, errors);
    validateOptionalIdentifier(row, "customer_name", rowNumber, errors);
    validateOptionalIdentifier(row, "supplier_name", rowNumber, errors);
    const unitOfMeasure = requiredEnumValue(row, "unit_of_measure", rowNumber, errors, INVENTORY_UNITS);
    const key = normalizedKey(sku);
    const keyValid = uniqueFileKey(key, "sku", rowNumber, seen, errors);
    const masterMatches = masterIndex.get(key) ?? [];
    existingTargetError(masterMatches, "sku", sku, "Inventory", rowNumber, errors);
    const category = categoryValue(row, rowNumber, errors);
    const customerId = resolveCustomer(row, "customer_name", rowNumber, customerIndex, errors, "general");
    const supplierId = resolveSupplier(row, rowNumber, supplierIndex, errors);
    const onHandQuantity = requiredDecimal(row, "on_hand_quantity", rowNumber, errors);
    const reorderPointQuantity = optionalDecimal(row, "reorder_point_quantity", rowNumber, errors) ?? 0;
    const unitCostCents = optionalMoneyCents(row, "unit_cost", rowNumber, errors);
    const leadTimeDays = optionalWholeNumber(row, "lead_time_days", rowNumber, errors);
    if (!skuValid || !keyValid || masterMatches.length || !sku || !name || !unitOfMeasure || !category || typeof customerId !== "string" || supplierId === undefined || onHandQuantity == null) return;
    const location = optionalText(row, "location");
    const lotNumber = optionalText(row, "lot_number");
    const lotsAfterJson = JSON.stringify(onHandQuantity > 0 || location || lotNumber
      ? [{ lotNumber: lotNumber ?? "", location: location ?? "", qty: onHandQuantity, quantity: onHandQuantity }]
      : []);
    actions.push({
      kind: "inventory",
      sourceRow: rowNumber,
      masterItemId: `master_${crypto.randomUUID()}`,
      inventoryItemId: `inventory_${crypto.randomUUID()}`,
      sku,
      name,
      itemType: category.itemType,
      category: category.category,
      unitOfMeasure,
      allergens: optionalText(row, "allergens")?.split(/[;,]/).map((value) => value.trim()).filter(Boolean) ?? [],
      customerId,
      supplierId,
      onHandQuantity,
      reorderPointQuantity,
      unitCostCents,
      leadTimeDays,
      location,
      lotNumber,
      lotsAfterJson,
    });
  });
  return actions;
}

function existingTargetError<T>(matches: T[], field: string, recordKey: string, label: string, row: number, errors: ImportRowError[]) {
  if (matches.length === 1) {
    errors.push({ row, field, recordKey, code: "IMPORT_RECORD_EXISTS", message: `This ${label} ${field === "sku" ? "SKU" : "name"} already exists. Imports only add new records and cannot change existing records.` });
  } else if (matches.length > 1) {
    errors.push({ row, field, recordKey, code: "IMPORT_RECORD_EXISTS", message: `Multiple existing ${label} records match this ${field === "sku" ? "SKU" : "name"}. Resolve the data-integrity conflict manually before importing.` });
  }
}

function actionKey(action: ImportAction) {
  return action.kind === "customer" || action.kind === "supplier" ? action.name : action.sku;
}

function indexBy<T>(rows: T[], value: (row: T) => string) {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizedKey(value(row));
    const matches = index.get(key) ?? [];
    matches.push(row);
    index.set(key, matches);
  }
  return index;
}

function normalizedKey(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLowerCase();
}

function uniqueFileKey(key: string, field: string, row: number, seen: Set<string>, errors: ImportRowError[]) {
  if (!key) return false;
  if (seen.has(key)) {
    errors.push({ row, field, message: `Duplicate ${field} within this file.` });
    return false;
  }
  seen.add(key);
  return true;
}

function cellText(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function requiredText(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  const value = cellText(row, field);
  if (!value) errors.push({ row: rowNumber, field, message: `${field} is required.` });
  return value;
}

function optionalText(row: Record<string, unknown>, field: string) {
  return cellText(row, field) || null;
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function validateIdentifier(value: string, field: string, rowNumber: number, errors: ImportRowError[]) {
  if (!value) return false;
  if (characterCount(value) <= MAX_IMPORT_IDENTIFIER_CHARACTERS) return true;
  errors.push({ row: rowNumber, field, message: `${field} is limited to ${MAX_IMPORT_IDENTIFIER_CHARACTERS} characters.` });
  return false;
}

function validateOptionalIdentifier(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  const value = optionalText(row, field);
  return !value || validateIdentifier(value, field, rowNumber, errors);
}

function decimalValue(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[], required: boolean) {
  const raw = cellText(row, field);
  if (!raw) {
    if (required) errors.push({ row: rowNumber, field, message: `${field} is required.` });
    return required ? undefined : null;
  }
  const numeric = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  const value = numeric ? Number(raw) : Number.NaN;
  if (!numeric || !Number.isFinite(value) || value < 0) {
    errors.push({ row: rowNumber, field, message: `${field} must be a plain non-negative number without symbols, grouping commas, units, or exponents.` });
    return required ? undefined : null;
  }
  if ((numeric[2]?.length ?? 0) > MAX_IMPORT_DECIMAL_PLACES || value > MAX_IMPORT_DECIMAL_VALUE) {
    errors.push({ row: rowNumber, field, message: `${field} supports values up to ${MAX_IMPORT_DECIMAL_VALUE.toLocaleString()} with no more than ${MAX_IMPORT_DECIMAL_PLACES} decimal places.` });
    return required ? undefined : null;
  }
  return value;
}

function requiredDecimal(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  return decimalValue(row, field, rowNumber, errors, true) as number | undefined;
}

function optionalDecimal(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  return decimalValue(row, field, rowNumber, errors, false) as number | null;
}

function optionalMoneyCents(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  const raw = cellText(row, field);
  if (!raw) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    errors.push({ row: rowNumber, field, message: `${field} must be a plain non-negative decimal amount without a currency symbol or grouping commas and with no more than two decimal places.` });
    return null;
  }
  const [whole, fractional = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    errors.push({ row: rowNumber, field, message: `${field} is outside the supported monetary range.` });
    return null;
  }
  return cents;
}

function optionalWholeNumber(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[]) {
  const value = optionalDecimal(row, field, rowNumber, errors);
  if (value !== null && !Number.isInteger(value)) {
    errors.push({ row: rowNumber, field, message: `${field} must be a non-negative whole number.` });
    return null;
  }
  if (value !== null && !Number.isSafeInteger(value)) {
    errors.push({ row: rowNumber, field, message: `${field} must be within the supported whole-number range.` });
    return null;
  }
  return value;
}

function validatePairedFields(
  first: number | null,
  second: string | null | undefined,
  firstField: string,
  secondField: string,
  rowNumber: number,
  errors: ImportRowError[],
) {
  if (first !== null && !second) errors.push({ row: rowNumber, field: secondField, message: `${secondField} is required when ${firstField} is supplied.` });
  if (first === null && second) errors.push({ row: rowNumber, field: firstField, message: `${firstField} is required when ${secondField} is supplied.` });
}

function booleanValue(row: Record<string, unknown>, field: string, rowNumber: number, errors: ImportRowError[], fallback: boolean) {
  const raw = cellText(row, field).toLowerCase();
  if (!raw) return fallback;
  if (["yes", "true", "1"].includes(raw)) return true;
  if (["no", "false", "0"].includes(raw)) return false;
  errors.push({ row: rowNumber, field, message: `${field} must be Yes/No, True/False, or 1/0.` });
  return undefined;
}

function enumValue<T extends string>(
  row: Record<string, unknown>,
  field: string,
  rowNumber: number,
  errors: ImportRowError[],
  values: readonly T[],
  fallback: T,
) {
  const raw = cellText(row, field).toLowerCase() || fallback;
  const match = values.find((value) => value.toLowerCase() === raw);
  if (!match) {
    errors.push({ row: rowNumber, field, message: `${field} must be one of: ${values.join(", ")}.` });
    return undefined;
  }
  return match;
}

function optionalEnumValue<T extends string>(
  row: Record<string, unknown>,
  field: string,
  rowNumber: number,
  errors: ImportRowError[],
  values: readonly T[],
) {
  const raw = cellText(row, field);
  if (!raw) return null;
  const match = values.find((value) => value.toLowerCase() === raw.toLowerCase());
  if (!match) {
    errors.push({ row: rowNumber, field, message: `${field} must be one of: ${values.join(", ")}.` });
    return undefined;
  }
  return match;
}

function requiredEnumValue<T extends string>(
  row: Record<string, unknown>,
  field: string,
  rowNumber: number,
  errors: ImportRowError[],
  values: readonly T[],
) {
  const raw = cellText(row, field);
  if (!raw) {
    errors.push({ row: rowNumber, field, message: `${field} is required.` });
    return undefined;
  }
  return optionalEnumValue(row, field, rowNumber, errors, values);
}

function categoryValue(row: Record<string, unknown>, rowNumber: number, errors: ImportRowError[]) {
  const raw = cellText(row, "category").toLowerCase().replace(/[_-]+/g, " ");
  if (raw === "ingredient" || raw === "raw material") {
    return { category: "Ingredient" as const, itemType: "raw_material" as const };
  }
  if (raw === "packaging") return { category: "Packaging" as const, itemType: "packaging" as const };
  if (raw === "finished good" || raw === "finished goods") {
    return { category: "Finished Good" as const, itemType: "finished_good" as const };
  }
  errors.push({ row: rowNumber, field: "category", message: "category must be Ingredient, Packaging, or Finished Good." });
  return undefined;
}

function validateEmail(value: string | null, field: string, row: number, errors: ImportRowError[]) {
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    errors.push({ row, field, message: `${field} must be a valid email address.` });
  }
}

function resolveCustomer(
  row: Record<string, unknown>,
  field: string,
  rowNumber: number,
  index: Map<string, CustomerSnapshot[]>,
  errors: ImportRowError[],
  blankValue: string | null,
) {
  const name = optionalText(row, field);
  if (!name || normalizedKey(name) === "general") return blankValue;
  const matches = index.get(normalizedKey(name)) ?? [];
  if (matches.length !== 1) {
    errors.push({ row: rowNumber, field, message: matches.length > 1 ? "Multiple active customers match this name." : "Customer name was not found." });
    return undefined;
  }
  return matches[0].id;
}

function resolveSupplier(
  row: Record<string, unknown>,
  rowNumber: number,
  index: Map<string, SupplierSnapshot[]>,
  errors: ImportRowError[],
) {
  const name = optionalText(row, "supplier_name");
  if (!name) return null;
  const matches = index.get(normalizedKey(name)) ?? [];
  if (matches.length !== 1) {
    errors.push({ row: rowNumber, field: "supplier_name", message: matches.length > 1 ? "Multiple active suppliers match this name." : "Supplier name was not found." });
    return undefined;
  }
  return matches[0].id;
}
