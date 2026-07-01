import { ApiError } from "../api/errors";

export type QualityPurchaseOrderStatus = "qa_review" | "shipping" | "completed" | string;
export type QualityReleaseType = "internal_own_brand" | "external_co_pack";

export type QualityPurchaseOrderLineRecord = {
  id: string;
  productId: string | null;
  quantity: number;
  description: string;
  productIsOwnBrand: boolean;
};

export type QualityPurchaseOrderRecord = {
  id: string;
  poNumber: string;
  customerId: string;
  status: QualityPurchaseOrderStatus;
  requestedShipDate: string | null;
  notes: string | null;
  qaReleasedAt: string | null;
  qaReleasedByUserId: string | null;
  qaReleaseType: QualityReleaseType | null;
  qaNotes: string | null;
  qaSkippedAt: string | null;
  qaSkippedByUserId: string | null;
  qaSkipReason: string | null;
  postShipmentCoaFileId: string | null;
  lines: QualityPurchaseOrderLineRecord[];
};

export type QualityCoaFileRecord = {
  id: string;
  ownerType: "purchase_order";
  ownerId: string;
  fileCategory: "coa";
  status: "active";
  fileName: string;
};

export type QualityStore = {
  listQualityQueue(): Promise<QualityPurchaseOrderRecord[]>;
  getPurchaseOrder(id: string): Promise<QualityPurchaseOrderRecord | null>;
  getActiveCoaFile(purchaseOrderId: string, fileId: string): Promise<QualityCoaFileRecord | null>;
  releaseInventoryLots(purchaseOrderId: string): Promise<number>;
  updatePurchaseOrderQualityRelease(input: {
    purchaseOrderId: string;
    routeStatus: "shipping" | "completed";
    releaseType: QualityReleaseType;
    releasedAt: string;
    releasedByUserId?: string;
    notes?: string | null;
  }): Promise<QualityPurchaseOrderRecord | null>;
  updatePurchaseOrderQualitySkip(input: {
    purchaseOrderId: string;
    routeStatus: "shipping" | "completed";
    skippedAt: string;
    skippedByUserId?: string;
    skipReason: string;
    notes?: string | null;
  }): Promise<QualityPurchaseOrderRecord | null>;
  attachPostShipmentCoaFile(input: {
    purchaseOrderId: string;
    fileId: string;
  }): Promise<QualityPurchaseOrderRecord | null>;
  updatePurchaseOrderQualityNotes(input: {
    purchaseOrderId: string;
    notes: string | null;
  }): Promise<QualityPurchaseOrderRecord | null>;
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

export class QualityError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, qualityStatusFor(code));
    this.name = "QualityError";
  }
}

export async function listQualityQueue(store: QualityStore) {
  return store.listQualityQueue();
}

