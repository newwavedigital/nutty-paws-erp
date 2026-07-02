import { ValidationError } from "../api/errors";
import {
  archiveDataRecord,
  createDataRecord,
  listDataRecords,
  readDataRecord,
  updateDataRecord,
  type DataRecord,
  type DataRecordInput,
  type DataRecordStore,
} from "../records/service";

export type SupplierProductType = "Ingredient" | "Packaging";

export type SupplierProductLineRecord = {
  id: string;
  supplierId: string;
  inventoryItemId: string | null;
  productName: string;
  productType: SupplierProductType;
  pricePerUnitCents: number | null;
  unitOfMeasure: string | null;
  moq: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierProductLineInput = {
  id?: string;
  inventoryItemId: string;
  productName: string;
  productType: SupplierProductType;
  pricePerUnitCents?: number | null;
  unitOfMeasure?: string | null;
  moq?: string | null;
  notes?: string | null;
};

export type SupplierStore = DataRecordStore & {
  listSupplierProductLines?(supplierId: string): Promise<SupplierProductLineRecord[]>;
  replaceSupplierProductLines?(supplierId: string, lines: SupplierProductLineInput[], actorUserId?: string | null): Promise<SupplierProductLineRecord[]>;
  isSupplierInventoryItem?(inventoryItemId: string): Promise<boolean>;
};

export type SupplierRecord = DataRecord;
export type SupplierInput = DataRecordInput;

export {
  archiveDataRecord as archiveSupplier,
  createDataRecord as createSupplier,
  listDataRecords as listSuppliers,
  readDataRecord as readSupplier,
  updateDataRecord as updateSupplier,
};

type SupplierPayloadLine = {
  id?: string;
  inventoryItemId: string;
  product: string;
  itemName: string;
  type: SupplierProductType;
  pricePerLb?: number | "";
  unit?: string;
  moq?: string;
  notes?: string;
};

export async function serializeSupplierWithProductLines(store: SupplierStore, record: DataRecord) {
  const tableLines = store.listSupplierProductLines
    ? await store.listSupplierProductLines(record.id)
    : [];
  const payloadLines = tableLines.length
    ? tableLines.map(supplierProductLineToPayload)
    : normalizePayloadLines(record.payload.productLines, { allowMissingInventoryItem: true });
  return {
    ...record,
    payload: {
      ...record.payload,
      productLines: payloadLines,
    },
  };
}

export function supplierPayloadWithoutProductLines(payload: Record<string, unknown>) {
  const { productLines, ...rest } = payload;
  const legacyLines = normalizePayloadLines(productLines, { allowMissingInventoryItem: true })
    .filter((line) => !line.inventoryItemId);
  return legacyLines.length ? { ...rest, productLines: legacyLines } : rest;
}

export async function supplierProductLineInputsFromPayload(store: SupplierStore, payload: Record<string, unknown>) {
  const lines = normalizePayloadLines(payload.productLines, { allowMissingInventoryItem: true })
    .filter((line) => line.inventoryItemId)
    .map((line) => ({
    id: line.id,
    inventoryItemId: line.inventoryItemId,
    productName: line.itemName || line.product,
    productType: line.type,
    pricePerUnitCents: line.pricePerLb == null || line.pricePerLb === ""
      ? null
      : Math.round(Number(line.pricePerLb) * 100),
    unitOfMeasure: line.unit || null,
    moq: line.moq || null,
    notes: line.notes || null,
    }));
  if (store.isSupplierInventoryItem) {
    for (const line of lines) {
      if (!await store.isSupplierInventoryItem(line.inventoryItemId)) {
        throw new ValidationError("Supplier product lines must reference active Ingredient or Packaging inventory items", { fields: ["payload.productLines.inventoryItemId"] });
      }
    }
  }
  return lines;
}

export function payloadIncludesProductLines(payload: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(payload, "productLines");
}

function normalizePayloadLines(value: unknown, options: { allowMissingInventoryItem: boolean }) {
  if (!Array.isArray(value)) return [];
  return value.map((line, index): SupplierPayloadLine => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new ValidationError(`payload.productLines[${index}] must be an object`, { fields: ["payload.productLines"] });
    }
    const source = line as Record<string, unknown>;
    const inventoryItemId = stringValue(source.inventoryItemId);
    if (!inventoryItemId && !options.allowMissingInventoryItem) {
      throw new ValidationError("Supplier product lines must reference current Ingredient or Packaging inventory items", { fields: ["payload.productLines.inventoryItemId"] });
    }
    const product = stringValue(source.product) || stringValue(source.itemName);
    if (!product && !options.allowMissingInventoryItem) {
      throw new ValidationError("Supplier product line item name is required", { fields: ["payload.productLines.itemName"] });
    }
    return {
      id: stringValue(source.id) || undefined,
      inventoryItemId,
      product,
      itemName: product,
      type: supplierProductType(source.type),
      pricePerLb: numberValue(source.pricePerLb),
      unit: stringValue(source.unit),
      moq: stringValue(source.moq),
      notes: stringValue(source.notes),
    };
  }).filter((line) => line.inventoryItemId || line.product);
}

function supplierProductLineToPayload(line: SupplierProductLineRecord) {
  return {
    id: line.id,
    inventoryItemId: line.inventoryItemId || "",
    product: line.productName,
    itemName: line.productName,
    type: line.productType,
    pricePerLb: line.pricePerUnitCents == null ? "" : line.pricePerUnitCents / 100,
    unit: line.unitOfMeasure || "",
    moq: line.moq || "",
    notes: line.notes || "",
  };
}

function supplierProductType(value: unknown): SupplierProductType {
  return value === "Packaging" ? "Packaging" : "Ingredient";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}
