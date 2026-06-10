export type InventoryItemRecord = {
  id: string;
  onHandQuantity: number;
  allocatedQuantity: number;
  unitOfMeasure: string;
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
import { ApiError } from "../api/errors";
