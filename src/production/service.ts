import { ApiError } from "../api/errors";

export type ProductionRunStatus = "scheduled" | "finalized" | "reopened";

export type ProductionPurchaseOrder = {
  id: string;
  poNumber: string;
  customerId: string;
  status: string;
  lines: Array<{
    id: string;
    productId: string | null;
    quantity: number;
    description: string;
  }>;
};

export type ProductionRunLineRecord = {
  id: string;
  productionRunId: string;
  purchaseOrderLineId: string;
  productId: string | null;
  orderedQuantity: number;
  quantityProduced: number;
  casesProduced: number;
  lotNumber: string;
};

export type ProductionRunMaterialRecord = {
  id: string;
  productionRunId: string;
  purchaseOrderLineId: string | null;
  productId: string | null;
  masterItemId: string;
  inventoryItemId?: string | null;
  materialType: "ingredient" | "packaging";
  theoreticalQuantity: number;
  actualUsedQuantity: number;
  wastePercent: number;
  lotNumber: string | null;
};

export type ProductionRunRecord = {
  id: string;
  purchaseOrderId: string;
  productionDate: string;
  productionEndDate: string;
  productionRoom: string;
  status: ProductionRunStatus;
  finalizedAt: string | null;
  reopenedAt: string | null;
  correctionCount: number;
  notes: string | null;
  lines: ProductionRunLineRecord[];
  materials: ProductionRunMaterialRecord[];
};

export type ProductionLogRecord = {
  id: string;
  logId: string;
  purchaseOrderId: string;
  productionRunId: string;
  productionDate: string;
  productionEndDate: string;
  productionRoom: string;
  completedAt: string | null;
  overallWastePercent: number;
  lineSnapshot: ProductionRunLineRecord[];
  materialSnapshot: ProductionRunMaterialRecord[];
  notes: string | null;
};

export type ProductionBomItem = {
  productId: string;
  masterItemId: string;
  quantityPerUnit: number;
  itemType: "raw_material" | "packaging" | "finished_good" | "other";
  inventoryItemId: string | null;
  productIsOwnBrand: boolean;
};

export type ProductionStore = {
  getPurchaseOrder(id: string): Promise<ProductionPurchaseOrder | null>;
  getProductionRunByPurchaseOrderId(purchaseOrderId: string): Promise<ProductionRunRecord | null>;
  getProductionRun(id: string): Promise<ProductionRunRecord | null>;
  upsertProductionRun(input: {
    id: string;
    purchaseOrderId: string;
    productionDate: string;
    productionEndDate: string;
    productionRoom: string;
    status: "scheduled";
    correctionCount: number;
    notes?: string | null;
    actorUserId?: string;
  }): Promise<ProductionRunRecord>;
  updatePurchaseOrderStatus(id: string, status: string): Promise<void>;
  listProductBomItems(productId: string): Promise<ProductionBomItem[]>;
  findFinishedGoodInventoryItem(productId: string): Promise<{ id: string } | null>;
  replaceRunLines(runId: string, lines: ProductionRunLineRecord[]): Promise<void>;
  replaceRunMaterials(runId: string, materials: ProductionRunMaterialRecord[]): Promise<void>;
  listInventoryEffects(runId: string): Promise<Array<{ inventoryItemId: string; quantityDelta: number }>>;
  clearInventoryEffects(runId: string): Promise<void>;
  adjustInventory(input: {
    inventoryItemId: string;
    quantityDelta: number;
    referenceType: "production_run";
    referenceId: string;
    actorUserId?: string;
  }): Promise<void>;
  createInventoryEffect(input: {
    id: string;
    productionRunId: string;
    inventoryItemId: string;
    quantityDelta: number;
    effectType: "consume_material" | "produce_finished_good";
  }): Promise<void>;
  upsertInventoryLot(input: {
    productId: string;
    inventoryItemId: string;
    lotNumber: string;
    purchaseOrderId: string;
    productionRunId: string;
    productionDate: string;
    quantityProduced: number;
  }): Promise<void>;
  finalizeRun(input: {
    id: string;
    status: "finalized";
    notes?: string | null;
    actorUserId?: string;
  }): Promise<ProductionRunRecord>;
  reopenRun(input: {
    id: string;
    reason: string;
    actorUserId?: string;
  }): Promise<ProductionRunRecord>;
  listProductionRuns(): Promise<ProductionRunRecord[]>;
  upsertProductionLog(input: Omit<ProductionLogRecord, "id">): Promise<void>;
  listProductionLogs(): Promise<ProductionLogRecord[]>;
  createStatusEvent(input: {
    purchaseOrderId: string;
    fromStatus: string | null;
    toStatus: string;
    eventType: string;
    actorUserId?: string;
    note?: string;
  }): Promise<void>;
  createAuditEvent(input: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export class ProductionError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, productionStatusFor(code));
    this.name = "ProductionError";
  }
}

