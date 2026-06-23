import { ApiError } from "../api/errors";

export type DataRecordStatus = "active" | "archived";

export type DataRecord = {
  id: string;
  module: string;
  kind: string;
  title: string;
  status: DataRecordStatus;
  payload: Record<string, unknown>;
  fileIds: string[];
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DataRecordInput = {
  id: string;
  module: string;
  kind: string;
  title: string;
  payload?: Record<string, unknown>;
  fileIds?: string[];
  actorUserId?: string | null;
};

export type DataRecordUpdateInput = {
  recordId: string;
  title?: string;
  payload?: Record<string, unknown>;
  fileIds?: string[];
  actorUserId?: string | null;
};

export type DataRecordStore = {
  listRecords(input?: { kind?: string; status?: DataRecordStatus }): Promise<DataRecord[]>;
  getRecord(recordId: string): Promise<DataRecord | null>;
  createRecord(input: DataRecordInput): Promise<DataRecord>;
  updateRecord(input: DataRecordUpdateInput): Promise<DataRecord | null>;
  archiveRecord(input: { recordId: string; actorUserId?: string | null }): Promise<DataRecord | null>;
  createAuditEvent(input: {
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export class DataRecordError extends ApiError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status);
    this.name = "DataRecordError";
  }
}

export async function listDataRecords(store: DataRecordStore, input: { kind?: string; status?: DataRecordStatus } = {}) {
  return store.listRecords(input);
}

export async function readDataRecord(store: DataRecordStore, recordId: string) {
  const record = await store.getRecord(recordId);
  if (!record) throw new DataRecordError("DATA_RECORD_NOT_FOUND", "Record not found", 404);
  return record;
}

export async function createDataRecord(store: DataRecordStore, input: DataRecordInput) {
  const record = await store.createRecord({
    ...input,
    title: requireTitle(input.title),
    payload: objectPayload(input.payload),
    fileIds: stringArray(input.fileIds),
  });

  await store.createAuditEvent({
    actorUserId: input.actorUserId ?? null,
    entityType: input.module,
    entityId: record.id,
    action: `${input.module}.created`,
    metadata: auditMetadata(record),
  });

  return record;
}

export async function updateDataRecord(store: DataRecordStore, input: DataRecordUpdateInput) {
  const existing = await store.getRecord(input.recordId);
  if (!existing) throw new DataRecordError("DATA_RECORD_NOT_FOUND", "Record not found", 404);
  if (existing.status === "archived") throw new DataRecordError("DATA_RECORD_ARCHIVED", "Archived records cannot be edited", 409);

  const record = await store.updateRecord({
    ...input,
    title: input.title === undefined ? undefined : requireTitle(input.title),
    payload: input.payload === undefined ? undefined : objectPayload(input.payload),
    fileIds: input.fileIds === undefined ? undefined : stringArray(input.fileIds),
  });

  if (!record) throw new DataRecordError("DATA_RECORD_NOT_FOUND", "Record not found", 404);

  await store.createAuditEvent({
    actorUserId: input.actorUserId ?? null,
    entityType: record.module,
    entityId: record.id,
    action: `${record.module}.updated`,
    metadata: auditMetadata(record),
  });

  return record;
}

export async function archiveDataRecord(store: DataRecordStore, recordId: string, actorUserId?: string | null) {
  const existing = await store.getRecord(recordId);
  if (!existing) throw new DataRecordError("DATA_RECORD_NOT_FOUND", "Record not found", 404);
  if (existing.status === "archived") return existing;

  const record = await store.archiveRecord({ recordId, actorUserId });
  if (!record) throw new DataRecordError("DATA_RECORD_NOT_FOUND", "Record not found", 404);

  await store.createAuditEvent({
    actorUserId: actorUserId ?? null,
    entityType: record.module,
    entityId: record.id,
    action: `${record.module}.archived`,
    metadata: auditMetadata(record),
  });

  return record;
}

export function serializeDataRecord(record: DataRecord) {
  return { ...record };
}

function requireTitle(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DataRecordError("VALIDATION_ERROR", "title must be a non-empty string");
  }
  return value.trim();
}

function objectPayload(value: unknown) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DataRecordError("VALIDATION_ERROR", "payload must be an object");
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DataRecordError("VALIDATION_ERROR", "fileIds must be an array");
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function auditMetadata(record: DataRecord) {
  return {
    id: record.id,
    module: record.module,
    kind: record.kind,
    title: record.title,
    status: record.status,
    fileIds: record.fileIds,
  };
}
