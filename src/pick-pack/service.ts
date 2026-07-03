import { ApiError } from "../api/errors";

export type PickPackOrderStatus = "open" | "picked" | "shipped" | "cancelled";
export type PickPackShippingMode = "pallet" | "parcel";

export type PickPackShortage = {
  inventoryItemId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
  shortQuantity: number;
};

export type PickPackOrderLineRecord = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  customerId: string | null;
  quantity: number;
  onHandQuantity: number;
  pickedQuantity: number;
  shortQuantity: number;
};

export type PickPackShippingDetailsRecord = {
  id: string;
  pickPackOrderId: string;
  shippingMode: PickPackShippingMode;
  carrier: string | null;
  trackingNumber: string | null;
  bolNumber: string | null;
  palletCount: number | null;
  weight: number | null;
  dimensionsJson: string;
  notes: string | null;
  updatedAt: string;
};

export type PickPackOrderRecord = {
  id: string;
  pickPackNumber: string;
  customerId: string;
  customerPoNumber: string | null;
  dateSubmitted: string;
  dateNeededToShip: string | null;
  status: PickPackOrderStatus;
  poFileId: string | null;
  notes: string | null;
  pickedAt: string | null;
  shippedAt: string | null;
  shortStockConfirmed: boolean;
  shortStock: PickPackShortage[];
  lines: PickPackOrderLineRecord[];
  shippingDetails: PickPackShippingDetailsRecord | null;
};

export type PickPackInventoryItemRecord = {
  id: string;
  itemName: string;
  sku: string | null;
  customerId: string | null;
  onHandQuantity: number;
};

export type PickPackOrderLineInput = {
  inventoryItemId: string;
  quantity: number;
};

export type PickPackOrderInput = {
  customerId: string;
  customerPoNumber?: string | null;
  dateSubmitted: string;
  dateNeededToShip?: string | null;
  poFileId?: string | null;
  notes?: string | null;
  lines: PickPackOrderLineInput[];
  actorUserId?: string;
};

export type PickPackOrderUpdateInput = PickPackOrderInput & {
  orderId: string;
};

export type PickPackPickedLineRecord = PickPackOrderLineRecord & {
  onHandQuantity: number;
};

export type PickPackInventoryAdjustment = {
  inventoryItemId: string;
  quantityDelta: number;
  referenceType: "pick_pack_order";
  referenceId: string;
};

