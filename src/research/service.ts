import { ApiError } from "../api/errors";

export type ResearchRequestStatus = "queue" | "completed" | "archived";
export type ResearchRequestListStatus = ResearchRequestStatus | "all";

export type ResearchRequestNoteRecord = {
  id: string;
  requestId: string;
  note: string;
  createdByUserId: string | null;
  createdAt: string;
};

export type ResearchRequestCommentRecord = {
  id: string;
  requestId: string;
  comment: string;
  createdByUserId: string | null;
  createdAt: string;
};

export type ResearchRequestRecord = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  status: ResearchRequestStatus;
  packagingType: string | null;
  unitsRequested: number | null;
  productDescription: string;
  submittedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  archivedByUserId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  notes: ResearchRequestNoteRecord[];
  comments: ResearchRequestCommentRecord[];
};

export type ResearchRequestCreateInput = {
  customerId: string;
  packagingType: string;
  unitsRequested: number;
  productDescription: string;
  workingNote?: string | null;
  actorUserId?: string;
};

export type ResearchRequestUpdateInput = Partial<{
  customerId: string | null | undefined;
  packagingType: string | null | undefined;
  unitsRequested: number | null | undefined;
  productDescription: string | undefined;
  actorUserId: string | undefined;
}>;

export type ResearchStore = {
  customerExists(customerId: string): Promise<boolean>;
  listResearchRequests(status: ResearchRequestListStatus): Promise<ResearchRequestRecord[]>;
  getResearchRequest(requestId: string): Promise<ResearchRequestRecord | null>;
  createResearchRequest(input: {
    id: string;
    customerId: string;
    packagingType: string;
    unitsRequested: number;
    productDescription: string;
    submittedAt: string;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord>;
  updateResearchRequest(input: {
    requestId: string;
    customerId: string | null | undefined;
    packagingType: string | null | undefined;
    unitsRequested: number | null | undefined;
    productDescription: string;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord | null>;
  addResearchRequestNote(input: {
    requestId: string;
    note: string;
    actorUserId?: string;
  }): Promise<ResearchRequestNoteRecord>;
  addResearchRequestComment(input: {
    requestId: string;
    comment: string;
    actorUserId?: string;
  }): Promise<ResearchRequestCommentRecord>;
  updateResearchRequestStatus(input: {
    requestId: string;
    status: ResearchRequestStatus;
    completedAt?: string | null;
    archivedAt?: string | null;
    archivedByUserId?: string | null;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord | null>;
  createAuditEvent(input: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export class ResearchError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, researchStatusFor(code), details);
    this.name = "ResearchError";
  }
}

export async function listResearchRequests(store: ResearchStore, status: ResearchRequestListStatus = "queue") {
  return store.listResearchRequests(status);
}

export async function readResearchRequest(store: ResearchStore, requestId: string) {
  return requireResearchRequest(store, requestId);
}

export async function createResearchRequest(store: ResearchStore, input: ResearchRequestCreateInput) {
  const customerId = requireText(input.customerId, "customerId");
  const packagingType = requireText(input.packagingType, "packagingType");
  const productDescription = requireText(input.productDescription, "productDescription");
  const unitsRequested = requirePositiveNumber(input.unitsRequested, "unitsRequested");

  await requireCustomerExists(store, customerId);

  const request = await store.createResearchRequest({
    id: `rd_request_${crypto.randomUUID()}`,
    customerId,
    packagingType,
    unitsRequested,
    productDescription,
    submittedAt: new Date().toISOString(),
    actorUserId: input.actorUserId,
  });

  if (input.workingNote) {
    await appendResearchRequestNote(store, {
      requestId: request.id,
      note: input.workingNote,
      actorUserId: input.actorUserId,
    });
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.created",
    metadata: {
      customerId,
      packagingType,
      unitsRequested,
    },
  });

  return requireResearchRequest(store, request.id);
}

export async function updateResearchRequest(store: ResearchStore, input: ResearchRequestUpdateInput & { requestId: string }) {
  const existing = await requireMutableResearchRequest(store, input.requestId);
  const customerId = input.customerId === undefined ? existing.customerId : requireText(input.customerId, "customerId");
  if (customerId) {
    await requireCustomerExists(store, customerId);
  }

  const updated = await store.updateResearchRequest({
    requestId: existing.id,
    customerId: customerId ?? existing.customerId ?? "",
    packagingType: input.packagingType === undefined ? existing.packagingType : normalizeOptionalText(input.packagingType),
    unitsRequested: input.unitsRequested === undefined ? existing.unitsRequested : normalizeOptionalNumber(input.unitsRequested),
    productDescription:
      input.productDescription === undefined ? existing.productDescription : requireText(input.productDescription, "productDescription"),
    actorUserId: input.actorUserId,
  });

  if (!updated) {
    throw new ResearchError("RESEARCH_REQUEST_NOT_FOUND", "Research request not found");
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: existing.id,
    action: "rd_request.updated",
    metadata: {
      customerId: customerId ?? existing.customerId,
      packagingType: input.packagingType ?? existing.packagingType,
      unitsRequested: input.unitsRequested ?? existing.unitsRequested,
      productDescription: input.productDescription ?? existing.productDescription,
    },
  });

  return requireResearchRequest(store, existing.id);
}

export async function appendResearchRequestNote(
  store: ResearchStore,
  input: { requestId: string; note: string; actorUserId?: string },
) {
  const request = await requireMutableResearchRequest(store, input.requestId);
  const note = requireText(input.note, "note");
  const created = await store.addResearchRequestNote({
    requestId: request.id,
    note,
    actorUserId: input.actorUserId,
  });

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.note_added",
    metadata: { noteLength: note.length },
  });

  return created;
}

export async function appendResearchRequestComment(
  store: ResearchStore,
  input: { requestId: string; comment: string; actorUserId?: string },
) {
  const request = await requireCompletedResearchRequest(store, input.requestId);
  const comment = requireText(input.comment, "comment");
  const created = await store.addResearchRequestComment({
    requestId: request.id,
    comment,
    actorUserId: input.actorUserId,
  });

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.comment_added",
    metadata: { commentLength: comment.length },
  });

  return created;
}

