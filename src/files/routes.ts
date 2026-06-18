import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee, requireCustomerAccess } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1FileStore } from "./d1-store";
import {
  FileError,
  asFileCategory,
  asFileOwnerType,
  createFileMetadata,
  listActiveFilesByOwner,
  makeStorageKey,
  requireDownloadableFile,
  serializeFile,
  softDeleteFile,
  type FileMetadataRecord,
  type FileStore,
  type FileOwnerType,
} from "./service";

type FileStoreFactory = (db: D1Database) => FileStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerFileRoutes(
  app: Hono<AppBindings>,
  createStore: FileStoreFactory = (db) => new D1FileStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.post("/api/files", async (c) => {
    const db = c.env?.DB;
    const store = createStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const body = await c.req.parseBody();
    const ownerType = asFileOwnerType(body.ownerType);
    const ownerId = asString(body.ownerId, "ownerId");
    const fileCategory = asFileCategory(body.fileCategory);
    const file = asFile(body.file);

    if (auth) await authorizeOwnerAccess(auth, store, ownerType, ownerId);

    const storageKey = makeStorageKey({ ownerType, ownerId, fileCategory, fileName: file.name });
    const bytes = await file.arrayBuffer();
    await c.env.FILES.put(storageKey, bytes, {
      httpMetadata: { contentType: file.type || undefined },
    });

    const record = await createFileMetadata(store, {
      ownerType,
      ownerId,
      fileCategory,
      storageKey,
      fileName: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedByUserId: actorUserId(auth, body),
    });

    return ok(c, serializeFile(record));
  });

  app.get("/api/files", async (c) => {
    const db = c.env?.DB;
    const store = createStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const ownerType = asFileOwnerType(c.req.query("ownerType"));
    const ownerId = asString(c.req.query("ownerId"), "ownerId");

    if (auth) await authorizeOwnerAccess(auth, store, ownerType, ownerId);
    const records = await listActiveFilesByOwner(store, ownerType, ownerId);
    return ok(c, records.map(serializeFile));
  });

  app.get("/api/files/:fileId/download", async (c) => {
    const db = c.env?.DB;
    const store = createStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const record = await requireDownloadableFile(store, c.req.param("fileId"));

    if (auth) await authorizeFileAccess(auth, store, record);
    const object = await c.env.FILES.get(record.storageKey);
    if (!object) {
      throw new FileError("FILE_OBJECT_NOT_FOUND", "File object was not found in storage");
    }

    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? record.contentType ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${escapeHeaderFileName(record.fileName)}"`,
      },
    });
  });

  app.delete("/api/files/:fileId", async (c) => {
    const db = c.env?.DB;
    const store = createStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const existing = await requireDownloadableFile(store, c.req.param("fileId"));

    if (auth) await authorizeFileAccess(auth, store, existing);
    const deleted = await softDeleteFile(store, existing.id, auth?.user.id ?? null);
    return ok(c, serializeFile(deleted));
  });
}

async function authorizeFileAccess(auth: AuthContext, store: FileStore, record: FileMetadataRecord) {
  await authorizeOwnerAccess(auth, store, record.ownerType, record.ownerId);
}

async function authorizeOwnerAccess(auth: AuthContext, store: FileStore, ownerType: FileOwnerType, ownerId: string) {
  if (auth.user.userType === "employee" || auth.roles.includes("Admin")) return;

  const customerId = await store.resolveOwnerCustomerId(ownerType, ownerId);
  if (!customerId) {
    throw new FileError("FILE_OWNER_NOT_ACCESSIBLE", "File owner is not accessible to this customer");
  }

  requireCustomerAccess(auth, customerId);
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId") ?? null;
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }

  return value;
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return asString(value, field);
}

function asFile(value: unknown) {
  if (!(value instanceof File)) {
    throw new ValidationError("file must be uploaded as multipart file", { fields: ["file"] });
  }

  return value;
}

function escapeHeaderFileName(fileName: string) {
  return fileName.replace(/["\\\r\n]/g, "_");
}
