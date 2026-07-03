import { ApiError } from "../api/errors";
import { releaseInventoryReservation, reserveInventory, type InventoryStore } from "../inventory/service";

export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "supply_chain_review"
  | "awaiting_deposit"
  | "approved_for_production"
  | "in_production"
  | "qa_review"
  | "completed"
  | "cancelled";

export type DepositStatus = "not_required" | "required" | "requested" | "received" | "waived";

export type SupplyChainStatus = "pending" | "available" | "needs_ordering" | "blocked";
export type POChangeRequestType = "change" | "cancel";
export type POChangeRequestStatus = "open" | "resolved" | "rejected";

export type PurchaseOrderLineRecord = {
  id: string;
  purchaseOrderId: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  productId: string | null;
  masterItemId: string | null;
  supplyChainStatus: SupplyChainStatus;
};

export type ProductBomItemRecord = {
  productId: string;
  masterItemId: string;
  quantityPerUnit: number;
};

export type PurchaseOrderRecord = {
  id: string;
  poNumber: string;
  customerId: string;
  status: PurchaseOrderStatus;
  depositStatus: DepositStatus;
  requestedShipDate: string | null;
  notes: string | null;
  lines: PurchaseOrderLineRecord[];
};

export type PurchaseOrderChangeRequestRecord = {
  id: string;
  purchaseOrderId: string;
  customerId: string;
  requestType: POChangeRequestType;
  message: string;
  status: POChangeRequestStatus;
  requestedByUserId?: string | null;
  resolvedByUserId?: string | null;
  resolutionNote?: string | null;
};

export type PurchaseOrderStore = {
  createPurchaseOrder(input: {
    id: string;
    poNumber: string;
    customerId: string;
    requestedShipDate: string | null;
    notes: string | null;
    createdByUserId?: string;
  }): Promise<void>;
  createPurchaseOrderLine(input: {
    id: string;
    purchaseOrderId: string;
    lineNumber: number;
    description: string;
    quantity: number;
    unitOfMeasure: string;
    productId: string | null;
    masterItemId: string | null;
  }): Promise<void>;
  listPurchaseOrders(): Promise<PurchaseOrderRecord[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrderRecord | null>;
  updatePurchaseOrderSafeFields(
    id: string,
    input: { notes?: string | null; requestedShipDate?: string | null },
  ): Promise<PurchaseOrderRecord | null>;
  updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<void>;
  updatePurchaseOrderDepositStatus(id: string, depositStatus: DepositStatus): Promise<void>;
  updateLineSupplyChainStatus(lineId: string, status: SupplyChainStatus): Promise<void>;
  createStatusEvent(input: {
    purchaseOrderId: string;
    fromStatus: PurchaseOrderStatus | null;
    toStatus: PurchaseOrderStatus;
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
  findInventoryItemByMasterItemId(masterItemId: string): Promise<{ id: string } | null>;
  listProductBomItems(productId: string): Promise<ProductBomItemRecord[]>;
  createChangeRequest?(input: {
    id: string;
    purchaseOrderId: string;
    customerId: string;
    requestType: POChangeRequestType;
    message: string;
    requestedByUserId?: string;
  }): Promise<PurchaseOrderChangeRequestRecord>;
  listChangeRequests?(purchaseOrderId: string): Promise<PurchaseOrderChangeRequestRecord[]>;
  getChangeRequest?(id: string): Promise<PurchaseOrderChangeRequestRecord | null>;
  resolveChangeRequest?(
    id: string,
    input: {
      status: Exclude<POChangeRequestStatus, "open">;
      resolvedByUserId?: string;
      resolutionNote?: string | null;
    },
  ): Promise<PurchaseOrderChangeRequestRecord | null>;
};

export class POError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, poStatusFor(code));
    this.name = "POError";
  }
}

export async function createPurchaseOrder(
  store: PurchaseOrderStore,
  input: {
    poNumber: string;
    customerId: string;
    requestedShipDate?: string | null;
    notes?: string | null;
    actorUserId?: string;
    lines: Array<{
      description: string;
      quantity: number;
      unitOfMeasure: string;
      productId?: string | null;
      masterItemId?: string | null;
    }>;
  },
): Promise<PurchaseOrderRecord> {
  if (input.lines.length === 0) {
    throw new POError("PO_LINES_REQUIRED", "Purchase order requires at least one line");
  }

  const purchaseOrderId = `po_${crypto.randomUUID()}`;
  const lines = input.lines.map((line, index): PurchaseOrderLineRecord => {
    assertPositiveQuantity(line.quantity);

    return {
      id: `po_line_${crypto.randomUUID()}`,
      purchaseOrderId,
      lineNumber: index + 1,
      description: line.description,
      quantity: line.quantity,
      unitOfMeasure: line.unitOfMeasure,
      productId: line.productId ?? null,
      masterItemId: line.masterItemId ?? null,
      supplyChainStatus: "pending",
    };
  });

  await store.createPurchaseOrder({
    id: purchaseOrderId,
    poNumber: input.poNumber,
    customerId: input.customerId,
    requestedShipDate: input.requestedShipDate ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.actorUserId,
  });

  for (const line of lines) {
    await store.createPurchaseOrderLine({
      id: line.id,
      purchaseOrderId: line.purchaseOrderId,
      lineNumber: line.lineNumber,
      description: line.description,
      quantity: line.quantity,
      unitOfMeasure: line.unitOfMeasure,
      productId: line.productId,
      masterItemId: line.masterItemId,
    });
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: purchaseOrderId,
    action: "purchase_order.created",
    metadata: { poNumber: input.poNumber, lineCount: lines.length },
  });

  return {
    id: purchaseOrderId,
    poNumber: input.poNumber,
    customerId: input.customerId,
    status: "draft",
    depositStatus: "not_required",
    requestedShipDate: input.requestedShipDate ?? null,
    notes: input.notes ?? null,
    lines,
  };
}