export async function scheduleProductionRun(
  store: ProductionStore,
  input: {
    purchaseOrderId: string;
    productionDate: string;
    productionEndDate: string;
    productionRoom: string;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  assertDateRange(input.productionDate, input.productionEndDate);
  const po = await requirePurchaseOrder(store, input.purchaseOrderId);
  if (!["approved_for_production", "in_production"].includes(po.status)) {
    throw new ProductionError("INVALID_PRODUCTION_STATUS", "Only approved purchase orders can be scheduled for production");
  }

  const existing = await store.getProductionRunByPurchaseOrderId(po.id);
  const run = await store.upsertProductionRun({
    id: existing?.id ?? `production_run_${crypto.randomUUID()}`,
    purchaseOrderId: po.id,
    productionDate: input.productionDate,
    productionEndDate: input.productionEndDate,
    productionRoom: input.productionRoom,
    status: "scheduled",
    correctionCount: existing?.correctionCount ?? 0,
    notes: input.notes ?? existing?.notes ?? null,
    actorUserId: input.actorUserId,
  });

  await store.updatePurchaseOrderStatus(po.id, "in_production");
  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: "in_production",
    eventType: "purchase_order.production_scheduled",
    actorUserId: input.actorUserId,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "production_run",
    entityId: run.id,
    action: "production_run.scheduled",
    metadata: {
      purchaseOrderId: po.id,
      productionDate: input.productionDate,
      productionEndDate: input.productionEndDate,
      productionRoom: input.productionRoom,
    },
  });

  return run;
}

export async function finalizeProductionRun(
  store: ProductionStore,
  input: {
    productionRunId: string;
    actorUserId?: string;
    lines: Array<{
      purchaseOrderLineId: string;
      productId?: string | null;
      quantityProduced: number;
      casesProduced: number;
      lotNumber: string;
    }>;
    materialActuals: Array<{
      masterItemId: string;
      productId?: string | null;
      purchaseOrderLineId?: string | null;
      actualUsedQuantity: number;
      lotNumber?: string | null;
    }>;
    notes?: string | null;
  },
) {
  const run = await requireRun(store, input.productionRunId);
  if (run.status === "finalized") {
    throw new ProductionError("PRODUCTION_ALREADY_FINALIZED", "Production run is already finalized");
  }
  if (input.lines.length === 0) {
    throw new ProductionError("PRODUCTION_LINES_REQUIRED", "Production finalization requires at least one finished-good line");
  }

  const po = await requirePurchaseOrder(store, run.purchaseOrderId);
  const runLines = buildRunLines(run, po, input.lines);
  const materials = await buildRunMaterials(store, run, po, runLines, input.materialActuals);

  await reverseExistingEffects(store, run.id, input.actorUserId);
  await store.replaceRunLines(run.id, runLines);
  await store.replaceRunMaterials(run.id, materials);
  await applyMaterialEffects(store, run.id, materials, input.actorUserId);
  await applyFinishedGoodEffects(store, run, po, runLines, input.actorUserId);

  const finalized = await store.finalizeRun({
    id: run.id,
    status: "finalized",
    notes: input.notes ?? run.notes,
    actorUserId: input.actorUserId,
  });
  finalized.lines = runLines;
  finalized.materials = materials;

  await store.updatePurchaseOrderStatus(po.id, "qa_review");
  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: "qa_review",
    eventType: "purchase_order.production_finalized",
    actorUserId: input.actorUserId,
  });
  await store.upsertProductionLog({
    logId: logIdForPurchaseOrder(po),
    purchaseOrderId: po.id,
    productionRunId: run.id,
    productionDate: run.productionDate,
    productionEndDate: run.productionEndDate,
    productionRoom: run.productionRoom,
    completedAt: finalized.finalizedAt,
    overallWastePercent: calculateOverallWaste(materials),
    lineSnapshot: runLines,
    materialSnapshot: materials,
    notes: input.notes ?? run.notes,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "production_run",
    entityId: run.id,
    action: run.correctionCount > 0 ? "production_run.corrected_finalized" : "production_run.finalized",
    metadata: { purchaseOrderId: po.id, lineCount: runLines.length, materialCount: materials.length },
  });

  return finalized;
}

