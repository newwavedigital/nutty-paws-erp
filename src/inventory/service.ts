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
};

export type ReceivingEntryInput = Omit<ReceivingEntryRecord, "allergens"> & {
  allergens: string[];
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
};

export type MoveEntryInput = MoveEntryRecord;

export type InventoryReservationRecord = {
  id: string;
  inventoryItemId: string;
  purchaseOrderLineId: string;
  quantity: number;
  status: "active";
};

export type InventoryMovementInput = {
  inventoryItemId: string;
  movementType: "reserved" | "released";
  quantityDelta: number;
  referenceType: "inventory_reservation";
  referenceId: string;
  actorUserId?: string;
};

export type InventoryAuditInput = {
  actorUserId?: string;
  entityType: "inventory_reservation";
  entityId: string;
  action: "inventory.reserved" | "inventory.released";
  metadata: Record<string, unknown>;
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
  releaseReservationRecord(id: string): Promise<void>;
  releaseInventoryItemAllocation(id: string, quantity: number): Promise<void>;
  listInventoryItems?(): Promise<InventoryItemSetupRecord[]>;
  createInventoryItem?(input: InventoryItemInput): Promise<InventoryItemSetupRecord>;
  updateInventoryItem?(id: string, input: InventoryItemInput): Promise<InventoryItemSetupRecord | null>;
  masterItemExists?(masterItemId: string): Promise<boolean>;
  listReceivingEntries?(): Promise<ReceivingEntryRecord[]>;
  nextReceivingSequence?(): Promise<number>;
  createReceivingEntry?(input: ReceivingEntryInput): Promise<ReceivingEntryRecord>;
  getReceivingEntryByBusinessId?(receivingId: string): Promise<ReceivingEntryRecord | null>;
  listMoveEntries?(): Promise<MoveEntryRecord[]>;
  nextMoveSequence?(): Promise<number>;
  createMoveEntry?(input: MoveEntryInput): Promise<MoveEntryRecord>;
};

export class InventoryError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, inventoryStatusFor(code));
    this.name = "InventoryError";
  }
}

function inventoryStatusFor(code: string) {
  if (code === "INVENTORY_ITEM_NOT_FOUND" || code === "RESERVATION_NOT_FOUND") {
    return 404;
  }

  if (code === "INSUFFICIENT_INVENTORY") {
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
  return store.updateInventoryItem(id, merged);
}

export async function createReceivingLogEntry(store: InventoryStore, input: Omit<ReceivingEntryInput, "id" | "receivingId" | "totalQuantity">) {
  if (!store.createReceivingEntry || !store.nextReceivingSequence || !store.masterItemExists) {
    throw new InventoryError("INVENTORY_SETUP_UNAVAILABLE", "Inventory setup is unavailable");
  }
  await assertMasterItemExists(store, input.masterItemId);
  assertNonNegative(input.packages, "packages");
  assertNonNegative(input.quantityPerPackage, "quantityPerPackage");
  const totalQuantity = +(input.packages * input.quantityPerPackage).toFixed(2);
  return store.createReceivingEntry({
    ...input,
    id: `receiving_${crypto.randomUUID()}`,
    receivingId: `RCV-${await store.nextReceivingSequence()}`,
    totalQuantity,
  });
}

export async function createMoveLogEntry(store: InventoryStore, input: Omit<MoveEntryInput, "id" | "moveId" | "masterItemId" | "inventoryItemId" | "itemName" | "lotNumber" | "quantityMoved" | "unitOfMeasure">) {
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
  });
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

  await store.releaseReservationRecord(input.reservationId);
  await store.releaseInventoryItemAllocation(reservation.inventoryItemId, reservation.quantity);
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

function assertNonNegative(quantity: number, field: string) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new InventoryError("INVALID_QUANTITY", `${field} must be zero or greater`);
  }
}