export async function listPurchaseOrders(store: PurchaseOrderStore) {
  return store.listPurchaseOrders();
}

export async function readPurchaseOrder(store: PurchaseOrderStore, purchaseOrderId: string) {
  return requirePO(store, purchaseOrderId);
}

export async function updatePurchaseOrderSafeFields(
  store: PurchaseOrderStore,
  input: {
    purchaseOrderId: string;
    notes?: string | null;
    requestedShipDate?: string | null;
    ignoredUnsafeFields?: string[];
    actorUserId?: string;
  },
) {
  const existing = await requirePO(store, input.purchaseOrderId);
  if (isOrdinaryEditLocked(existing.status)) {
    throw new POError(
      "PO_LOCKED_FOR_PRODUCTION",
      "Approved-for-production purchase orders cannot be edited from ordinary PO entry",
    );
  }

  const updated = await store.updatePurchaseOrderSafeFields(input.purchaseOrderId, {
    notes: input.notes,
    requestedShipDate: input.requestedShipDate,
  });

  if (!updated) {
    throw new POError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: input.purchaseOrderId,
    action: "purchase_order.updated",
    metadata: {
      notes: input.notes,
      requestedShipDate: input.requestedShipDate,
      ignoredUnsafeFields: input.ignoredUnsafeFields ?? [],
    },
  });

  return updated;
}

export async function submitPurchaseOrder(
  store: PurchaseOrderStore,
  input: { purchaseOrderId: string; actorUserId?: string },
) {
  const po = await requirePO(store, input.purchaseOrderId);

  if (po.status !== "draft") {
    throw new POError("INVALID_STATUS_TRANSITION", "Only draft purchase orders can be submitted");
  }

  await transitionPO(store, po, "supply_chain_review", "purchase_order.submitted", input.actorUserId);
  return requirePO(store, input.purchaseOrderId);
}

export async function reviewPurchaseOrderLineSupplyChain(
  store: PurchaseOrderStore,
  input: {
    purchaseOrderId: string;
    lineId: string;
    supplyChainStatus: SupplyChainStatus;
    actorUserId?: string;
  },
) {
  const po = await requirePO(store, input.purchaseOrderId);
  const line = po.lines.find((candidate) => candidate.id === input.lineId);

  if (!line) {
    throw new POError("PURCHASE_ORDER_LINE_NOT_FOUND", "Purchase order line not found");
  }
  if (!["supply_chain_review", "awaiting_deposit"].includes(po.status)) {
    throw new POError("SUPPLY_CHAIN_REVIEW_LOCKED", "Supply Chain review is only available for active review purchase orders");
  }

  await store.updateLineSupplyChainStatus(input.lineId, input.supplyChainStatus);
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order_line",
    entityId: input.lineId,
    action: "purchase_order.line_supply_chain_reviewed",
    metadata: { purchaseOrderId: input.purchaseOrderId, supplyChainStatus: input.supplyChainStatus },
  });

  return requirePO(store, input.purchaseOrderId);
}

export async function updatePurchaseOrderDepositStatus(
  store: PurchaseOrderStore,
  input: {
    purchaseOrderId: string;
    depositStatus: DepositStatus;
    actorUserId?: string;
  },
) {
  await requirePO(store, input.purchaseOrderId);
  await store.updatePurchaseOrderDepositStatus(input.purchaseOrderId, input.depositStatus);
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: input.purchaseOrderId,
    action: "purchase_order.deposit_status_updated",
    metadata: { depositStatus: input.depositStatus },
  });

  return requirePO(store, input.purchaseOrderId);
}

export async function cancelPurchaseOrder(store: PurchaseOrderStore, input: {
  purchaseOrderId: string;
  actorUserId?: string;
}) {
  const po = await requirePO(store, input.purchaseOrderId);
  if (po.status === "cancelled") return po;
  if (["in_production", "qa_review", "completed"].includes(po.status)) {
    throw new POError("PURCHASE_ORDER_CANCEL_LOCKED", "Purchase orders already in production, QA, or completed cannot be cancelled here");
  }
  await transitionPO(store, po, "cancelled", "purchase_order.cancelled", input.actorUserId);
  return requirePO(store, input.purchaseOrderId);
}