export type PickPackStore = {
  listOrders(): Promise<PickPackOrderRecord[]>;
  getOrder(id: string): Promise<PickPackOrderRecord | null>;
  customerExists(customerId: string): Promise<boolean>;
  getFinishedGoodInventoryItem(inventoryItemId: string): Promise<PickPackInventoryItemRecord | null>;
  nextPickPackSequence(): Promise<number>;
  createOrder(input: {
    id: string;
    pickPackNumber: string;
    customerId: string;
    customerPoNumber: string | null;
    dateSubmitted: string;
    dateNeededToShip: string | null;
    poFileId: string | null;
    notes: string | null;
    lines: PickPackOrderLineRecord[];
    actorUserId?: string;
  }): Promise<PickPackOrderRecord>;
  replaceOrderLines(orderId: string, lines: PickPackOrderLineRecord[]): Promise<void>;
  updateOrder(input: {
    orderId: string;
    customerId: string;
    customerPoNumber: string | null;
    dateSubmitted: string;
    dateNeededToShip: string | null;
    poFileId: string | null;
    notes: string | null;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null>;
  completePickPackPick(input: {
    orderId: string;
    pickedAt: string;
    pickedByUserId?: string;
    shortStockConfirmed: boolean;
    shortStockJson: string;
    shortStock: PickPackShortage[];
    lines: PickPackOrderLineRecord[];
    inventoryAdjustments: PickPackInventoryAdjustment[];
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null>;
  markOrderShipped(input: {
    orderId: string;
    shippedAt: string;
    shippedByUserId?: string;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null>;
  cancelOrder(input: {
    orderId: string;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null>;
  upsertShippingDetails(input: {
    orderId: string;
    shippingMode: PickPackShippingMode;
    carrier?: string | null;
    trackingNumber?: string | null;
    bolNumber?: string | null;
    palletCount?: number | null;
    weight?: number | null;
    dimensionsJson?: string | null;
    notes?: string | null;
    actorUserId?: string;
  }): Promise<PickPackShippingDetailsRecord>;
  createStatusEvent(input: {
    orderId: string;
    fromStatus: PickPackOrderStatus | null;
    toStatus: PickPackOrderStatus;
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

export class PickPackError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, pickPackStatusFor(code), details);
    this.name = "PickPackError";
  }
}

export async function listPickPackOrders(store: PickPackStore) {
  return store.listOrders();
}

export async function createPickPackOrder(store: PickPackStore, input: PickPackOrderInput) {
  const customer = await requireCustomer(store, input.customerId);
  const lines = await normalizeLines(store, input.customerId, input.lines);
  const orderId = `pp_${crypto.randomUUID()}`;
  const pickPackNumber = `PP-${await store.nextPickPackSequence()}`;

  await store.createOrder({
    id: orderId,
    pickPackNumber,
    customerId: customer.id,
    customerPoNumber: cleanOptional(input.customerPoNumber) ?? null,
    dateSubmitted: input.dateSubmitted,
    dateNeededToShip: cleanOptional(input.dateNeededToShip) ?? null,
    poFileId: cleanOptional(input.poFileId) ?? null,
    notes: cleanOptional(input.notes) ?? null,
    lines,
    actorUserId: input.actorUserId,
  });

  const record = await store.getOrder(orderId);
  if (!record) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  return record;
}

export async function updatePickPackOrder(store: PickPackStore, input: PickPackOrderUpdateInput) {
  const existing = await requireOrder(store, input.orderId);
  if (existing.status !== "open") {
    throw new PickPackError("PICK_PACK_ORDER_LOCKED", "Only open Pick & Pack orders can be updated");
  }

  const customer = await requireCustomer(store, input.customerId);
  const lines = await normalizeLines(store, input.customerId, input.lines);

  const updated = await store.updateOrder({
    orderId: existing.id,
    customerId: customer.id,
    customerPoNumber: cleanOptional(input.customerPoNumber) ?? null,
    dateSubmitted: input.dateSubmitted,
    dateNeededToShip: cleanOptional(input.dateNeededToShip) ?? null,
    poFileId: cleanOptional(input.poFileId) ?? null,
    notes: cleanOptional(input.notes) ?? null,
    actorUserId: input.actorUserId,
  });
  if (!updated) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }

  await store.replaceOrderLines(existing.id, lines);
  const record = await store.getOrder(existing.id);
  if (!record) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  return record;
}

export async function markPickPackPicked(
  store: PickPackStore,
  input: { orderId: string; confirmShortStock?: boolean; actorUserId?: string },
) {
  const order = await requireOrder(store, input.orderId);
  if (order.status === "picked" || order.status === "shipped") {
    return order;
  }
  if (order.status !== "open") {
    throw new PickPackError("PICK_PACK_ORDER_LOCKED", "Only open Pick & Pack orders can be marked picked");
  }

  const currentLines = await hydrateCurrentPickPackStock(store, order.lines);
  const shortages = calculateShortages(currentLines);
  if (shortages.length > 0 && input.confirmShortStock !== true) {
    throw new PickPackError("SHORT_STOCK_WARNING", "Finished-goods stock is short. Confirm before marking picked.", {
      requiresConfirmation: true,
      shortages,
    });
  }

  const pickedAt = new Date().toISOString();
  const remainingByItem = new Map<string, number>();
  const pickedLines = currentLines.map((line) => {
    const available = remainingByItem.has(line.inventoryItemId)
      ? (remainingByItem.get(line.inventoryItemId) ?? 0)
      : Math.max(line.onHandQuantity, 0);
    const pickedQuantity = Math.min(line.quantity, Math.max(available, 0));
    const shortQuantity = Math.max(line.quantity - pickedQuantity, 0);
    remainingByItem.set(line.inventoryItemId, Math.max(available - pickedQuantity, 0));
    return {
      ...line,
      pickedQuantity,
      shortQuantity,
      onHandQuantity: Math.max(available - pickedQuantity, 0),
    };
  });
  const shortStock = pickedLines
    .filter((line) => line.shortQuantity > 0)
    .map((line) => ({
      inventoryItemId: line.inventoryItemId,
      itemName: line.itemName,
      requestedQuantity: line.quantity,
      availableQuantity: line.onHandQuantity + line.pickedQuantity,
      shortQuantity: line.shortQuantity,
    }));

  const inventoryAdjustments = pickedLines
    .filter((line) => line.pickedQuantity > 0)
    .map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantityDelta: -line.pickedQuantity,
      referenceType: "pick_pack_order" as const,
      referenceId: order.id,
    }));

  const updated = await store.completePickPackPick({
    orderId: order.id,
    pickedAt,
    pickedByUserId: input.actorUserId,
    shortStockConfirmed: input.confirmShortStock === true,
    shortStockJson: JSON.stringify(shortStock),
    shortStock,
    lines: pickedLines,
    inventoryAdjustments,
    actorUserId: input.actorUserId,
  });
  if (!updated) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  if (updated.status === "picked" && updated.pickedAt && updated.pickedAt !== pickedAt) {
    return updated;
  }

  await store.createStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: "picked",
    eventType: "pick_pack_order.picked",
    actorUserId: input.actorUserId,
    note: shortStock.length > 0 ? "Short stock confirmed" : "Picked in full",
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "pick_pack_order",
    entityId: order.id,
    action: "pick_pack_order.picked",
    metadata: {
      confirmShortStock: input.confirmShortStock === true,
      shortStock,
      pickedAt,
    },
  });

  const record = await store.getOrder(order.id);
  if (!record) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  return record;
}

export async function updatePickPackShippingDetails(
  store: PickPackStore,
  input: {
    orderId: string;
    shippingMode: PickPackShippingMode;
    carrier?: string | null;
    trackingNumber?: string | null;
    bolNumber?: string | null;
    palletCount?: number | null;
    weight?: number | null;
    dimensionsJson?: string | null;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  const order = await requireOrder(store, input.orderId);
  if (order.status === "cancelled") {
    throw new PickPackError("PICK_PACK_ORDER_LOCKED", "Cancelled Pick & Pack orders cannot be updated");
  }

  return store.upsertShippingDetails({
    orderId: order.id,
    shippingMode: input.shippingMode,
    carrier: cleanOptional(input.carrier),
    trackingNumber: cleanOptional(input.trackingNumber),
    bolNumber: cleanOptional(input.bolNumber),
    palletCount: normalizeOptionalNumber(input.palletCount, "palletCount"),
    weight: normalizeOptionalNumber(input.weight, "weight"),
    dimensionsJson: cleanOptional(input.dimensionsJson) ?? "{}",
    notes: cleanOptional(input.notes),
    actorUserId: input.actorUserId,
  });
}

async function hydrateCurrentPickPackStock(store: PickPackStore, lines: PickPackOrderLineRecord[]) {
  const hydrated: PickPackOrderLineRecord[] = [];
  for (const line of lines) {
    const item = await store.getFinishedGoodInventoryItem(line.inventoryItemId);
    if (!item) {
      throw new PickPackError("PICK_PACK_INVENTORY_ITEM_NOT_FOUND", "Finished-good inventory item not found");
    }
    hydrated.push({
      ...line,
      itemName: item.itemName,
      sku: item.sku,
      customerId: item.customerId ?? line.customerId ?? null,
      onHandQuantity: item.onHandQuantity,
    });
  }
  return hydrated;
}

export async function cancelPickPackOrder(
  store: PickPackStore,
  input: {
    orderId: string;
    actorUserId?: string;
  },
) {
  const order = await requireOrder(store, input.orderId);
  if (order.status === "cancelled") return order;
  if (order.status === "shipped") {
    throw new PickPackError("PICK_PACK_ORDER_LOCKED", "Shipped Pick & Pack orders cannot be cancelled here");
  }
  const updated = await store.cancelOrder({
    orderId: order.id,
    actorUserId: input.actorUserId,
  });
  if (!updated) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  await store.createStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: "cancelled",
    eventType: "pick_pack_order.cancelled",
    actorUserId: input.actorUserId,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "pick_pack_order",
    entityId: order.id,
    action: "pick_pack_order.cancelled",
    metadata: { fromStatus: order.status, toStatus: "cancelled" },
  });
  return updated;
}

export async function markPickPackShipped(
  store: PickPackStore,
  input: {
    orderId: string;
    shippingMode?: PickPackShippingMode;
    carrier?: string | null;
    trackingNumber?: string | null;
    bolNumber?: string | null;
    palletCount?: number | null;
    weight?: number | null;
    dimensionsJson?: string | null;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  const order = await requireOrder(store, input.orderId);
  if (order.status === "shipped") {
    if (hasShippingDetailsInput(input)) {
      await updatePickPackShippingDetails(store, {
        orderId: order.id,
        shippingMode: input.shippingMode ?? order.shippingDetails?.shippingMode ?? "pallet",
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        bolNumber: input.bolNumber,
        palletCount: input.palletCount,
        weight: input.weight,
        dimensionsJson: input.dimensionsJson,
        notes: input.notes,
        actorUserId: input.actorUserId,
      });
    }
    return order;
  }
  if (order.status !== "picked") {
    throw new PickPackError("PICK_PACK_ORDER_NOT_READY", "Only picked Pick & Pack orders can be marked shipped");
  }

  if (hasShippingDetailsInput(input)) {
    await updatePickPackShippingDetails(store, {
      orderId: order.id,
      shippingMode: input.shippingMode ?? order.shippingDetails?.shippingMode ?? "pallet",
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      bolNumber: input.bolNumber,
      palletCount: input.palletCount,
      weight: input.weight,
      dimensionsJson: input.dimensionsJson,
      notes: input.notes,
      actorUserId: input.actorUserId,
    });
  }

  const shippedAt = order.shippedAt ?? new Date().toISOString();
  const updated = await store.markOrderShipped({
    orderId: order.id,
    shippedAt,
    shippedByUserId: input.actorUserId,
    actorUserId: input.actorUserId,
  });
  if (!updated) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }

  await store.createStatusEvent({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: "shipped",
    eventType: "pick_pack_order.shipped",
    actorUserId: input.actorUserId,
    note: input.trackingNumber ?? input.bolNumber ?? input.carrier ?? undefined,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "pick_pack_order",
    entityId: order.id,
    action: "pick_pack_order.shipped",
    metadata: {
      shippedAt,
      carrier: input.carrier ?? null,
      trackingNumber: input.trackingNumber ?? null,
      bolNumber: input.bolNumber ?? null,
    },
  });

  const record = await store.getOrder(order.id);
  if (!record) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  return record;
}

async function requireCustomer(store: PickPackStore, customerId: string) {
  const exists = await store.customerExists(customerId);
  if (!exists) {
    throw new PickPackError("PICK_PACK_CUSTOMER_NOT_FOUND", "Customer not found");
  }
  return { id: customerId };
}

async function requireOrder(store: PickPackStore, orderId: string) {
  const order = await store.getOrder(orderId);
  if (!order) {
    throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
  }
  return order;
}

async function normalizeLines(store: PickPackStore, customerId: string, lines: PickPackOrderLineInput[]) {
  if (lines.length === 0) {
    throw new PickPackError("PICK_PACK_LINES_REQUIRED", "Pick & Pack orders require at least one line");
  }

  const hydrated: PickPackOrderLineRecord[] = [];
  for (const [index, line] of lines.entries()) {
    assertPositiveQuantity(line.quantity, `lines[${index}].quantity`);
    const item = await store.getFinishedGoodInventoryItem(line.inventoryItemId);
    if (!item) {
      throw new PickPackError("PICK_PACK_INVENTORY_ITEM_NOT_FOUND", "Finished-good inventory item not found");
    }
    if (item.customerId && item.customerId !== customerId) {
      throw new PickPackError("PICK_PACK_CUSTOMER_MISMATCH", "Finished-good item belongs to a different customer");
    }
    hydrated.push({
      id: `pp_line_${crypto.randomUUID()}`,
      inventoryItemId: item.id,
      itemName: item.itemName,
      sku: item.sku,
      customerId: item.customerId ?? null,
      quantity: line.quantity,
      onHandQuantity: item.onHandQuantity,
      pickedQuantity: 0,
      shortQuantity: 0,
    });
  }
  return hydrated;
}

function calculateShortages(lines: PickPackOrderLineRecord[]): PickPackShortage[] {
  const remainingByItem = new Map<string, number>();
  const shortages: PickPackShortage[] = [];

  for (const line of lines) {
    const available = remainingByItem.has(line.inventoryItemId)
      ? (remainingByItem.get(line.inventoryItemId) ?? 0)
      : Math.max(line.onHandQuantity, 0);
    const shortQuantity = Math.max(line.quantity - Math.max(available, 0), 0);
    if (shortQuantity > 0) {
      shortages.push({
        inventoryItemId: line.inventoryItemId,
        itemName: line.itemName,
        requestedQuantity: line.quantity,
        availableQuantity: Math.max(available, 0),
        shortQuantity,
      });
    }
    remainingByItem.set(line.inventoryItemId, Math.max(available - line.quantity, 0));
  }

  return shortages;
}

function hasShippingDetailsInput(input: { carrier?: unknown; trackingNumber?: unknown; bolNumber?: unknown; palletCount?: unknown; weight?: unknown; dimensionsJson?: unknown; notes?: unknown }) {
  return (
    input.carrier !== undefined ||
    input.trackingNumber !== undefined ||
    input.bolNumber !== undefined ||
    input.palletCount !== undefined ||
    input.weight !== undefined ||
    input.dimensionsJson !== undefined ||
    input.notes !== undefined
  );
}

function cleanOptional(value: string | null | undefined) {
  if (value === undefined || value === null) return undefined;
  const cleaned = value.trim();
  return cleaned === "" ? undefined : cleaned;
}

function normalizeOptionalNumber(value: number | null | undefined, field: string) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new PickPackError("VALIDATION_ERROR", `${field} must be zero or greater`);
  }
  return value;
}

function assertPositiveQuantity(quantity: number, field: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new PickPackError("VALIDATION_ERROR", `${field} must be greater than zero`);
  }
}

function pickPackStatusFor(code: string) {
  if (
    code === "PICK_PACK_ORDER_NOT_FOUND" ||
    code === "PICK_PACK_CUSTOMER_NOT_FOUND" ||
    code === "PICK_PACK_INVENTORY_ITEM_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    code === "SHORT_STOCK_WARNING" ||
    code === "PICK_PACK_ORDER_LOCKED" ||
    code === "PICK_PACK_ORDER_NOT_READY" ||
    code === "PICK_PACK_CUSTOMER_MISMATCH" ||
    code === "PICK_PACK_INVENTORY_CONFLICT"
  ) {
    return 409;
  }

  return 400;
}
