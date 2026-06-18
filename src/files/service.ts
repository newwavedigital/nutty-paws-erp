import { ApiError } from "../api/errors";

export const FILE_OWNER_TYPES = ["purchase_order", "purchase_order_line", "rd_request", "customer", "product", "inventory_item"] as const;
export const FILE_CATEGORIES = [
  "po_file",
  "coa",
  "shipment_document",
  "customer_spec_sheet",
  "co_packing_agreement",
  "product_image",
  "nutrition_facts",
  "inventory_coa",
] as const;

export type FileOwnerType = (typeof FILE_OWNER_TYPES)[number];
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export type FileStatus = "active" | "deleted";

export type FileMetadataRecord = {
  id: string;
  ownerType: FileOwnerType;
  ownerId: string;
  fileCategory: FileCategory;
  storageProvider: "r2";
  storageKey: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
  uploadedByUserId: string | null;
  createdAt: string;
  status: FileStatus;
  deletedAt: string | null;
  deletedByUserId: string | null;
};

export type FileStore = {
  createFileMetadata(record: FileMetadataRecord): Promise<void>;
  listFilesByOwner(ownerType: FileOwnerType, ownerId: string): Promise<FileMetadataRecord[]>;
  getFileMetadata(fileId: string): Promise<FileMetadataRecord | null>;
  softDeleteFile(fileId: string, input: { deletedByUserId?: string | null }): Promise<FileMetadataRecord | null>;
  createAuditEvent(input: {
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  resolveOwnerCustomerId(ownerType: FileOwnerType, ownerId: string): Promise<string | null>;
};

export class FileError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, fileStatusFor(code));
    this.name = "FileError";
  }
}

export async function createFileMetadata(
  store: FileStore,
  input: {
    ownerType: FileOwnerType;
    ownerId: string;
    fileCategory: FileCategory;
    storageKey: string;
    fileName: string;
    contentType?: string | null;
    sizeBytes: number;
    uploadedByUserId?: string | null;
  },
) {
  const ownerType = asFileOwnerType(input.ownerType);
  const fileCategory = asFileCategory(input.fileCategory);
  assertNonEmpty(input.ownerId, "ownerId");
  assertNonEmpty(input.storageKey, "storageKey");
  assertNonEmpty(input.fileName, "fileName");
  assertSize(input.sizeBytes);

  const record: FileMetadataRecord = {
    id: `file_${crypto.randomUUID()}`,
    ownerType,
    ownerId: input.ownerId,
    fileCategory,
    storageProvider: "r2",
    storageKey: input.storageKey,
    fileName: input.fileName,
    contentType: input.contentType ?? null,
    sizeBytes: input.sizeBytes,
    uploadedByUserId: input.uploadedByUserId ?? null,
    createdAt: new Date().toISOString(),
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
  };

  await store.createFileMetadata(record);
  await store.createAuditEvent({
    actorUserId: record.uploadedByUserId,
    entityType: "file_metadata",
    entityId: record.id,
    action: "file.uploaded",
    metadata: auditMetadata(record),
  });

  return record;
}

export async function listActiveFilesByOwner(store: FileStore, ownerType: FileOwnerType, ownerId: string) {
  return store.listFilesByOwner(asFileOwnerType(ownerType), ownerId);
}

export async function requireDownloadableFile(store: FileStore, fileId: string) {
  const record = await store.getFileMetadata(fileId);

  if (!record) {
    throw new FileError("FILE_NOT_FOUND", "File not found");
  }

  if (record.status === "deleted") {
    throw new FileError("FILE_DELETED", "File has been deleted");
  }

  return record;
}

export async function softDeleteFile(store: FileStore, fileId: string, deletedByUserId?: string | null) {
  const existing = await store.getFileMetadata(fileId);

  if (!existing) {
    throw new FileError("FILE_NOT_FOUND", "File not found");
  }

  if (existing.status === "deleted") {
    throw new FileError("FILE_ALREADY_DELETED", "File has already been deleted");
  }

  const deleted = await store.softDeleteFile(fileId, { deletedByUserId });
  if (!deleted) {
    throw new FileError("FILE_NOT_FOUND", "File not found");
  }

  await store.createAuditEvent({
    actorUserId: deletedByUserId ?? null,
    entityType: "file_metadata",
    entityId: deleted.id,
    action: "file.deleted",
    metadata: auditMetadata(deleted),
  });

  return deleted;
}

export function makeStorageKey(input: {
  ownerType: FileOwnerType;
  ownerId: string;
  fileCategory: FileCategory;
  fileName: string;
}) {
  const ownerType = asFileOwnerType(input.ownerType);
  const fileCategory = asFileCategory(input.fileCategory);
  assertNonEmpty(input.ownerId, "ownerId");
  assertNonEmpty(input.fileName, "fileName");

  return [
    "files",
    ownerType,
    encodePathSegment(input.ownerId),
    fileCategory,
    `${crypto.randomUUID()}-${sanitizeFileName(input.fileName)}`,
  ].join("/");
}

export function asFileOwnerType(value: unknown): FileOwnerType {
  if (typeof value !== "string" || !FILE_OWNER_TYPES.includes(value as FileOwnerType)) {
    throw new FileError("INVALID_FILE_OWNER_TYPE", "File owner type is not supported");
  }

  return value as FileOwnerType;
}

export function asFileCategory(value: unknown): FileCategory {
  if (typeof value !== "string" || !FILE_CATEGORIES.includes(value as FileCategory)) {
    throw new FileError("INVALID_FILE_CATEGORY", "File category is not supported");
  }

  return value as FileCategory;
}

export function serializeFile(record: FileMetadataRecord) {
  return { ...record };
}

function auditMetadata(record: FileMetadataRecord) {
  return {
    fileId: record.id,
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    fileCategory: record.fileCategory,
    storageKey: record.storageKey,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    status: record.status,
  };
}

function sanitizeFileName(fileName: string) {
  const lower = fileName.trim().toLowerCase();
  const withoutUnsafe = lower.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
  const trimmed = withoutUnsafe.replace(/^-+|-+$/g, "");
  return trimmed || "file";
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "-");
}

function assertNonEmpty(value: string, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new FileError("INVALID_FILE_INPUT", `${field} is required`);
  }
}

function assertSize(value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new FileError("INVALID_FILE_SIZE", "File size must be zero or greater");
  }
}

function fileStatusFor(code: string) {
  if (code === "FILE_NOT_FOUND" || code === "FILE_OBJECT_NOT_FOUND") return 404;
  if (code === "FILE_OWNER_NOT_ACCESSIBLE") return 403;
  if (code === "FILE_DELETED") return 410;
  if (code === "FILE_ALREADY_DELETED") return 409;
  return 400;
}
