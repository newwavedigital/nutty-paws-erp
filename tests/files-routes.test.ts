import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerFileRoutes } from "../src/files/routes";
import type { FileMetadataRecord, FileStore } from "../src/files/service";

class FakeR2ObjectBody {
  constructor(
    readonly body: ReadableStream,
    readonly httpMetadata: { contentType?: string },
  ) {}

  async arrayBuffer() {
    return new Response(this.body).arrayBuffer();
  }
}

function createR2() {
  const objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();
  return {
    objects,
    bucket: {
      async put(key: string, value: ArrayBuffer | Blob, options?: { httpMetadata?: { contentType?: string } }) {
        const body = value instanceof Blob ? await value.arrayBuffer() : value;
        objects.set(key, { body, contentType: options?.httpMetadata?.contentType });
        return { key };
      },
      async get(key: string) {
        const object = objects.get(key);
        if (!object) return null;
        return new FakeR2ObjectBody(new Blob([object.body]).stream(), { contentType: object.contentType });
      },
    } as unknown as R2Bucket,
  };
}

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
  const auditActions: string[] = [];
  const store: FileStore & { auditActions: string[] } = {
    auditActions,
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
      auditActions.push(input.action);
    },
    async resolveOwnerCustomerId() {
      return "customer-1";
    },
  };
  return store;
}

function createRouteApp(store: FileStore, bucket: R2Bucket) {
  const app = createApp((route) => registerFileRoutes(route, () => store), { AUTH_REQUIRED: "false" });
  return (request: Request) => app.fetch(request, { FILES: bucket } as Env);
}

describe("file routes", () => {
  it("uploads multipart file bytes to R2 and returns metadata only", async () => {
    const r2 = createR2();
    const store = createStore();
    const app = createRouteApp(store, r2.bucket);
    const form = new FormData();
    form.set("ownerType", "purchase_order");
    form.set("ownerId", "po-1");
    form.set("fileCategory", "po_file");
    form.set("actorUserId", "user-1");
    form.set("file", new File(["hello file"], "upload.pdf", { type: "application/pdf" }));

    const response = await app(new Request("http://test.local/api/files", { method: "POST", body: form }));

    expect(response.status).toBe(200);
    const body = await response.json() as { data: FileMetadataRecord };
    expect(body.data).toMatchObject({
      ownerType: "purchase_order",
      ownerId: "po-1",
      fileCategory: "po_file",
      fileName: "upload.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      status: "active",
    });
    expect(r2.objects.has(body.data.storageKey)).toBe(true);
    expect(body.data).not.toHaveProperty("body");
  });

  it("lists active files for an owner", async () => {
    const r2 = createR2();
    const active = makeRecord({ id: "file-active", fileName: "active.pdf" });
    const deleted = makeRecord({ id: "file-deleted", fileName: "deleted.pdf", status: "deleted" });
    const app = createRouteApp(createStore([active, deleted]), r2.bucket);

    const response = await app(new Request("http://test.local/api/files?ownerType=purchase_order&ownerId=po-1"));

    expect(response.status).toBe(200);
    const body = await response.json() as { data: FileMetadataRecord[] };
    expect(body.data.map((record) => record.id)).toEqual(["file-active"]);
  });

  it("downloads active file bytes with content headers", async () => {
    const r2 = createR2();
    const record = makeRecord();
    await r2.bucket.put(record.storageKey, new TextEncoder().encode("hello file"), { httpMetadata: { contentType: "application/pdf" } });
    const app = createRouteApp(createStore([record]), r2.bucket);

    const response = await app(new Request("http://test.local/api/files/file-1/download"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="upload.pdf"');
    await expect(response.text()).resolves.toBe("hello file");
  });

  it("soft-deletes metadata and blocks later download", async () => {
    const r2 = createR2();
    const record = makeRecord();
    await r2.bucket.put(record.storageKey, new TextEncoder().encode("hello file"), { httpMetadata: { contentType: "application/pdf" } });
    const store = createStore([record]);
    const app = createRouteApp(store, r2.bucket);

    const deleted = await app(new Request("http://test.local/api/files/file-1", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorUserId: "admin-user" }),
    }));

    expect(deleted.status).toBe(200);
    expect(store.auditActions).toEqual(["file.deleted"]);

    const download = await app(new Request("http://test.local/api/files/file-1/download"));
    expect(download.status).toBe(410);
  });

  it("returns controlled 404 when R2 object is missing", async () => {
    const r2 = createR2();
    const app = createRouteApp(createStore([makeRecord()]), r2.bucket);

    const response = await app(new Request("http://test.local/api/files/file-1/download"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "FILE_OBJECT_NOT_FOUND" },
    });
  });
});