export async function reopenProductionRun(
  store: ProductionStore,
  input: { productionRunId: string; reason: string; actorUserId?: string },
) {
  const run = await requireRun(store, input.productionRunId);
  if (run.status !== "finalized") {
    throw new ProductionError("PRODUCTION_NOT_FINALIZED", "Only finalized production runs can be reopened");
  }
  if (!input.reason.trim()) {
    throw new ProductionError("CORRECTION_REASON_REQUIRED", "A correction reason is required");
  }
  const po = await requirePurchaseOrder(store, run.purchaseOrderId);
  const reopened = await store.reopenRun({
    id: input.productionRunId,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });
  await store.updatePurchaseOrderStatus(po.id, "in_production");
  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: "in_production",
    eventType: "purchase_order.production_reopened",
    actorUserId: input.actorUserId,
    note: input.reason,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "production_run",
    entityId: run.id,
    action: "production_run.reopened",
    metadata: { purchaseOrderId: po.id, reason: input.reason },
  });
  return reopened;
}

export function listProductionLogs(store: ProductionStore) {
  return store.listProductionLogs();
}

export function listProductionRuns(store: ProductionStore) {
  return store.listProductionRuns();
}

function buildRunLines(
  run: ProductionRunRecord,
  po: ProductionPurchaseOrder,
  lines: Array<{ purchaseOrderLineId: string; productId?: string | null; quantityProduced: number; casesProduced: number; lotNumber: string }>,
): ProductionRunLineRecord[] {
  return lines.map((line) => {
    assertNonNegative(line.quantityProduced, "quantityProduced");
    assertNonNegative(line.casesProduced, "casesProduced");
    if (!line.lotNumber.trim()) throw new ProductionError("LOT_NUMBER_REQUIRED", "Finished goods require lot numbers");
    const poLine = po.lines.find((candidate) => candidate.id === line.purchaseOrderLineId);
    if (!poLine) throw new ProductionError("PURCHASE_ORDER_LINE_NOT_FOUND", "Purchase order line not found");
    if (line.productId && line.productId !== poLine.productId) {
      throw new ProductionError("PURCHASE_ORDER_LINE_PRODUCT_MISMATCH", "Production line product does not match the purchase order line");
    }
    return {
      id: `production_run_line_${crypto.randomUUID()}`,
      productionRunId: run.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      productId: poLine.productId,
      orderedQuantity: poLine.quantity,
      quantityProduced: round2(line.quantityProduced),
      casesProduced: round2(line.casesProduced),
      lotNumber: line.lotNumber,
    };
  });
}

