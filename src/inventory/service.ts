import { ApiError } from "../api/errors";

export type InventoryItemRecord = {
  id: string;
  onHandQuantity: number;
  allocatedQuantity: number;
  unitOfMeasure: string;
};

export type InventoryCategory = "Ingredient" | "Packaging" | "Finished Good";

export type InventoryItemSetupRecord = InventoryItemRecord & {
  masterItemId: string;
  masterItemName?: string | null;
  itemType?: "raw_material" | "packaging" | "finished_good" | "other";
  category: InventoryCategory;
  supplierId: string | null;
  customerId: string | null;
  netAvailableQuantity: number;
  reorderPointQuantity: number;
  unitCostCents: number | null;
  leadTimeDays: number | null;
  location: string | null;
  lotNumber: string | null;
  lotsJson: string | null;
  status?: "active" | "archived";
  archivedAt?: string | null;
  archivedByUserId?: string | null;
};

export type InventoryItemInput = {
  id: string;
  masterItemId: string;
  category: InventoryCategory;
  supplierId: string | null;
  customerId: string | null;
  onHandQuantity: number;
  allocatedQuantity?: number;
  reorderPointQuantity: number;
  unitOfMeasure: string;
  unitCostCents: number | null;
  leadTimeDays: number | null;
  location: string | null;
  lotNumber: string | null;
  lotsJson: string | null;
};

export type ReceivingEntryRecord = {
  id: string;
  receivingId: string;
  masterItemId: string;
  inventoryItemId: string | null;
  itemName: string;
  date: string;
  time: string;
  packages: number;
  quantityPerPackage: number;
  totalQuantity: number;
  unitOfMeasure: string;
  lotNumber: string | null;
  allergens: string[];
  receivedBy: string | null;
  carrier: string | null;
  supplierId: string | null;
  status: "active" | "archived";
  archivedAt: string | null;
  archivedByUserId: string | null;
  updatedByUserId: string | null;
  stockAppliedQuantity: number;
  stockAppliedInventoryItemId: string | null;
};

export type ReceivingEntryInput = Omit<
  ReceivingEntryRecord,
  "allergens" | "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId" | "stockAppliedQuantity" | "stockAppliedInventoryItemId"
> & {
  allergens: string[];
  actorUserId?: string;
  status?: "active" | "archived";
  archivedAt?: string | null;
  archivedByUserId?: string | null;
  updatedByUserId?: string | null;
  stockAppliedQuantity?: number;
  stockAppliedInventoryItemId?: string | null;
};

export type MoveEntryRecord = {
  id: string;
  moveId: string;
  receivingId: string;
  masterItemId: string;
  inventoryItemId: string | null;
  itemName: string;
  lotNumber: string | null;
  date: string;
  time: string;
  caseCount: number;
  quantityPerCase: number;
  quantityMoved: number;
  unitOfMeasure: string;
  movedBy: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  status: "active" | "archived";
  archivedAt: string | null;
  archivedByUserId: string | null;
  updatedByUserId: string | null;
};

export type MoveEntryInput = Omit<MoveEntryRecord, "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId"> & {
  actorUserId?: string;
  status?: "active" | "archived";
  archivedAt?: string | null;
  archivedByUserId?: string | null;
  updatedByUserId?: string | null;
};

export type InventoryReservationRecord = {
  id: string;
  inventoryItemId: string;
  purchaseOrderLineId: string;
  quantity: number;
  status: "active";
};

export type InventoryMovementInput = {
  inventoryItemId: string;
  movementType: "received" | "adjusted" | "reserved" | "released" | "consumed";
  quantityDelta: number;
  referenceType: "receiving_entry" | "inventory_reservation" | string;
  referenceId: string;
  actorUserId?: string;
};

export type InventoryAuditInput = {
  actorUserId?: string;
  entityType: "inventory_reservation" | "receiving_entry" | "move_entry" | "inventory_item" | "inventory_adjustment";
  entityId: string;
  action: "inventory.received" | "inventory.adjusted" | "inventory.reserved" | "inventory.released" | "inventory.archived" | "receiving.archived" | "move.archived";
  metadata: Record<string, unknown>;
};

