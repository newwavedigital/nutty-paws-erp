import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import {
  archiveDataRecord,
  createDataRecord,
  listDataRecords,
  readDataRecord,
  serializeDataRecord,
  updateDataRecord,
  type DataRecordStatus,
} from "../records/service";
import { D1SupplierStore } from "./d1-store";
import {
  payloadIncludesProductLines,
  serializeSupplierWithProductLines,
  supplierPayloadWithoutProductLines,
  supplierProductLineInputsFromPayload,
  type SupplierStore,
} from "./service";

export const SUPPLIER_KINDS = ["supplier"] as const;

type StoreFactory = (db: D1Database) => SupplierStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerSupplierRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1SupplierStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/suppliers", async (c) => {
    await requireEmployeeAccess(c, createAuthStore);
    const store = createStore(c.env?.DB);
    const kind = optionalKind(c.req.query("kind"));
    const status = optionalStatus(c.req.query("status"));
    const records = await listDataRecords(store, { kind, status });
    const enriched = await Promise.all(records.map((record) => serializeSupplierWithProductLines(store, record)));
    return ok(c, enriched.map(serializeDataRecord));
  });

  app.get("/api/suppliers/:recordId", async (c) => {
    await requireEmployeeAccess(c, createAuthStore);
    const store = createStore(c.env?.DB);
    const record = await readDataRecord(store, c.req.param("recordId"));
    return ok(c, serializeDataRecord(await serializeSupplierWithProductLines(store, record)));
  });

  app.post("/api/suppliers", async (c) => {
    const auth = await requireEmployeeAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const store = createStore(c.env?.DB);
    const payload = optionalObject(body.payload);
    const actor = actorUserId(auth, body);
    const record = await createDataRecord(store, {
      id: `supplier_${crypto.randomUUID()}`,
      module: "supplier",
      kind: optionalKind(body.kind) ?? "supplier",
      title: requiredString(body.title, "title"),
      payload: supplierPayloadWithoutProductLines(payload),
      fileIds: optionalStringArray(body.fileIds),
      actorUserId: actor,
    });
    await replaceSupplierProductLinesIfSupported(store, record.id, payload, actor, true);
    return ok(c, serializeDataRecord(await serializeSupplierWithProductLines(store, record)));
  });

  app.patch("/api/suppliers/:recordId", async (c) => {
    const auth = await requireEmployeeAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const store = createStore(c.env?.DB);
    const payload = body.payload === undefined ? undefined : optionalObject(body.payload);
    const actor = actorUserId(auth, body);
    const record = await updateDataRecord(store, {
      recordId: c.req.param("recordId"),
      title: optionalString(body.title, "title"),
      payload: payload === undefined ? undefined : supplierPayloadWithoutProductLines(payload),
      fileIds: body.fileIds === undefined ? undefined : optionalStringArray(body.fileIds),
      actorUserId: actor,
    });
    if (payload) {
      await replaceSupplierProductLinesIfSupported(store, record.id, payload, actor, false);
    }
    return ok(c, serializeDataRecord(await serializeSupplierWithProductLines(store, record)));
  });

  app.delete("/api/suppliers/:recordId", async (c) => {
    const auth = await requireEmployeeAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const record = await archiveDataRecord(createStore(c.env?.DB), c.req.param("recordId"), actorUserId(auth, body));
    return ok(c, serializeDataRecord(record));
  });
}

async function replaceSupplierProductLinesIfSupported(
  store: SupplierStore,
  supplierId: string,
  payload: Record<string, unknown>,
  actorUserId: string | null,
  replaceWhenMissing: boolean,
) {
  if (!store.replaceSupplierProductLines) return;
  if (!replaceWhenMissing && !payloadIncludesProductLines(payload)) return;
  await store.replaceSupplierProductLines(supplierId, await supplierProductLineInputsFromPayload(store, payload), actorUserId);
}

async function requireEmployeeAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireEmployee(auth);
  return auth;
}

async function optionalJsonObject(c: Context<AppBindings>) {
  if (!c.req.header("content-type")) return {};
  return parseJsonObject(c);
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId") ?? null;
}

function optionalKind(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const kind = requiredString(value, "kind");
  if (!SUPPLIER_KINDS.includes(kind as "supplier")) {
    throw new ValidationError("kind is invalid", { fields: ["kind"] });
  }
  return kind;
}

function optionalStatus(value: unknown): DataRecordStatus | undefined {
  if (value === undefined || value === null || value === "") return "active";
  if (value === "active" || value === "archived") return value;
  throw new ValidationError("status is invalid", { fields: ["status"] });
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }
  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, field);
}

function optionalObject(value: unknown) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("payload must be an object", { fields: ["payload"] });
  }
  return value as Record<string, unknown>;
}

function optionalStringArray(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError("fileIds must be an array", { fields: ["fileIds"] });
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}
