import type { Context, Hono } from "hono";
import { ValidationError } from "../api/errors";
import { parseJsonObject } from "../api/validation";
import { ok } from "../api/responses";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuthWhenEnabled } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1ProductionStore } from "./d1-store";
import {
  finalizeProductionRun,
  listProductionLogs,
  listProductionRuns,
  reopenProductionRun,
  scheduleProductionRun,
  type ProductionStore,
} from "./service";

type StoreFactory = (db: D1Database) => ProductionStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerProductionRoutes(
  app: Hono<AppBindings>,
  createStore: StoreFactory = (db) => new D1ProductionStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/production/runs", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    void auth;
    return ok(c, await listProductionRuns(createStore(c.env?.DB)));
  });

  app.get("/api/production/logs", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    void auth;
    return ok(c, await listProductionLogs(createStore(c.env?.DB)));
  });

  app.get("/api/production/runs/:productionRunId", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    void auth;
    const run = await createStore(c.env?.DB).getProductionRun(c.req.param("productionRunId"));
    if (!run) throw new ValidationError("Production run not found", { code: "PRODUCTION_RUN_NOT_FOUND" });
    return ok(c, run);
  });

  app.post("/api/production/schedule", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const run = await scheduleProductionRun(createStore(c.env?.DB), {
      purchaseOrderId: asString(body.purchaseOrderId, "purchaseOrderId"),
      productionDate: asString(body.productionDate, "productionDate"),
      productionEndDate: asString(body.productionEndDate, "productionEndDate"),
      productionRoom: asString(body.productionRoom, "productionRoom"),
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, run);
  });

  app.patch("/api/production/runs/:productionRunId/schedule", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const run = await createStore(c.env?.DB).getProductionRun(c.req.param("productionRunId"));
    if (!run) throw new ValidationError("Production run not found", { code: "PRODUCTION_RUN_NOT_FOUND" });
    const updated = await scheduleProductionRun(createStore(c.env?.DB), {
      purchaseOrderId: run.purchaseOrderId,
      productionDate: asString(body.productionDate, "productionDate"),
      productionEndDate: asString(body.productionEndDate, "productionEndDate"),
      productionRoom: asString(body.productionRoom, "productionRoom"),
      notes: optionalString(body.notes, "notes") ?? run.notes,
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, updated);
  });

  app.post("/api/production/runs/:productionRunId/finalize", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const run = await finalizeProductionRun(createStore(c.env?.DB), {
      productionRunId: c.req.param("productionRunId"),
      actorUserId: actorUserId(auth, body),
      lines: asFinishedGoodLines(body.lines),
      materialActuals: asMaterialActuals(body.materialActuals),
      notes: optionalString(body.notes, "notes") ?? null,
    });
    return ok(c, run);
  });

  app.post("/api/production/runs/:productionRunId/reopen", async (c) => {
    const auth = await requireProductionAccess(c, createAuthStore);
    const body = await parseJsonObject(c);
    const run = await reopenProductionRun(createStore(c.env?.DB), {
      productionRunId: c.req.param("productionRunId"),
      reason: asString(body.reason, "reason"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, run);
  });
}

async function requireProductionAccess(c: Context<AppBindings>, createAuthStore: AuthStoreFactory) {
  const auth = await requireAuthWhenEnabled(c, createAuthStore(c.env?.DB));
  if (auth) requireAnyRole(auth, ["Production", "Warehousing"]);
  return auth;
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function asFinishedGoodLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError("lines must be a non-empty array", { fields: ["lines"] });
  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) throw new ValidationError(`lines[${index}] must be an object`, { fields: ["lines"] });
    const source = line as Record<string, unknown>;
    return {
      purchaseOrderLineId: asString(source.purchaseOrderLineId, `lines[${index}].purchaseOrderLineId`),
      productId: asString(source.productId, `lines[${index}].productId`),
      quantityProduced: asNumber(source.quantityProduced, `lines[${index}].quantityProduced`),
      casesProduced: asNumber(source.casesProduced, `lines[${index}].casesProduced`),
      lotNumber: asString(source.lotNumber, `lines[${index}].lotNumber`),
    };
  });
}

function asMaterialActuals(value: unknown) {
  if (!Array.isArray(value)) throw new ValidationError("materialActuals must be an array", { fields: ["materialActuals"] });
  return value.map((material, index) => {
    if (!material || typeof material !== "object" || Array.isArray(material)) throw new ValidationError(`materialActuals[${index}] must be an object`, { fields: ["materialActuals"] });
    const source = material as Record<string, unknown>;
    return {
      masterItemId: asString(source.masterItemId, `materialActuals[${index}].masterItemId`),
      productId: optionalString(source.productId, `materialActuals[${index}].productId`) ?? null,
      purchaseOrderLineId: optionalString(source.purchaseOrderLineId, `materialActuals[${index}].purchaseOrderLineId`) ?? null,
      actualUsedQuantity: asNumber(source.actualUsedQuantity, `materialActuals[${index}].actualUsedQuantity`),
      lotNumber: optionalString(source.lotNumber, `materialActuals[${index}].lotNumber`) ?? null,
    };
  });
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }
  return value;
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, field);
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`, { fields: [field] });
  }
  return value;
}