export async function completeResearchRequest(
  store: ResearchStore,
  input: { requestId: string; actorUserId?: string },
) {
  const request = await requireQueueResearchRequest(store, input.requestId);
  const completedAt = new Date().toISOString();
  const updated = await store.updateResearchRequestStatus({
    requestId: request.id,
    status: "completed",
    completedAt,
    archivedAt: null,
    archivedByUserId: null,
    actorUserId: input.actorUserId,
  });

  if (!updated) {
    throw new ResearchError("RESEARCH_REQUEST_NOT_FOUND", "Research request not found");
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.completed",
    metadata: { completedAt },
  });

  return requireResearchRequest(store, request.id);
}

export async function reopenResearchRequest(
  store: ResearchStore,
  input: { requestId: string; actorUserId?: string },
) {
  const request = await requireCompletedResearchRequest(store, input.requestId);
  const updated = await store.updateResearchRequestStatus({
    requestId: request.id,
    status: "queue",
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    actorUserId: input.actorUserId,
  });

  if (!updated) {
    throw new ResearchError("RESEARCH_REQUEST_NOT_FOUND", "Research request not found");
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.reopened",
    metadata: {},
  });

  return requireResearchRequest(store, request.id);
}

export async function archiveResearchRequest(
  store: ResearchStore,
  input: { requestId: string; actorUserId?: string },
) {
  const request = await requireArchiveableResearchRequest(store, input.requestId);
  const archivedAt = new Date().toISOString();
  const updated = await store.updateResearchRequestStatus({
    requestId: request.id,
    status: "archived",
    completedAt: request.completedAt,
    archivedAt,
    archivedByUserId: input.actorUserId ?? null,
    actorUserId: input.actorUserId,
  });

  if (!updated) {
    throw new ResearchError("RESEARCH_REQUEST_NOT_FOUND", "Research request not found");
  }

  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "rd_request",
    entityId: request.id,
    action: "rd_request.archived",
    metadata: { archivedAt },
  });

  return requireResearchRequest(store, request.id);
}