export type InventoryAdjustmentRecord = {
  id: string;
  inventoryItemId: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  reason: string;
  note: string | null;
  lotsBeforeJson: string | null;
  lotsAfterJson: string | null;
  adjustedByUserId: string | null;
  createdAt: string;
};

export type InventoryAdjustmentInput = {
  id: string;
  inventoryItemId: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  reason: string;
  note: string | null;
  lotsBeforeJson: string | null;
  lotsAfterJson: string | null;
  adjustedByUserId?: string | null;
};

export type InventoryStore = {
  getInventoryItem(id: string): Promise<InventoryItemRecord | null>;
  allocateInventoryItem(id: string, quantity: number): Promise<boolean>;
  createReservation(input: {
    id: string;
    inventoryItemId: string;
    purchaseOrderLineId: string;
    quantity: number;
    actorUserId?: string;
  }): Promise<void>;
  createMovement(input: InventoryMovementInput): Promise<void>;
  createAuditEvent(input: InventoryAuditInput): Promise<void>;
  getActiveReservation(id: string): Promise<InventoryReservationRecord | null>;
  releaseReservationRecord(id: string): Promise<boolean>;
  releaseInventoryItemAllocation(id: string, quantity: number): Promise<boolean>;
  listInventoryItems?(): Promise<InventoryItemSetupRecord[]>;
  createInventoryItem?(input: InventoryItemInput): Promise<InventoryItemSetupRecord>;
  updateInventoryItem?(id: string, input: InventoryItemInput): Promise<InventoryItemSetupRecord | null>;
  adjustInventoryOnHand?(input: { inventoryItemId: string; quantityDelta: number }): Promise<boolean>;
  archiveInventoryItem?(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<InventoryItemSetupRecord | null>;
  countActiveReservationsForInventoryItem?(id: string): Promise<number>;
  createInventoryAdjustment?(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentRecord>;
  masterItemExists?(masterItemId: string): Promise<boolean>;
  listReceivingEntries?(): Promise<ReceivingEntryRecord[]>;
  nextReceivingSequence?(): Promise<number>;
  createReceivingEntry?(input: ReceivingEntryInput): Promise<ReceivingEntryRecord>;
  getReceivingEntry?(id: string): Promise<ReceivingEntryRecord | null>;
  getReceivingEntryByBusinessId?(receivingId: string): Promise<ReceivingEntryRecord | null>;
  updateReceivingEntry?(id: string, input: ReceivingEntryInput): Promise<ReceivingEntryRecord | null>;
  archiveReceivingEntry?(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<ReceivingEntryRecord | null>;
  listMoveEntries?(): Promise<MoveEntryRecord[]>;
  nextMoveSequence?(): Promise<number>;
  createMoveEntry?(input: MoveEntryInput): Promise<MoveEntryRecord>;
  getMoveEntry?(id: string): Promise<MoveEntryRecord | null>;
  updateMoveEntry?(id: string, input: MoveEntryInput): Promise<MoveEntryRecord | null>;
  archiveMoveEntry?(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<MoveEntryRecord | null>;
};

export class InventoryError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, inventoryStatusFor(code), details);
    this.name = "InventoryError";
  }
}

function inventoryStatusFor(code: string) {
  if (code === "INVENTORY_ITEM_NOT_FOUND" || code === "RESERVATION_NOT_FOUND" || code === "RECEIVING_ENTRY_NOT_FOUND" || code === "MOVE_ENTRY_NOT_FOUND") {
    return 404;
  }

  if (
    code === "INSUFFICIENT_INVENTORY" ||
    code === "INVENTORY_STOCK_CONFLICT" ||
    code === "INVENTORY_ITEM_ARCHIVE_BLOCKED" ||
    code === "INVENTORY_ADJUSTMENT_UNAVAILABLE" ||
    code === "INVALID_INVENTORY_ADJUSTMENT_REASON" ||
    code === "RECEIVING_ENTRY_ARCHIVED" ||
    code === "MOVE_ENTRY_ARCHIVED"
  ) {
    return 409;
  }

  return 400;
}

export function calculateNetAvailable(item: Pick<InventoryItemRecord, "onHandQuantity" | "allocatedQuantity">) {
  return item.onHandQuantity - item.allocatedQuantity;
}

export function calculateInventorySignals(items: InventoryItemSetupRecord[]) {
  const rows = items.map((item) => {
    const netAvailableQuantity = calculateNetAvailable(item);
    return {
      id: item.id,
      masterItemId: item.masterItemId,
      name: item.masterItemName ?? item.id,
      onHandQuantity: item.onHandQuantity,
      allocatedQuantity: item.allocatedQuantity,
      netAvailableQuantity,
      reorderPointQuantity: item.reorderPointQuantity,
      lowStock: netAvailableQuantity <= item.reorderPointQuantity,
      overAllocated: netAvailableQuantity < 0,
      unitOfMeasure: item.unitOfMeasure,
    };
  });

  return {
    lowStockCount: rows.filter((item) => item.lowStock).length,
    overAllocationCount: rows.filter((item) => item.overAllocated).length,
    items: rows,
  };
}

export async function createInventorySetupItem(store: InventoryStore, input: InventoryItemInput) {
  if (!store.createInventoryItem || !store.masterItemExists) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  await assertMasterItemExists(store, input.masterItemId);
  assertNonNegative(input.onHandQuantity, "onHandQuantity");
  assertNonNegative(input.allocatedQuantity ?? 0, "allocatedQuantity");
  assertNonNegative(input.reorderPointQuantity, "reorderPointQuantity");
  assertOnHandCoversAllocation(input.onHandQuantity, input.allocatedQuantity ?? 0);
  return store.createInventoryItem(input);
}

export async function updateInventorySetupItem(store: InventoryStore, id: string, existing: InventoryItemSetupRecord, input: Partial<InventoryItemInput>) {
  if (!store.updateInventoryItem || !store.masterItemExists) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const merged: InventoryItemInput = {
    id,
    masterItemId: input.masterItemId ?? existing.masterItemId,
    category: input.category ?? existing.category,
    supplierId: input.supplierId ?? existing.supplierId,
    customerId: input.customerId ?? existing.customerId,
    onHandQuantity: input.onHandQuantity ?? existing.onHandQuantity,
    allocatedQuantity: input.allocatedQuantity ?? existing.allocatedQuantity,
    reorderPointQuantity: input.reorderPointQuantity ?? existing.reorderPointQuantity,
    unitOfMeasure: input.unitOfMeasure ?? existing.unitOfMeasure,
    unitCostCents: input.unitCostCents ?? existing.unitCostCents,
    leadTimeDays: input.leadTimeDays ?? existing.leadTimeDays,
    location: input.location ?? existing.location,
    lotNumber: input.lotNumber ?? existing.lotNumber,
    lotsJson: input.lotsJson ?? existing.lotsJson,
  };
  await assertMasterItemExists(store, merged.masterItemId);
  assertNonNegative(merged.onHandQuantity, "onHandQuantity");
  assertNonNegative(merged.allocatedQuantity ?? 0, "allocatedQuantity");
  assertNonNegative(merged.reorderPointQuantity, "reorderPointQuantity");
  assertOnHandCoversAllocation(merged.onHandQuantity, merged.allocatedQuantity ?? 0);
  return store.updateInventoryItem(id, merged);
}

export async function archiveInventorySetupItem(store: InventoryStore, inventoryItemId: string, actorUserId?: string, options: { force?: boolean } = {}) {
  if (!store.listInventoryItems || !store.archiveInventoryItem) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const existing = (await store.listInventoryItems()).find((item) => item.id === inventoryItemId);
  if (!existing) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  const activeReservations = await store.countActiveReservationsForInventoryItem?.(inventoryItemId) ?? 0;
  const blockers = [
    ...(existing.onHandQuantity !== 0 ? [{ field: "onHandQuantity", label: "On hand", value: existing.onHandQuantity, unit: existing.unitOfMeasure }] : []),
    ...(existing.allocatedQuantity !== 0 ? [{ field: "allocatedQuantity", label: "Allocated quantity", value: existing.allocatedQuantity, unit: existing.unitOfMeasure }] : []),
    ...(activeReservations > 0 ? [{ field: "activeReservations", label: "Active reservations", value: activeReservations, unit: "reservation(s)" }] : []),
  ];
  if (blockers.length > 0 && !options.force) {
    const itemName = existing.masterItemName || existing.id;
    const reasonText = blockers.map((blocker) => `${blocker.label} is ${blocker.value}${blocker.unit ? ` ${blocker.unit}` : ""}`).join("; ");
    throw new InventoryError(
      "INVENTORY_ITEM_ARCHIVE_BLOCKED",
      `Cannot archive ${itemName}. ${reasonText}.`,
      { itemId: existing.id, itemName, blockers },
    );
  }
  const archived = await store.archiveInventoryItem(inventoryItemId, {
    archivedAt: new Date().toISOString(),
    actorUserId,
  });
  if (!archived) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  await store.createAuditEvent({
    actorUserId,
    entityType: "inventory_item",
    entityId: inventoryItemId,
    action: "inventory.archived",
    metadata: {
      masterItemId: existing.masterItemId,
      category: existing.category,
      forced: !!options.force,
      blockers,
    },
  });
  return archived;
}

export async function adjustInventorySetupItem(
  store: InventoryStore,
  inventoryItemId: string,
  input: { onHandQuantity: number; reason: string; note?: string | null; lotsJson?: string | null; actorUserId?: string },
) {
  if (!store.listInventoryItems || !store.updateInventoryItem || !store.createInventoryAdjustment) {
    throw new InventoryError("INVENTORY_ADJUSTMENT_UNAVAILABLE", "Inventory adjustment is unavailable");
  }
  const existing = (await store.listInventoryItems()).find((item) => item.id === inventoryItemId);
  if (!existing) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  assertNonNegative(input.onHandQuantity, "onHandQuantity");
  assertOnHandCoversAllocation(input.onHandQuantity, existing.allocatedQuantity);
  const reason = input.reason.trim();
  if (!reason) throw new InventoryError("INVALID_INVENTORY_ADJUSTMENT_REASON", "Inventory adjustment reason is required");
  const quantityBefore = existing.onHandQuantity;
  const quantityAfter = input.onHandQuantity;
  const quantityDelta = +(quantityAfter - quantityBefore).toFixed(2);
  const lotsBeforeJson = existing.lotsJson;
  const lotsAfterJson = input.lotsJson ?? existing.lotsJson;
  const updated = await store.updateInventoryItem(inventoryItemId, {
    id: existing.id,
    masterItemId: existing.masterItemId,
    category: existing.category,
    supplierId: existing.supplierId,
    customerId: existing.customerId,
    onHandQuantity: quantityAfter,
    allocatedQuantity: existing.allocatedQuantity,
    reorderPointQuantity: existing.reorderPointQuantity,
    unitOfMeasure: existing.unitOfMeasure,
    unitCostCents: existing.unitCostCents,
    leadTimeDays: existing.leadTimeDays,
    location: existing.location,
    lotNumber: existing.lotNumber,
    lotsJson: lotsAfterJson,
  });
  if (!updated) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  const adjustment = await store.createInventoryAdjustment({
    id: `inventory_adjustment_${crypto.randomUUID()}`,
    inventoryItemId,
    quantityBefore,
    quantityAfter,
    quantityDelta,
    reason,
    note: input.note?.trim() || null,
    lotsBeforeJson,
    lotsAfterJson,
    adjustedByUserId: input.actorUserId ?? null,
  });
  if (quantityDelta !== 0) {
    await store.createMovement({
      inventoryItemId,
      movementType: "adjusted",
      quantityDelta,
      referenceType: "inventory_adjustment",
      referenceId: adjustment.id,
      actorUserId: input.actorUserId,
    });
  }
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "inventory_adjustment",
    entityId: adjustment.id,
    action: "inventory.adjusted",
    metadata: {
      inventoryItemId,
      quantityBefore,
      quantityAfter,
      quantityDelta,
      reason,
      note: adjustment.note,
    },
  });
  return { adjustment, item: updated };
}

