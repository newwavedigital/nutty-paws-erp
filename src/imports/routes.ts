import type { Context, Hono } from "hono";
import { ApiError } from "../api/errors";
import { ok } from "../api/responses";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuthWhenEnabled } from "../auth/guards";
import type { AuthStore, RoleName } from "../auth/service";
import { D1ImportStore } from "./d1-store";
import { commitImport, getImportSchema, ImportCommitConflictError, isImportModule, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, previewImport, type ImportModule, type ImportStore } from "./service";

type StoreFactory = (db: D1Database) => ImportStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

const roles: Record<ImportModule, RoleName[]> = {
  customers: ["Admin", "Sales"], products: ["Admin", "Sales"],
  suppliers: ["Admin", "Supply Chain & Procurement"],
  inventory: ["Admin", "Supply Chain & Procurement", "Warehousing"],
};

// The original source file is parsed in the browser, so sourceFileBytes is
// useful UI metadata but cannot be trusted as a server-side size boundary.
// Bound the actual JSON request before decoding or walking caller-controlled
// arrays. This leaves room for the canonical JSON representation of a 5 MB
// source file without accepting arbitrary ignored properties.
const MAX_IMPORT_REQUEST_BYTES = 6 * 1024 * 1024;

export function registerImportRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1ImportStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/imports/:module/schema", async (c) => {
    const module = moduleParam(c.req.param("module"));
    await authorize(c, createAuthStore(c.env?.DB), module);
    return ok(c, getImportSchema(module));
  });

  app.post("/api/imports/:module/preview", async (c) => {
    const module = moduleParam(c.req.param("module"));
    await authorize(c, createAuthStore(c.env?.DB), module);
    const body = await parseImportJson(c);
    validateSourceFileSize(body.sourceFileBytes);
    validateRowNumbersRequest(body.rows, body.rowNumbers);
    const prepared = await previewImport(createStore(c.env?.DB), module, body.headers, body.rows, body.rowNumbers);
    return ok(c, prepared.preview);
  });

  app.post("/api/imports/:module/commit", async (c) => {
    const module = moduleParam(c.req.param("module"));
    const auth = await authorize(c, createAuthStore(c.env?.DB), module);
    const body = await parseImportJson(c);
    validateSourceFileSize(body.sourceFileBytes);
    validateRowNumbersRequest(body.rows, body.rowNumbers);
    let preview;
    try {
      preview = await commitImport(createStore(c.env?.DB), module, body.headers, body.rows, auth?.user.id ?? null, body.rowNumbers);
    } catch (error) {
      if (error instanceof ImportCommitConflictError) {
        throw new ApiError("IMPORT_PREVIEW_STALE", error.message, 409);
      }
      throw error;
    }
    if (!preview.valid) throw new ApiError("IMPORT_VALIDATION_FAILED", "No rows were imported because the file contains errors.", 400, { preview });
    return ok(c, preview);
  });
}

async function authorize(c: Context<AppBindings>, store: AuthStore, module: ImportModule) {
  const auth = await requireAuthWhenEnabled(c, store);
  if (auth) requireAnyRole(auth, roles[module]);
  return auth;
}

function moduleParam(value: string): ImportModule {
  if (!isImportModule(value)) throw new ApiError("IMPORT_MODULE_NOT_FOUND", "Import module not found", 404);
  return value;
}

function validateSourceFileSize(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ApiError("IMPORT_FILE_SIZE_REQUIRED", "The source file size is required.", 400);
  }
  if (value > MAX_IMPORT_FILE_BYTES) throw new ApiError("IMPORT_FILE_TOO_LARGE", "Import files are limited to 5 MB.", 413);
}

function validateRowNumbersRequest(rows: unknown, rowNumbers: unknown) {
  if (!Array.isArray(rows) || !Array.isArray(rowNumbers) || rowNumbers.length !== rows.length) {
    throw new ApiError("IMPORT_ROW_NUMBERS_INVALID", "Source row numbers are required and must match the imported rows.", 400);
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError("IMPORT_ROW_LIMIT_EXCEEDED", `Import files are limited to ${MAX_IMPORT_ROWS} data rows.`, 400);
  }
  let previous = 1;
  for (const rowNumber of rowNumbers) {
    if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber <= previous) {
      throw new ApiError("IMPORT_ROW_NUMBERS_INVALID", "Source row numbers must be strictly increasing whole numbers of 2 or greater.", 400);
    }
    previous = rowNumber;
  }
}

async function parseImportJson(c: Context<AppBindings>) {
  const declaredLength = c.req.header("content-length");
  if (declaredLength !== undefined) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_IMPORT_REQUEST_BYTES) {
      throw new ApiError("IMPORT_PAYLOAD_TOO_LARGE", "The import request is too large. Reduce long cell contents or split the file.", 413);
    }
  }

  const stream = c.req.raw.body;
  if (!stream) throw new ApiError("IMPORT_PAYLOAD_INVALID", "Request body must be valid JSON", 400);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_IMPORT_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiError("IMPORT_PAYLOAD_TOO_LARGE", "The import request is too large. Reduce long cell contents or split the file.", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ApiError("IMPORT_PAYLOAD_INVALID", "Request body must be valid JSON", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError("IMPORT_PAYLOAD_INVALID", "Request body must be a JSON object", 400);
  }
  return parsed as Record<string, unknown>;
}