async function buildRunMaterials(
  store: ProductionStore,
  run: ProductionRunRecord,
  po: ProductionPurchaseOrder,
  runLines: ProductionRunLineRecord[],
  actuals: Array<{ masterItemId: string; productId?: string | null; purchaseOrderLineId?: string | null; actualUsedQuantity: number; lotNumber?: string | null }>,
) {
  const grouped = new Map<string, {
    purchaseOrderLineId: string | null;
    productId: string | null;
    masterItemId: string;
    inventoryItemId: string | null;
    materialType: "ingredient" | "packaging";
    theoreticalQuantity: number;
  }>();

  for (const line of runLines) {
    if (!line.productId) continue;
    const bomItems = await store.listProductBomItems(line.productId);
    const seenBomItems = new Set<string>();
    for (const bomItem of bomItems) {
      const materialType = bomItem.itemType === "packaging" ? "packaging" : "ingredient";
      const bomIdentity = `${line.productId}:${materialType}:${bomItem.masterItemId}:${bomItem.quantityPerUnit}`;
      if (seenBomItems.has(bomIdentity)) continue;
      seenBomItems.add(bomIdentity);
      const key = materialType === "packaging"
        ? `${line.purchaseOrderLineId}:${line.productId}:${bomItem.masterItemId}`
        : `ingredient:${bomItem.masterItemId}`;
      const existing = grouped.get(key);
      const theoreticalQuantity = round2(bomItem.quantityPerUnit * line.quantityProduced);
      if (existing) existing.theoreticalQuantity = round2(existing.theoreticalQuantity + theoreticalQuantity);
      else {
        grouped.set(key, {
          purchaseOrderLineId: materialType === "packaging" ? line.purchaseOrderLineId : null,
          productId: materialType === "packaging" ? line.productId : null,
          masterItemId: bomItem.masterItemId,
          inventoryItemId: bomItem.inventoryItemId,
          materialType,
          theoreticalQuantity,
        });
      }
    }
  }

  return Array.from(grouped.values()).map((material) => {
    const actual = findActual(material, actuals);
    const actualUsedQuantity = round2(actual?.actualUsedQuantity ?? material.theoreticalQuantity * 1.05);
    return {
      id: `production_run_material_${crypto.randomUUID()}`,
      productionRunId: run.id,
      purchaseOrderLineId: material.purchaseOrderLineId,
      productId: material.productId,
      masterItemId: material.masterItemId,
      inventoryItemId: material.inventoryItemId,
      materialType: material.materialType,
      theoreticalQuantity: material.theoreticalQuantity,
      actualUsedQuantity,
      wastePercent: wastePercent(material.theoreticalQuantity, actualUsedQuantity),
      lotNumber: actual?.lotNumber ?? null,
    };
  });
}

function findActual(
  material: { purchaseOrderLineId: string | null; productId: string | null; masterItemId: string },
  actuals: Array<{ masterItemId: string; productId?: string | null; purchaseOrderLineId?: string | null; actualUsedQuantity: number; lotNumber?: string | null }>,
) {
  return actuals.find((actual) =>
    actual.masterItemId === material.masterItemId &&
    (material.purchaseOrderLineId ? actual.purchaseOrderLineId === material.purchaseOrderLineId : true) &&
    (material.productId ? actual.productId === material.productId : true)
  );
}

async function reverseExistingEffects(store: ProductionStore, productionRunId: string, actorUserId?: string) {
  const existing = await store.listInventoryEffects(productionRunId);
  for (const effect of existing) {
    await store.adjustInventory({
      inventoryItemId: effect.inventoryItemId,
      quantityDelta: -effect.quantityDelta,
      referenceType: "production_run",
      referenceId: productionRunId,
      actorUserId,
    });
  }
  await store.clearInventoryEffects(productionRunId);
}

async function applyMaterialEffects(
  store: ProductionStore,
  productionRunId: string,
  materials: ProductionRunMaterialRecord[],
  actorUserId?: string,
) {
  for (const material of materials) {
    const inventoryItemId = await inventoryItemIdForMaterial(store, material);
    if (!inventoryItemId) continue;
    const quantityDelta = -material.actualUsedQuantity;
    await store.adjustInventory({ inventoryItemId, quantityDelta, referenceType: "production_run", referenceId: productionRunId, actorUserId });
    await store.createInventoryEffect({
      id: `production_effect_${crypto.randomUUID()}`,
      productionRunId,
      inventoryItemId,
      quantityDelta,
      effectType: "consume_material",
    });
  }
}