export async function createReceivingLogEntry(store: InventoryStore, input: Omit<ReceivingEntryInput, "id" | "receivingId" | "totalQuantity" | "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId" | "stockAppliedQuantity" | "stockAppliedInventoryItemId">) {
  if (!store.createReceivingEntry || !store.nextReceivingSequence || !store.masterItemExists || !store.adjustInventoryOnHand) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  await assertMasterItemExists(store, input.masterItemId);
  const inventoryItemId = requireInventoryItemId(input.inventoryItemId);
  assertNonNegative(input.packages, "packages");
  assertNonNegative(input.quantityPerPackage, "quantityPerPackage");
  const totalQuantity = +(input.packages * input.quantityPerPackage).toFixed(2);
  await applyInventoryDelta(store, inventoryItemId, totalQuantity);
  const id = `receiving_${crypto.randomUUID()}`;
  await store.createMovement({
    inventoryItemId,
    movementType: "received",
    quantityDelta: totalQuantity,
    referenceType: "receiving_entry",
    referenceId: id,
    actorUserId: input.actorUserId,
  });
  return store.createReceivingEntry({
    ...input,
    id,
    receivingId: `RCV-${await store.nextReceivingSequence()}`,
    inventoryItemId,
    totalQuantity,
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: input.actorUserId ?? null,
    stockAppliedQuantity: totalQuantity,
    stockAppliedInventoryItemId: inventoryItemId,
  });
}

