import { ApiError } from "../api/errors";

export type ShippingPurchaseOrderStatus = "shipping" | "completed" | string;

export type ShippingPurchaseOrderLineRecord = {
  id: string;
  productId: string | null;
  quantity: number;
  description: string;
  productIsOwnBrand: boolean;
};

export type ShippingDetailsRecord = {
  id: string;
  purchaseOrderId: string;
  bolNumber: string | null;
  proNumber: string | null;
  carrier: string | null;
  freightClass: string | null;
  notes: string | null;
  palletListJson: string | null;
  shipmentDocumentFileId: string | null;
  updatedAt: string;
};

export type ShippingPurchaseOrderRecord = {
  id: string;
  poNumber: string;
  customerId: string;
  status: ShippingPurchaseOrderStatus;
  requestedShipDate: string | null;
  notes: string | null;
  shippedAt: string | null;
  shippedByUserId: string | null;
  stockedAt: string | null;
  stockedByUserId: string | null;
  shippingNotes: string | null;
  shipmentDocumentFileId: string | null;
  lines: ShippingPurchaseOrderLineRecord[];
  shippingDetails: ShippingDetailsRecord | null;
};

export type ShipmentDocumentFileRecord = {
  id: string;
  ownerType: "purchase_order";
  ownerId: string;
  fileCategory: "shipment_document";
  status: "active";
  fileName: string;
};

export type ShippingLogRecord = {
  id: string;
  purchaseOrderId: string;
  shippingLogNumber: string;
  shippedAt: string | null;
  stockedAt: string | null;
  carrier: string | null;
  bolNumber: string | null;
  proNumber: string | null;
  palletListJson: string | null;
  weight: number | null;
  itemsSnapshotJson: string;
  createdAt: string;
};

export type ShippingStore = {
  listShippingQueue(): Promise<ShippingPurchaseOrderRecord[]>;
  listShippingLogs(): Promise<ShippingLogRecord[]>;
  getPurchaseOrder(id: string): Promise<ShippingPurchaseOrderRecord | null>;
  getActiveShipmentDocument(purchaseOrderId: string, fileId: string): Promise<ShipmentDocumentFileRecord | null>;
  findActiveShipmentDocument(purchaseOrderId: string): Promise<ShipmentDocumentFileRecord | null>;
  upsertShippingDetails(input: ShippingDetailsInput & { purchaseOrderId: string }): Promise<ShippingDetailsRecord>;
  markPurchaseOrderShippedTransaction?(input: {
    purchaseOrderId: string;
    shippedAt: string;
    shippedByUserId?: string;
    shipmentDocumentFileId: string;
    shippingNotes?: string | null;
    details: ShippingDetailsInput;
    log: {
      shippedAt: string;
      stockedAt?: string | null;
      carrier?: string | null;
      bolNumber?: string | null;
      proNumber?: string | null;
      palletListJson?: string | null;
      weight?: number | null;
      itemsSnapshotJson: string;
    };
    statusEvent: {
      fromStatus: string | null;
      toStatus: string;
      eventType: string;
      actorUserId?: string;
      note?: string;
    };
    audit: {
      actorUserId?: string;
      action: string;
      metadata: Record<string, unknown>;
    };
  }): Promise<ShippingPurchaseOrderRecord | null>;
  markPurchaseOrderShipped(input: {
    purchaseOrderId: string;
    shippedAt: string;
    shippedByUserId?: string;
    shipmentDocumentFileId: string;
    notes?: string | null;
  }): Promise<ShippingPurchaseOrderRecord | null>;
  markPurchaseOrderStockedTransaction?(input: {
    purchaseOrderId: string;
    stockedAt: string;
    stockedByUserId?: string;
    log: {
      shippedAt?: string | null;
      stockedAt: string;
      carrier?: string | null;
      bolNumber?: string | null;
      proNumber?: string | null;
      palletListJson?: string | null;
      weight?: number | null;
      itemsSnapshotJson: string;
    };
    statusEvent: {
      fromStatus: string | null;
      toStatus: string;
      eventType: string;
      actorUserId?: string;
      note?: string;
    };
    audit: {
      actorUserId?: string;
      action: string;
      metadata: Record<string, unknown>;
    };
  }): Promise<ShippingPurchaseOrderRecord | null>;
  markPurchaseOrderStocked(input: {
    purchaseOrderId: string;
    stockedAt: string;
    stockedByUserId?: string;
  }): Promise<ShippingPurchaseOrderRecord | null>;
  upsertShippingLog(input: {
    purchaseOrderId: string;
    shippedAt?: string | null;
    stockedAt?: string | null;
    carrier?: string | null;
    bolNumber?: string | null;
    proNumber?: string | null;
    palletListJson?: string | null;
    weight?: number | null;
    itemsSnapshotJson: string;
  }): Promise<ShippingLogRecord>;
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

export type ShippingDetailsInput = {
  bolNumber?: string | null;
  proNumber?: string | null;
  carrier?: string | null;
  freightClass?: string | null;
  notes?: string | null;
  palletListJson?: string | null;
  shipmentDocumentFileId?: string | null;
};

export class ShippingError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, shippingStatusFor(code), details);
    this.name = "ShippingError";
  }
}

