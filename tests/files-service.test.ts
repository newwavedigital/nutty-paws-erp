import { describe, expect, it } from "vitest";
import {
  FileError,
  createFileMetadata,
  listActiveFilesByOwner,
  makeStorageKey,
  softDeleteFile,
  type FileMetadataRecord,
  type FileStore,
} from "../src/files/service";

function makeRecord(overrides: Partial<FileMetadataRecord> = {}): FileMetadataRecord {
  return {
    id: "file-1",
    ownerType: "purchase_order",
    ownerId: "po-1",
    fileCategory: "po_file",
    storageProvider: "r2",
    storageKey: "files/purchase_order/po-1/po_file/file-1-upload.pdf",
    fileName: "upload.pdf",
    contentType: "application/pdf",
    sizeBytes: 10,
    uploadedByUserId: "user-1",
    createdAt: "2026-06-17T00:00:00.000Z",
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    ...overrides,
  };
}

function createStore(records: FileMetadataRecord[] = []) {
  const files = new Map(records.map((record) => [record.id, record]));
  const auditEvents: Array<{ action: string; entityId: string }> = [];
  const store: FileStore & { auditEvents: Array<{ action: string; entityId: string }> } = {
    auditEvents,
    async createFileMetadata(record) {
      files.set(record.id, record);
    },
    async listFilesByOwner(ownerType, ownerId) {
      return [...files.values()].filter((record) => record.ownerType === ownerType && record.ownerId === ownerId && record.status === "active");
    },
    async getFileMetadata(fileId) {
      return files.get(fileId) ?? null;
    },
    async softDeleteFile(fileId, input) {
      const existing = files.get(fileId);
      if (!existing || existing.status === "deleted") return null;
      const updated = {
        ...existing,
        status: "deleted" as const,
        deletedAt: "2026-06-17T00:00:00.000Z",
        deletedByUserId: input.deletedByUserId ?? null,
      };
      files.set(fileId, updated);
      return updated;
    },
    async createAuditEvent(input) {
      auditEvents.push({ action: input.action, entityId: input.entityId });
    },
    async resolveOwnerCustomerId() {
      return "customer-1";
    },
  };
  return store;
}

describe("file service", () => {
  it("creates active R2 metadata and audit event for a valid upload", async () => {
    const store = createStore();

    const record = await createFileMetadata(store, {
      ownerType: "purchase_order",
      ownerId: "po-1",
      fileCategory: "po_file",
      storageKey: "files/purchase_order/po-1/po_file/file-1-upload.pdf",
      fileName: "upload.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      uploadedByUserId: "user-1",
    });

    expect(record).toMatchObject({
      ownerType: "purchase_order",
      ownerId: "po-1",
      fileCategory: "po_file",
      storageProvider: "r2",
      storageKey: "files/purchase_order/po-1/po_file/file-1-upload.pdf",
      fileName: "upload.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      uploadedByUserId: "user-1",
      status: "active",
      deletedAt: null,
      deletedByUserId: null,
    });
    expect(record.id).toMatch(/^file_/);
    expect(store.auditEvents).toEqual([{ action: "file.uploaded", entityId: record.id }]);
  });

  it("rejects unsupported owner types and file categories", async () => {
    const store = createStore();

    await expect(createFileMetadata(store, {
      ownerType: "supplier" as never,
      ownerId: "supplier-1",
      fileCategory: "po_file",
      storageKey: "files/supplier/supplier-1/po_file/upload.pdf",
      fileName: "upload.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      uploadedByUserId: "user-1",
    })).rejects.toMatchObject({ code: "INVALID_FILE_OWNER_TYPE" });

    await expect(createFileMetadata(store, {
      ownerType: "purchase_order",
      ownerId: "po-1",
      fileCategory: "supplier_contract" as never,
      storageKey: "files/purchase_order/po-1/supplier_contract/upload.pdf",
      fileName: "upload.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      uploadedByUserId: "user-1",
    })).rejects.toMatchObject({ code: "INVALID_FILE_CATEGORY" });
  });

  it("keeps the original file name while sanitizing the storage key file segment", () => {
    const key = makeStorageKey({
      ownerType: "customer",
      ownerId: "customer-1",
      fileCategory: "customer_spec_sheet",
      fileName: " Spec Sheet (FINAL) #1.pdf ",
    });

    expect(key).toMatch(/^files\/customer\/customer-1\/customer_spec_sheet\/[0-9a-f-]+-spec-sheet-final-1\.pdf$/);
  });

  it("lists active files only and soft-deletes metadata without permanent removal", async () => {
    const active = makeRecord({ id: "file-active", fileName: "active.pdf" });
    const deleted = makeRecord({ id: "file-deleted", fileName: "deleted.pdf", status: "deleted", deletedAt: "2026-06-17T00:00:00.000Z" });
    const store = createStore([active, deleted]);

    await expect(listActiveFilesByOwner(store, "purchase_order", "po-1")).resolves.toEqual([active]);

    const result = await softDeleteFile(store, "file-active", "admin-user");

    expect(result).toMatchObject({
      id: "file-active",
      status: "deleted",
      deletedByUserId: "admin-user",
    });
    expect(store.auditEvents).toEqual([{ action: "file.deleted", entityId: "file-active" }]);
  });

  it("returns a controlled conflict when a deleted file is deleted again", async () => {
    const store = createStore([makeRecord({ id: "file-deleted", status: "deleted", deletedAt: "2026-06-17T00:00:00.000Z" })]);

    await expect(softDeleteFile(store, "file-deleted", "admin-user")).rejects.toBeInstanceOf(FileError);
    await expect(softDeleteFile(store, "file-deleted", "admin-user")).rejects.toMatchObject({
      code: "FILE_ALREADY_DELETED",
      status: 409,
    });
  });
});