export async function updateReceivingLogEntry(store: InventoryStore, receivingEntryId: string, input: Partial<Omit<ReceivingEntryInput, "id" | "receivingId" | "totalQuantity" | "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId" | "stockAppliedQuantity" | "stockAppliedInventoryItemId">>) {
  if (!store.getReceivingEntry || !store.updateReceivingEntry || !store.masterItemExists || !store.adjustInventoryOnHand) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const existing = await store.getReceivingEntry(receivingEntryId);
  if (!existing) throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  if (existing.status === "archived") throw new InventoryError("RECEIVING_ENTRY_ARCHIVED", "Archived receiving entries cannot be edited");
  const merged = buildReceivingInput(existing, input);
  await assertMasterItemExists(store, merged.masterItemId);
  merged.inventoryItemId = requireInventoryItemId(merged.inventoryItemId);
  await applyReceivingStockDelta(store, existing, merged, input.actorUserId);
  const updated = await store.updateReceivingEntry(receivingEntryId, merged);
  if (!updated) throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  return updated;
}

export async function archiveReceivingLogEntry(store: InventoryStore, receivingEntryId: string, actorUserId?: string) {
  if (!store.getReceivingEntry || !store.archiveReceivingEntry || !store.adjustInventoryOnHand) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const existing = await store.getReceivingEntry(receivingEntryId);
  if (!existing) throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  if (existing.status === "archived") return existing;
  if (existing.stockAppliedInventoryItemId && existing.stockAppliedQuantity > 0) {
    const quantityDelta = -existing.stockAppliedQuantity;
    await applyInventoryDelta(store, existing.stockAppliedInventoryItemId, quantityDelta);
    await store.createMovement({
      inventoryItemId: existing.stockAppliedInventoryItemId,
      movementType: "adjusted",
      quantityDelta,
      referenceType: "receiving_entry",
      referenceId: existing.id,
      actorUserId,
    });
  }
  const archived = await store.archiveReceivingEntry(receivingEntryId, {
    archivedAt: new Date().toISOString(),
    actorUserId,
  });
  if (!archived) throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  return archived;
}

