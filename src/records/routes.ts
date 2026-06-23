import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1DataRecordStore } from "./d1-store";
import {
  archiveDataRecord,
  createDataRecord,
  listDataRecords,
  readDataRecord,
  serializeDataRecord,
  updateDataRecord,
  type DataRecordStatus,
  type DataRecordStore,
} from "./service";

export type DataRecordRouteConfig = {
  basePath: string;
  moduleName: string;
  tableName: string;
  defaultKind: string;
  allowedKinds: readonly string[];
  allowAnyAuthenticatedCreate?: boolean;
};

type StoreFactory = (db: D1Database) => DataRecordStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerDataRecordRoutes(
  app: Hono<AppBindings>,
  config: DataRecordRouteConfig,
  createStore: StoreFactory = (db) => new D1DataRecordStore(db, config.tableName, config.moduleName),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get(config.basePath, async (c) => {
    await requireEmployeeAccess(c, createAuthStore);
    const kind = optionalKind(c.req.query("kind"), config);
    const status = optionalStatus(c.req.query("status"));
    const records = await listDataRecords(createStore(c.env?.DB), { kind, status });
    return ok(c, records.map(serializeDataRecord));
  });

  app.get(`${config.basePath}/:recordId`, async (c) => {
    await requireEmployeeAccess(c, createAuthStore);
    return ok(c, serializeDataRecord(await readDataRecord(createStore(c.env?.DB), c.req.param("recordId"))));
  });

  app.post(config.basePath, async (c) => {
    const auth = config.allowAnyAuthenticatedCreate
      ? await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB))
      : await requireEmployeeAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const record = await createDataRecord(createStore(c.env?.DB), {
      id: `${config.moduleName}_${crypto.randomUUID()}`,
      module: config.moduleName,
      kind: optionalKind(body.kind, config) ?? config.defaultKind,
      title: requiredString(body.title, "title"),
      payload: optionalObject(body.payload),
      fileIds: optionalStringArray(body.fileIds),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, serializeDataRecord(record));
  });

  app.patch(`${config.basePath}/:recordId`, async (c) => {
    const auth = await requireEmployeeAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const record = await updateDataRecord(createStore(c.env?.DB), {
      recordId: c.req.param("recordId"),
      title: optionalString(body.title, "title"),
      payload: body.payload === undefined ? undefined : optionalObject(body.payload),
      fileIds: body.fileIds === undefined ? undefined : optionalStringArray(body.fileIds),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, serializeDataRecord(record));
  });

  app.delete(`${config.basePath}/:recordId`, async (c) => {
    const auth = await requireEmployeeAccess(c, createAuthStore);
    const body = await optionalJsonObject(c);
    const record = await archiveDataRecord(createStore(c.env?.DB), c.req.param("recordId"), actorUserId(auth, body));
    return ok(c, serializeDataRecord(record));
  });
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

function optionalKind(value: unknown, config: DataRecordRouteConfig) {
  if (value === undefined || value === null || value === "") return undefined;
  const kind = requiredString(value, "kind");
  if (!config.allowedKinds.includes(kind)) {
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