export async function listShippingQueue(store: ShippingStore) {
  return store.listShippingQueue();
}

export async function listShippingLogs(store: ShippingStore) {
  return store.listShippingLogs();
}

export async function updateShippingDetails(
  store: ShippingStore,
  input: ShippingDetailsInput & { purchaseOrderId: string },
) {
  const po = await requireShippingPurchaseOrder(store, input.purchaseOrderId);
  if (input.shipmentDocumentFileId) {
    await requireShipmentDocument(store, po.id, input.shipmentDocumentFileId);
  }
  return store.upsertShippingDetails({
    purchaseOrderId: po.id,
    bolNumber: cleanOptional(input.bolNumber),
    proNumber: cleanOptional(input.proNumber),
    carrier: cleanOptional(input.carrier),
    freightClass: cleanOptional(input.freightClass),
    notes: cleanOptional(input.notes),
    palletListJson: cleanOptional(input.palletListJson),
    shipmentDocumentFileId: cleanOptional(input.shipmentDocumentFileId),
  });
}

export async function markPurchaseOrderShipped(
  store: ShippingStore,
  input: ShippingDetailsInput & {
    purchaseOrderId: string;
    confirmMissingCarrierBol?: boolean;
    weight?: number | null;
    actorUserId?: string;
  },
) {
  const po = await requireShippingPurchaseOrder(store, input.purchaseOrderId);
  ensureShippableStatus(po);

  const shipmentDocument = await resolveShipmentDocument(store, po, input.shipmentDocumentFileId);
  const details = mergeShippingDetails(po.shippingDetails, input);
  const missingFields = missingCarrierBolFields(details);
  if (missingFields.length > 0 && input.confirmMissingCarrierBol !== true) {
    throw new ShippingError(
      "MISSING_CARRIER_BOL_WARNING",
      "Carrier and BOL are blank. Confirm before marking shipped without them.",
      { requiresConfirmation: true, missingFields },
    );
  }

  const shippedAt = po.shippedAt ?? new Date().toISOString();
  const logInput = {
    purchaseOrderId: po.id,
    shippedAt,
    stockedAt: po.stockedAt,
    carrier: details.carrier,
    bolNumber: details.bolNumber,
    proNumber: details.proNumber,
    palletListJson: details.palletListJson,
    weight: input.weight ?? null,
    itemsSnapshotJson: JSON.stringify(snapshotItems(po)),
  };
  const statusEvent = {
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: "completed",
    eventType: "purchase_order.shipped",
    actorUserId: input.actorUserId,
    note: details.carrier ?? details.bolNumber ?? shipmentDocument.fileName,
  };
  const audit = {
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.shipped",
    metadata: {
      shipmentDocumentFileId: shipmentDocument.id,
      carrier: details.carrier,
      bolNumber: details.bolNumber,
      proNumber: details.proNumber,
      confirmedMissingCarrierBol: input.confirmMissingCarrierBol === true,
    },
  };

  if (store.markPurchaseOrderShippedTransaction && !(po.shippedAt && po.status === "completed")) {
    const updated = await store.markPurchaseOrderShippedTransaction({
      purchaseOrderId: po.id,
      shippedAt,
      shippedByUserId: input.actorUserId,
      shipmentDocumentFileId: shipmentDocument.id,
      shippingNotes: details.notes,
      details: {
        ...details,
        shipmentDocumentFileId: shipmentDocument.id,
      },
      log: logInput,
      statusEvent,
      audit,
    });
    if (!updated) {
      throw new ShippingError("SHIPPING_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
    }
    return updated;
  }

  await store.upsertShippingDetails({
    purchaseOrderId: po.id,
    ...details,
    shipmentDocumentFileId: shipmentDocument.id,
  });

  const updated =
    po.shippedAt && po.status === "completed"
      ? po
      : await store.markPurchaseOrderShipped({
          purchaseOrderId: po.id,
          shippedAt,
          shippedByUserId: input.actorUserId,
          shipmentDocumentFileId: shipmentDocument.id,
          notes: details.notes,
        });
  if (!updated) {
    throw new ShippingError("SHIPPING_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  await store.upsertShippingLog({ ...logInput, stockedAt: updated.stockedAt });

  await store.createStatusEvent(statusEvent);
  await store.createAuditEvent(audit);

  return updated;
}

export async function markPurchaseOrderStocked(
  store: ShippingStore,
  input: {
    purchaseOrderId: string;
    actorUserId?: string;
  },
) {
  const po = await requireShippingPurchaseOrder(store, input.purchaseOrderId);
  ensureInternalOwnBrand(po);
  const stockedAt = po.stockedAt ?? new Date().toISOString();
  const logInput = {
    purchaseOrderId: po.id,
    shippedAt: po.shippedAt,
    stockedAt,
    carrier: po.shippingDetails?.carrier ?? null,
    bolNumber: po.shippingDetails?.bolNumber ?? null,
    proNumber: po.shippingDetails?.proNumber ?? null,
    palletListJson: po.shippingDetails?.palletListJson ?? null,
    weight: null,
    itemsSnapshotJson: JSON.stringify(snapshotItems(po)),
  };
  const statusEvent = {
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: "completed",
    eventType: "purchase_order.stocked",
    actorUserId: input.actorUserId,
    note: "Stocked to warehouse",
  };
  const audit = {
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.stocked",
    metadata: {
      stockedAt,
    },
  };

  if (store.markPurchaseOrderStockedTransaction && !(po.stockedAt && po.status === "completed")) {
    const updated = await store.markPurchaseOrderStockedTransaction({
      purchaseOrderId: po.id,
      stockedAt,
      stockedByUserId: input.actorUserId,
      log: logInput,
      statusEvent,
      audit,
    });
    if (!updated) {
      throw new ShippingError("SHIPPING_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
    }
    return updated;
  }

  const updated =
    po.stockedAt && po.status === "completed"
      ? po
      : await store.markPurchaseOrderStocked({
          purchaseOrderId: po.id,
          stockedAt,
          stockedByUserId: input.actorUserId,
        });
  if (!updated) {
    throw new ShippingError("SHIPPING_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  await store.upsertShippingLog({ ...logInput, shippedAt: updated.shippedAt });

  await store.createStatusEvent(statusEvent);
  await store.createAuditEvent(audit);

  return updated;
}

async function requireShippingPurchaseOrder(store: ShippingStore, purchaseOrderId: string) {
  const po = await store.getPurchaseOrder(purchaseOrderId);
  if (!po) {
    throw new ShippingError("SHIPPING_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }
  return po;
}

async function requireShipmentDocument(store: ShippingStore, purchaseOrderId: string, fileId: string) {
  const file = await store.getActiveShipmentDocument(purchaseOrderId, fileId);
  if (!file) {
    throw new ShippingError("SHIPMENT_DOCUMENT_REQUIRED", "An active shipment document is required before marking shipped");
  }
  return file;
}

async function resolveShipmentDocument(
  store: ShippingStore,
  po: ShippingPurchaseOrderRecord,
  inputFileId?: string | null,
) {
  const fileId = cleanOptional(inputFileId) ?? po.shipmentDocumentFileId ?? po.shippingDetails?.shipmentDocumentFileId;
  if (fileId) {
    return requireShipmentDocument(store, po.id, fileId);
  }
  const found = await store.findActiveShipmentDocument(po.id);
  if (!found) {
    throw new ShippingError("SHIPMENT_DOCUMENT_REQUIRED", "An active shipment document is required before marking shipped");
  }
  return found;
}

function ensureShippableStatus(po: ShippingPurchaseOrderRecord) {
  if (po.status === "shipping") return;
  if (po.status === "completed" && po.shippedAt) return;
  throw new ShippingError("SHIPPING_NOT_READY", "Only shipping purchase orders can be marked shipped");
}

function ensureInternalOwnBrand(po: ShippingPurchaseOrderRecord) {
  const internalOwnBrand = po.lines.length > 0 && po.lines.every((line) => line.productId && line.productIsOwnBrand);
  if (!internalOwnBrand) {
    throw new ShippingError("STOCKING_REQUIRES_INTERNAL_OWN_BRAND", "Only internal own-brand purchase orders can be marked stocked");
  }
}

function mergeShippingDetails(existing: ShippingDetailsRecord | null, input: ShippingDetailsInput) {
  return {
    bolNumber: mergeText(input.bolNumber, existing?.bolNumber),
    proNumber: mergeText(input.proNumber, existing?.proNumber),
    carrier: mergeText(input.carrier, existing?.carrier),
    freightClass: mergeText(input.freightClass, existing?.freightClass),
    notes: mergeText(input.notes, existing?.notes),
    palletListJson: mergeText(input.palletListJson, existing?.palletListJson),
  };
}

function missingCarrierBolFields(details: { bolNumber: string | null; carrier: string | null }) {
  const missing: string[] = [];
  if (!details.bolNumber) missing.push("bolNumber");
  if (!details.carrier) missing.push("carrier");
  return missing;
}

function cleanOptional(value: string | null | undefined) {
  if (value === undefined || value === null) return undefined;
  const cleaned = value.trim();
  return cleaned === "" ? undefined : cleaned;
}

function mergeText(next: string | null | undefined, existing: string | null | undefined) {
  if (next === undefined) return existing ?? null;
  if (next === null) return null;
  const cleaned = next.trim();
  return cleaned === "" ? null : cleaned;
}

function snapshotItems(po: ShippingPurchaseOrderRecord) {
  return po.lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    quantity: line.quantity,
    description: line.description,
    productIsOwnBrand: line.productIsOwnBrand,
  }));
}

function shippingStatusFor(code: string) {
  if (code === "SHIPPING_PURCHASE_ORDER_NOT_FOUND") return 404;
  if (
    code === "SHIPMENT_DOCUMENT_REQUIRED" ||
    code === "MISSING_CARRIER_BOL_WARNING" ||
    code === "SHIPPING_NOT_READY" ||
    code === "STOCKING_REQUIRES_INTERNAL_OWN_BRAND"
  ) {
    return 409;
  }
  return 400;
}