export async function createMoveLogEntry(store: InventoryStore, input: Omit<MoveEntryInput, "id" | "moveId" | "masterItemId" | "inventoryItemId" | "itemName" | "lotNumber" | "quantityMoved" | "unitOfMeasure" | "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId">) {
  if (!store.createMoveEntry || !store.nextMoveSequence || !store.getReceivingEntryByBusinessId) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const receipt = await store.getReceivingEntryByBusinessId(input.receivingId);
  if (!receipt) throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  assertNonNegative(input.caseCount, "caseCount");
  assertNonNegative(input.quantityPerCase, "quantityPerCase");
  return store.createMoveEntry({
    ...input,
    id: `move_${crypto.randomUUID()}`,
    moveId: `MV-${await store.nextMoveSequence()}`,
    masterItemId: receipt.masterItemId,
    inventoryItemId: receipt.inventoryItemId,
    itemName: receipt.itemName,
    lotNumber: receipt.lotNumber,
    quantityMoved: +(input.caseCount * input.quantityPerCase).toFixed(2),
    unitOfMeasure: receipt.unitOfMeasure,
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: input.actorUserId ?? null,
  });
}

export async function updateMoveLogEntry(store: InventoryStore, moveEntryId: string, input: Partial<Omit<MoveEntryInput, "id" | "moveId" | "masterItemId" | "inventoryItemId" | "itemName" | "lotNumber" | "quantityMoved" | "unitOfMeasure" | "status" | "archivedAt" | "archivedByUserId" | "updatedByUserId">>) {
  if (!store.getMoveEntry || !store.updateMoveEntry || !store.getReceivingEntryByBusinessId) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const existing = await store.getMoveEntry(moveEntryId);
  if (!existing) throw new InventoryError("MOVE_ENTRY_NOT_FOUND", "Move entry not found");
  if (existing.status === "archived") throw new InventoryError("MOVE_ENTRY_ARCHIVED", "Archived move entries cannot be edited");
  const receivingId = input.receivingId ?? existing.receivingId;
  const receipt = await store.getReceivingEntryByBusinessId(receivingId);
  if (!receipt || receipt.status === "archived") throw new InventoryError("RECEIVING_ENTRY_NOT_FOUND", "Receiving entry not found");
  const caseCount = input.caseCount ?? existing.caseCount;
  const quantityPerCase = input.quantityPerCase ?? existing.quantityPerCase;
  assertNonNegative(caseCount, "caseCount");
  assertNonNegative(quantityPerCase, "quantityPerCase");
  const updated = await store.updateMoveEntry(moveEntryId, {
    ...existing,
    ...input,
    receivingId,
    masterItemId: receipt.masterItemId,
    inventoryItemId: receipt.inventoryItemId,
    itemName: receipt.itemName,
    lotNumber: receipt.lotNumber,
    caseCount,
    quantityPerCase,
    quantityMoved: +(caseCount * quantityPerCase).toFixed(2),
    unitOfMeasure: receipt.unitOfMeasure,
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: input.actorUserId ?? existing.updatedByUserId,
  });
  if (!updated) throw new InventoryError("MOVE_ENTRY_NOT_FOUND", "Move entry not found");
  return updated;
}