export async function releaseQualityPurchaseOrder(
  store: QualityStore,
  input: {
    purchaseOrderId: string;
    coaFileId: string;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  const po = await requireQualityPurchaseOrder(store, input.purchaseOrderId);
  ensureQualityReviewStatus(po);
  const coaFile = await requireActiveCoaFile(store, input.purchaseOrderId, input.coaFileId);
  const routeStatus = determineRouteStatus(po);
  const releaseType = routeStatus === "completed" ? "internal_own_brand" : "external_co_pack";
  const releasedAt = new Date().toISOString();

  const updated = await store.updatePurchaseOrderQualityRelease({
    purchaseOrderId: po.id,
    routeStatus,
    releaseType,
    releasedAt,
    releasedByUserId: input.actorUserId,
    notes: input.notes ?? null,
  });
  if (!updated) {
    throw new QualityError("QUALITY_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  const releasedLotCount = await store.releaseInventoryLots(po.id);

  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: routeStatus,
    eventType: "purchase_order.qa_released",
    actorUserId: input.actorUserId,
    note: input.notes ?? coaFile.fileName,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.qa_released",
    metadata: {
      coaFileId: coaFile.id,
      routeStatus,
      releaseType,
      releasedLotCount,
      notes: input.notes ?? null,
    },
  });

  return updated;
}

export async function skipQualityPurchaseOrder(
  store: QualityStore,
  input: {
    purchaseOrderId: string;
    reason: string;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  const po = await requireQualityPurchaseOrder(store, input.purchaseOrderId);
  ensureQualityReviewStatus(po);
  const reason = requireReason(input.reason);
  const routeStatus = determineRouteStatus(po);
  const skippedAt = new Date().toISOString();

  const updated = await store.updatePurchaseOrderQualitySkip({
    purchaseOrderId: po.id,
    routeStatus,
    skippedAt,
    skippedByUserId: input.actorUserId,
    skipReason: reason,
    notes: input.notes ?? reason,
  });
  if (!updated) {
    throw new QualityError("QUALITY_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  const releasedLotCount = await store.releaseInventoryLots(po.id);

  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: routeStatus,
    eventType: "purchase_order.qa_skipped",
    actorUserId: input.actorUserId,
    note: reason,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.qa_skipped",
    metadata: {
      routeStatus,
      skipReason: reason,
      releasedLotCount,
      notes: input.notes ?? null,
    },
  });

  return updated;
}

export async function attachPostShipmentCoa(
  store: QualityStore,
  input: {
    purchaseOrderId: string;
    coaFileId: string;
    actorUserId?: string;
  },
) {
  const po = await requireQualityPurchaseOrder(store, input.purchaseOrderId);
  if (po.status !== "shipping" && po.status !== "completed") {
    throw new QualityError("POST_SHIPMENT_COA_NOT_ALLOWED", "Post-shipment COA can only be attached after QA release");
  }
  const coaFile = await requireActiveCoaFile(store, input.purchaseOrderId, input.coaFileId);
  const updated = await store.attachPostShipmentCoaFile({
    purchaseOrderId: po.id,
    fileId: coaFile.id,
  });
  if (!updated) {
    throw new QualityError("QUALITY_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }

  await store.createStatusEvent({
    purchaseOrderId: po.id,
    fromStatus: po.status,
    toStatus: po.status,
    eventType: "purchase_order.post_shipment_coa_attached",
    actorUserId: input.actorUserId,
    note: coaFile.fileName,
  });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.post_shipment_coa_attached",
    metadata: {
      coaFileId: coaFile.id,
      status: po.status,
    },
  });

  return updated;
}

export async function updateQualityNotes(
  store: QualityStore,
  input: {
    purchaseOrderId: string;
    notes?: string | null;
    actorUserId?: string;
  },
) {
  const po = await requireQualityPurchaseOrder(store, input.purchaseOrderId);
  ensureQualityReviewStatus(po);
  const updated = await store.updatePurchaseOrderQualityNotes({
    purchaseOrderId: po.id,
    notes: input.notes ?? null,
  });
  if (!updated) {
    throw new QualityError("QUALITY_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "purchase_order",
    entityId: po.id,
    action: "purchase_order.qa_notes_updated",
    metadata: { notes: input.notes ?? null },
  });
  return updated;
}

function determineRouteStatus(po: QualityPurchaseOrderRecord) {
  const internalOwnBrand = po.lines.length > 0 && po.lines.every((line) => line.productId && line.productIsOwnBrand);
  return internalOwnBrand ? "completed" : "shipping";
}

function ensureQualityReviewStatus(po: QualityPurchaseOrderRecord) {
  if (po.status !== "qa_review") {
    throw new QualityError("QUALITY_NOT_READY", "Only QA review purchase orders can be processed");
  }
}

async function requireQualityPurchaseOrder(store: QualityStore, purchaseOrderId: string) {
  const po = await store.getPurchaseOrder(purchaseOrderId);
  if (!po) {
    throw new QualityError("QUALITY_PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  }
  return po;
}

async function requireActiveCoaFile(store: QualityStore, purchaseOrderId: string, fileId: string) {
  const file = await store.getActiveCoaFile(purchaseOrderId, fileId);
  if (!file) {
    throw new QualityError("COA_REQUIRED", "A current active COA file is required");
  }
  return file;
}

function requireReason(reason: string) {
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new QualityError("QA_SKIP_REASON_REQUIRED", "A QA skip reason is required");
  }
  return reason.trim();
}

function qualityStatusFor(code: string) {
  if (code === "QUALITY_PURCHASE_ORDER_NOT_FOUND") return 404;
  if (code === "QUALITY_NOT_READY" || code === "POST_SHIPMENT_COA_NOT_ALLOWED" || code === "COA_REQUIRED") return 409;
  return 400;
}