export async function exportResearchRequestsCsv(store: ResearchStore, status: ResearchRequestListStatus = "queue") {
  const rows = await store.listResearchRequests(status);
  const header = [
    "requestId",
    "customerId",
    "customerName",
    "status",
    "packagingType",
    "unitsRequested",
    "productDescription",
    "submittedAt",
    "completedAt",
    "archivedAt",
    "workingNotesCount",
    "postProductionCommentsCount",
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.customerId ?? "",
      row.customerName ?? "",
      row.status,
      row.packagingType ?? "",
      row.unitsRequested ?? "",
      row.productDescription,
      row.submittedAt ?? "",
      row.completedAt ?? "",
      row.archivedAt ?? "",
      row.notes.length,
      row.comments.length,
    ]
      .map(csvCell)
      .join(","),
  );

  return [header.map(csvCell).join(","), ...lines].join("\n");
}

async function requireResearchRequest(store: ResearchStore, requestId: string) {
  const request = await store.getResearchRequest(requestId);
  if (!request) {
    throw new ResearchError("RESEARCH_REQUEST_NOT_FOUND", "Research request not found");
  }
  return request;
}

async function requireMutableResearchRequest(store: ResearchStore, requestId: string) {
  const request = await requireResearchRequest(store, requestId);
  if (request.status === "archived") {
    throw new ResearchError("RESEARCH_REQUEST_ARCHIVED", "Archived research requests cannot be modified");
  }
  return request;
}

async function requireQueueResearchRequest(store: ResearchStore, requestId: string) {
  const request = await requireResearchRequest(store, requestId);
  if (request.status !== "queue") {
    throw new ResearchError("RESEARCH_REQUEST_NOT_QUEUE", "Only queue research requests can be completed");
  }
  return request;
}

async function requireCompletedResearchRequest(store: ResearchStore, requestId: string) {
  const request = await requireResearchRequest(store, requestId);
  if (request.status !== "completed") {
    throw new ResearchError("RESEARCH_REQUEST_NOT_COMPLETED", "Only completed research requests can use this action");
  }
  return request;
}

async function requireArchiveableResearchRequest(store: ResearchStore, requestId: string) {
  const request = await requireResearchRequest(store, requestId);
  if (request.status === "archived") {
    return request;
  }
  return request;
}

async function requireCustomerExists(store: ResearchStore, customerId: string) {
  const exists = await store.customerExists(customerId);
  if (!exists) {
    throw new ResearchError("RESEARCH_CUSTOMER_NOT_FOUND", "Customer not found");
  }
}

function requireText(value: string | null | undefined, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ResearchError("RESEARCH_VALIDATION_ERROR", `${field} must be a non-empty string`, { fields: [field] });
  }
  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.trim();
  return cleaned === "" ? null : cleaned;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requirePositiveNumber(value, "unitsRequested");
}

function requirePositiveNumber(value: number | null | undefined, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ResearchError("RESEARCH_VALIDATION_ERROR", `${field} must be greater than zero`, { fields: [field] });
  }
  return value;
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function researchStatusFor(code: string) {
  if (code === "RESEARCH_REQUEST_NOT_FOUND" || code === "RESEARCH_CUSTOMER_NOT_FOUND") return 404;
  if (
    code === "RESEARCH_REQUEST_ARCHIVED" ||
    code === "RESEARCH_REQUEST_NOT_QUEUE" ||
    code === "RESEARCH_REQUEST_NOT_COMPLETED"
  ) {
    return 409;
  }
  return 400;
}