export async function archiveMoveLogEntry(store: InventoryStore, moveEntryId: string, actorUserId?: string) {
  if (!store.getMoveEntry || !store.archiveMoveEntry) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  const existing = await store.getMoveEntry(moveEntryId);
  if (!existing) throw new InventoryError("MOVE_ENTRY_NOT_FOUND", "Move entry not found");
  if (existing.status === "archived") return existing;
  const archived = await store.archiveMoveEntry(moveEntryId, {
    archivedAt: new Date().toISOString(),
    actorUserId,
  });
  if (!archived) throw new InventoryError("MOVE_ENTRY_NOT_FOUND", "Move entry not found");
  return archived;
}

export async function getInventoryAvailability(store: InventoryStore, inventoryItemId: string) {
  const item = await store.getInventoryItem(inventoryItemId);

  if (!item) {
    throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  }

  return {
    inventoryItemId: item.id,
    onHandQuantity: item.onHandQuantity,
    allocatedQuantity: item.allocatedQuantity,
    netAvailableQuantity: calculateNetAvailable(item),
    unitOfMeasure: item.unitOfMeasure,
  };
}

export async function reserveInventory(
  store: InventoryStore,
  input: {
    inventoryItemId: string;
    purchaseOrderLineId: string;
    quantity: number;
    actorUserId?: string;
  },
) {
  assertPositiveQuantity(input.quantity);

  await getInventoryAvailability(store, input.inventoryItemId);

  const allocated = await store.allocateInventoryItem(input.inventoryItemId, input.quantity);

  if (!allocated) {
    throw new InventoryError("INSUFFICIENT_INVENTORY", "Insufficient net available inventory");
  }

  const reservationId = `reservation_${crypto.randomUUID()}`;

  await store.createReservation({
    id: reservationId,
    inventoryItemId: input.inventoryItemId,
    purchaseOrderLineId: input.purchaseOrderLineId,
    quantity: input.quantity,
    actorUserId: input.actorUserId,
  });
  await store.createMovement({
    inventoryItemId: input.inventoryItemId,
    movementType: "reserved",
    quantityDelta: input.quantity,
    referenceType: "inventory_reservation",
    referenceId: reservationId,
    actorUserId: input.actorUserId,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "inventory_reservation",
    entityId: reservationId,
    action: "inventory.reserved",
    metadata: {
      inventoryItemId: input.inventoryItemId,
      purchaseOrderLineId: input.purchaseOrderLineId,
      quantity: input.quantity,
    },
  });

  return {
    reservationId,
    inventoryItemId: input.inventoryItemId,
    purchaseOrderLineId: input.purchaseOrderLineId,
    quantity: input.quantity,
    status: "active" as const,
  };
}