export async function approvePurchaseOrderForProduction(
  store: PurchaseOrderStore,
  inventoryStore: InventoryStore,
  input: { purchaseOrderId: string; actorUserId?: string },
) {
  const po = await requirePO(store, input.purchaseOrderId);

  if (!["not_required", "received", "waived"].includes(po.depositStatus)) {
    throw new POError("DEPOSIT_NOT_READY", "Deposit status is not ready for production");
  }

  if (po.lines.some((line) => line.supplyChainStatus !== "available")) {
    throw new POError("LINES_NOT_AVAILABLE", "All purchase order lines must be available");
  }

  const reservations: string[] = [];
  try {
    for (const requirement of await resolveInventoryRequirements(store, po.lines)) {
      const inventoryItem = await store.findInventoryItemByMasterItemId(requirement.masterItemId);

      if (!inventoryItem) {
        throw new POError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found for purchase order line");
      }

      const reservation = await reserveInventory(inventoryStore, {
        inventoryItemId: inventoryItem.id,
        purchaseOrderLineId: requirement.purchaseOrderLineId,
        quantity: requirement.quantity,
        actorUserId: input.actorUserId,
      });
      reservations.push(reservation.reservationId);
    }
  } catch (error) {
    const rollback = await Promise.allSettled(
      reservations.reverse().map((reservationId) =>
        releaseInventoryReservation(inventoryStore, { reservationId, actorUserId: input.actorUserId }),
      ),
    );
    if (rollback.some((result) => result.status === "rejected")) {
      throw new POError(
        "INVENTORY_RESERVATION_ROLLBACK_FAILED",
        "Purchase order approval failed after inventory was reserved, and automatic reservation rollback failed",
      );
    }
    throw error;
  }

  await transitionPO(
    store,
    po,
    "approved_for_production",
    "purchase_order.approved_for_production",
    input.actorUserId,
  );

  const refreshed = await requirePO(store, input.purchaseOrderId);
  return { ...refreshed, status: "approved_for_production" as const };
}

async function resolveInventoryRequirements(
  store: PurchaseOrderStore,
  lines: PurchaseOrderLineRecord[],
) {
  const requirements: Array<{ masterItemId: string; purchaseOrderLineId: string; quantity: number }> = [];

  for (const line of lines) {
    if (line.productId) {
      const bomItems = await store.listProductBomItems(line.productId);
      for (const bomItem of bomItems) {
        requirements.push({
          masterItemId: bomItem.masterItemId,
          purchaseOrderLineId: line.id,
          quantity: bomItem.quantityPerUnit * line.quantity * 1.05,
        });
      }
      if (bomItems.length > 0) {
        continue;
      }
    }

    if (line.masterItemId) {
      requirements.push({
        masterItemId: line.masterItemId,
        purchaseOrderLineId: line.id,
        quantity: line.quantity,
      });
    }
  }

  return requirements;
}

function isOrdinaryEditLocked(status: PurchaseOrderStatus) {
  return ["approved_for_production", "in_production", "qa_review", "completed"].includes(status);
}

async function transitionPO(
  store: PurchaseOrderStore,
  po: PurchaseOrderRecord,
  toStatus: PurchaseOrderStatus,
  eventType: string,
  actorUserId?: string,
) {
  await store.updatePurchaseOrderStatus(po.id, toStatus);
  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus,
    eventType,
    actorUserId,
  });
  await store.createAuditEvent({
    actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: eventType,
    metadata: { fromStatus: po.status, toStatus },
  });
}

async function requirePO(store: PurchaseOrderStore, purchaseOrderId: string) {
  const po = await store.getPurchaseOrder(purchaseOrderId);

  if (!po) {
    throw new POError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  return po;
}

function assertPositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new POError("INVALID_QUANTITY", "Quantity must be greater than zero");
  }
}

function poStatusFor(code: string) {
  if (code.endsWith("_NOT_FOUND") || code === "PURCHASE_ORDER_NOT_FOUND") {
    return 404;
  }

  if (
    code === "DEPOSIT_NOT_READY" ||
    code === "LINES_NOT_AVAILABLE" ||
    code === "INVALID_STATUS_TRANSITION" ||
    code === "INVENTORY_ITEM_NOT_FOUND" ||
    code === "PO_NUMBER_ALREADY_EXISTS" ||
    code === "PO_LOCKED_FOR_PRODUCTION" ||
    code === "SUPPLY_CHAIN_REVIEW_LOCKED" ||
    code === "INVENTORY_RESERVATION_ROLLBACK_FAILED"
  ) {
    return 409;
  }

  return 400;
}