async function inventoryItemIdForMaterial(store: ProductionStore, material: ProductionRunMaterialRecord) {
  if (material.inventoryItemId) return material.inventoryItemId;
  if (!material.productId) {
    return (await findBomInventoryItem(store, material.masterItemId)) ?? null;
  }
  return findBomInventoryItem(store, material.masterItemId, material.productId);
}

async function findBomInventoryItem(store: ProductionStore, masterItemId: string, productId?: string | null) {
  if (productId) {
    const bom = await store.listProductBomItems(productId);
    return bom.find((item) => item.masterItemId === masterItemId)?.inventoryItemId ?? null;
  }
  return null;
}

async function applyFinishedGoodEffects(
  store: ProductionStore,
  run: ProductionRunRecord,
  po: ProductionPurchaseOrder,
  lines: ProductionRunLineRecord[],
  actorUserId?: string,
) {
  for (const line of lines) {
    if (!line.productId) continue;
    const bom = await store.listProductBomItems(line.productId);
    if (!bom.some((item) => item.productIsOwnBrand)) continue;
    const inventoryItem = await store.findFinishedGoodInventoryItem(line.productId);
    if (!inventoryItem) continue;
    const quantityDelta = line.quantityProduced;
    await store.adjustInventory({
      inventoryItemId: inventoryItem.id,
      quantityDelta,
      referenceType: "production_run",
      referenceId: run.id,
      actorUserId,
    });
    await store.createInventoryEffect({
      id: `production_effect_${crypto.randomUUID()}`,
      productionRunId: run.id,
      inventoryItemId: inventoryItem.id,
      quantityDelta,
      effectType: "produce_finished_good",
    });
    await store.upsertInventoryLot({
      productId: line.productId,
      inventoryItemId: inventoryItem.id,
      lotNumber: line.lotNumber,
      purchaseOrderId: po.id,
      productionRunId: run.id,
      productionDate: run.productionDate,
      quantityProduced: line.quantityProduced,
    });
  }
}

async function requirePurchaseOrder(store: ProductionStore, purchaseOrderId: string) {
  const po = await store.getPurchaseOrder(purchaseOrderId);
  if (!po) throw new ProductionError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  return po;
}

async function requireRun(store: ProductionStore, productionRunId: string) {
  const run = await store.getProductionRun(productionRunId);
  if (!run) throw new ProductionError("PRODUCTION_RUN_NOT_FOUND", "Production run not found");
  return run;
}

function assertDateRange(start: string, end: string) {
  if (!start || !end) throw new ProductionError("PRODUCTION_DATES_REQUIRED", "Production start and end dates are required");
  if (end < start) throw new ProductionError("INVALID_PRODUCTION_DATES", "Production end date must be on or after the start date");
}

function assertNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ProductionError("INVALID_PRODUCTION_QUANTITY", `${field} must be zero or greater`);
  }
}

function calculateOverallWaste(materials: ProductionRunMaterialRecord[]) {
  const totalTheoretical = materials.reduce((sum, material) => sum + material.theoreticalQuantity, 0);
  const totalActual = materials.reduce((sum, material) => sum + material.actualUsedQuantity, 0);
  return wastePercent(totalTheoretical, totalActual);
}

function wastePercent(theoretical: number, actual: number) {
  if (theoretical <= 0) return 0;
  return round2(((actual - theoretical) / theoretical) * 100);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function logIdForPurchaseOrder(po: ProductionPurchaseOrder) {
  const numeric = po.poNumber.match(/\d+/)?.[0] ?? po.id.match(/\d+/)?.[0];
  return `PRD-${numeric ?? po.id}`;
}

function productionStatusFor(code: string) {
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (
    code === "INVALID_PRODUCTION_STATUS" ||
    code === "PRODUCTION_ALREADY_FINALIZED" ||
    code === "PRODUCTION_NOT_FINALIZED"
  ) return 409;
  return 400;
}