export async function releaseInventoryReservation(
  store: InventoryStore,
  input: {
    reservationId: string;
    actorUserId?: string;
  },
) {
  const reservation = await store.getActiveReservation(input.reservationId);

  if (!reservation) {
    throw new InventoryError("RESERVATION_NOT_FOUND", "Active reservation not found");
  }

  const allocationReleased = await store.releaseInventoryItemAllocation(reservation.inventoryItemId, reservation.quantity);
  if (!allocationReleased) {
    throw new InventoryError("RESERVATION_RELEASE_FAILED", "Reserved inventory allocation could not be released");
  }

  const reservationReleased = await store.releaseReservationRecord(input.reservationId);
  if (!reservationReleased) {
    throw new InventoryError("RESERVATION_RELEASE_FAILED", "Reservation could not be released");
  }
  await store.createMovement({
    inventoryItemId: reservation.inventoryItemId,
    movementType: "released",
    quantityDelta: -reservation.quantity,
    referenceType: "inventory_reservation",
    referenceId: reservation.id,
    actorUserId: input.actorUserId,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "inventory_reservation",
    entityId: reservation.id,
    action: "inventory.released",
    metadata: {
      inventoryItemId: reservation.inventoryItemId,
      purchaseOrderLineId: reservation.purchaseOrderLineId,
      quantity: reservation.quantity,
    },
  });

  return {
    reservationId: reservation.id,
    inventoryItemId: reservation.inventoryItemId,
    purchaseOrderLineId: reservation.purchaseOrderLineId,
    quantity: reservation.quantity,
    status: "released" as const,
  };
}

function assertPositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new InventoryError("INVALID_QUANTITY", "Quantity must be greater than zero");
  }
}

