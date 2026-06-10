import { ApiError } from "../api/errors";
import { reserveInventory, type InventoryStore } from "../inventory/service";

export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "supply_chain_review"
  | "awaiting_deposit"
  | "approved_for_production"
  | "in_production"
  | "completed"
  | "cancelled";

export type DepositStatus = "not_required" | "required" | "requested" | "received" | "waived";

export type SupplyChainStatus = "pending" | "available" | "needs_ordering" | "blocked";

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

  await transitionPO(store, po, "submitted", "purchase_order.submitted", input.actorUserId);
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

  for (const line of po.lines) {
    if (!line.masterItemId) {
      continue;
    }

    const inventoryItem = await store.findInventoryItemByMasterItemId(line.masterItemId);

    if (!inventoryItem) {
      throw new POError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found for purchase order line");
    }

    await reserveInventory(inventoryStore, {
      inventoryItemId: inventoryItem.id,
      purchaseOrderLineId: line.id,
      quantity: line.quantity,
      actorUserId: input.actorUserId,
    });
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
    code === "INVENTORY_ITEM_NOT_FOUND"
  ) {
    return 409;
  }

  return 400;
}