async function assertMasterItemExists(store: InventoryStore, masterItemId: string) {
  const exists = await store.masterItemExists?.(masterItemId);
  if (!exists) throw new InventoryError("MASTER_ITEM_REQUIRED", "A valid Master List item is required");
}

function requireInventoryItemId(inventoryItemId: string | null | undefined) {
  if (!inventoryItemId) throw new InventoryError("INVENTORY_ITEM_REQUIRED", "A backend inventory item is required");
  return inventoryItemId;
}

async function applyInventoryDelta(store: InventoryStore, inventoryItemId: string, quantityDelta: number) {
  if (quantityDelta === 0) return;
  const adjusted = await store.adjustInventoryOnHand?.({ inventoryItemId, quantityDelta });
  if (!adjusted) {
    throw new InventoryError("INVENTORY_STOCK_CONFLICT", "Inventory stock correction would make on-hand quantity invalid");
  }
}

function buildReceivingInput(existing: ReceivingEntryRecord, input: Partial<ReceivingEntryInput>): ReceivingEntryInput {
  const packages = input.packages ?? existing.packages;
  const quantityPerPackage = input.quantityPerPackage ?? existing.quantityPerPackage;
  assertNonNegative(packages, "packages");
  assertNonNegative(quantityPerPackage, "quantityPerPackage");
  const inventoryItemId = input.inventoryItemId !== undefined ? input.inventoryItemId : existing.inventoryItemId;
  const totalQuantity = +(packages * quantityPerPackage).toFixed(2);
  return {
    ...existing,
    ...input,
    inventoryItemId,
    packages,
    quantityPerPackage,
    totalQuantity,
    status: "active",
    archivedAt: null,
    archivedByUserId: null,
    updatedByUserId: input.actorUserId ?? existing.updatedByUserId,
    stockAppliedQuantity: totalQuantity,
    stockAppliedInventoryItemId: inventoryItemId,
  };
}

async function applyReceivingStockDelta(store: InventoryStore, existing: ReceivingEntryRecord, updated: ReceivingEntryInput, actorUserId?: string) {
  const oldItemId = existing.stockAppliedInventoryItemId;
  const oldQuantity = existing.stockAppliedQuantity ?? 0;
  const newItemId = requireInventoryItemId(updated.stockAppliedInventoryItemId);
  const newQuantity = updated.stockAppliedQuantity ?? 0;
  if (oldItemId && oldItemId !== newItemId && oldQuantity > 0) {
    await applyInventoryDelta(store, oldItemId, -oldQuantity);
    await store.createMovement({
      inventoryItemId: oldItemId,
      movementType: "adjusted",
      quantityDelta: -oldQuantity,
      referenceType: "receiving_entry",
      referenceId: existing.id,
      actorUserId,
    });
    await applyInventoryDelta(store, newItemId, newQuantity);
    await store.createMovement({
      inventoryItemId: newItemId,
      movementType: "adjusted",
      quantityDelta: newQuantity,
      referenceType: "receiving_entry",
      referenceId: existing.id,
      actorUserId,
    });
    return;
  }
  const quantityDelta = oldItemId ? +(newQuantity - oldQuantity).toFixed(2) : newQuantity;
  await applyInventoryDelta(store, newItemId, quantityDelta);
  if (quantityDelta !== 0) {
    await store.createMovement({
      inventoryItemId: newItemId,
      movementType: "adjusted",
      quantityDelta,
      referenceType: "receiving_entry",
      referenceId: existing.id,
      actorUserId,
    });
  }
}

function assertNonNegative(quantity: number, field: string) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new InventoryError("INVALID_QUANTITY", `${field} must be zero or greater`);
  }
}

function assertOnHandCoversAllocation(onHandQuantity: number, allocatedQuantity: number) {
  if (allocatedQuantity > onHandQuantity) {
    throw new InventoryError("INSUFFICIENT_INVENTORY", "On-hand quantity cannot be below allocated quantity");
  }
}
