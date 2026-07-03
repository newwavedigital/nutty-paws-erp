import type { Context, Hono } from "hono";
import { ok } from "../api/responses";
import { ApiError, ValidationError } from "../api/errors";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { hasCustomerAccess, requireAnyRole, requireAuthWhenEnabled, requireCustomerAccess } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1CatalogStore } from "../catalog/d1-store";
import type { CatalogStore } from "../catalog/service";
import { D1InventoryStore } from "../inventory/d1-store";
import type { InventoryStore } from "../inventory/service";
import {
  notifySubmittedPurchaseOrder,
  type NotificationEnv,
  type NotifySubmittedPurchaseOrder,
  type SubmittedPONotificationResult,
} from "../notifications/service";
import { D1PurchaseOrderStore } from "./d1-store";
import {
  approvePurchaseOrderForProduction,
  cancelPurchaseOrder,
  createPurchaseOrder,
  listPurchaseOrders,
  readPurchaseOrder,
  reviewPurchaseOrderLineSupplyChain,
  submitPurchaseOrder,
  updatePurchaseOrderDepositStatus,
  updatePurchaseOrderSafeFields,
  type DepositStatus,
  type POChangeRequestStatus,
  type POChangeRequestType,
  POError,
  type PurchaseOrderRecord,
  type PurchaseOrderStore,
  type SupplyChainStatus,
} from "./service";

type POStoreFactory = (db: D1Database) => PurchaseOrderStore;
type InventoryStoreFactory = (db: D1Database) => InventoryStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;
type CatalogStoreFactory = (db: D1Database) => CatalogStore;

const depositStatuses = new Set<DepositStatus>(["not_required", "required", "requested", "received", "waived"]);
const supplyChainStatuses = new Set<SupplyChainStatus>(["pending", "available", "needs_ordering", "blocked"]);

export function registerPurchaseOrderRoutes(
  app: Hono<AppBindings>,
  createPOStore: POStoreFactory = (db) => new D1PurchaseOrderStore(db),
  createInventoryStore: InventoryStoreFactory = (db) => new D1InventoryStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
  notifySubmittedPO: NotifySubmittedPurchaseOrder = notifySubmittedPurchaseOrder,
  createCatalogStore: CatalogStoreFactory = (db) => new D1CatalogStore(db),
) {
  app.get("/api/purchase-orders", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const records = await listPurchaseOrders(createPOStore(db));
    return ok(c, scopePurchaseOrdersForAuth(records, auth));
  });

  app.post("/api/purchase-orders", async (c) => {
    const db = c.env?.DB;
    const poStore = createPOStore(db);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["poNumber", "customerId", "lines"]);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const poNumber = asString(fields.poNumber, "poNumber");
    const customerId = asString(fields.customerId, "customerId");
    if (auth) authorizePurchaseOrderCreate(auth, customerId);
    await assertUniquePONumber(poStore, poNumber);
    const rawLines = asLines(fields.lines);
    const lines = auth?.user.userType === "customer"
      ? await normalizeCustomerPOLines(auth, customerId, rawLines, createCatalogStore(db))
      : rawLines;

    const po = await createPurchaseOrder(poStore, {
      poNumber,
      customerId,
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      notes: optionalString(body.notes, "notes") ?? null,
      actorUserId: actorUserId(auth, body),
      lines,
    });

    return ok(c, po);
  });

  app.get("/api/purchase-orders/:purchaseOrderId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const po = await readPurchaseOrder(createPOStore(db), c.req.param("purchaseOrderId"));
    if (auth) authorizePurchaseOrderRead(auth, po.customerId);
    return ok(c, po);
  });

  app.patch("/api/purchase-orders/:purchaseOrderId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const existing = auth ? await readPurchaseOrder(createPOStore(db), c.req.param("purchaseOrderId")) : null;
    if (auth && existing) authorizePurchaseOrderCreate(auth, existing.customerId);

    const body = await parseJsonObject(c);
    const safeKeys = new Set(["notes", "requestedShipDate", "actorUserId"]);
    const ignoredUnsafeFields = Object.keys(body).filter((key) => !safeKeys.has(key));
    const po = await updatePurchaseOrderSafeFields(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      notes: optionalString(body.notes, "notes") ?? null,
      requestedShipDate: optionalString(body.requestedShipDate, "requestedShipDate") ?? null,
      ignoredUnsafeFields,
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/submit", async (c) => {
    const db = c.env?.DB;
    const poStore = createPOStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const existing = auth ? await readPurchaseOrder(poStore, c.req.param("purchaseOrderId")) : null;
    if (auth && existing) authorizePurchaseOrderCreate(auth, existing.customerId);
    const body = await optionalJsonObject(c);
    const actor = actorUserId(auth, body);
    const po = await submitPurchaseOrder(poStore, {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actor,
    });
    await logSubmittedPONotification(poStore, c.env as NotificationEnv, po, actor, notifySubmittedPO);

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/lines/:lineId/supply-chain-review", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["supplyChainStatus"]);
    const po = await reviewPurchaseOrderLineSupplyChain(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      lineId: c.req.param("lineId"),
      supplyChainStatus: asSupplyChainStatus(fields.supplyChainStatus),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/deposit-status", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["depositStatus"]);
    const po = await updatePurchaseOrderDepositStatus(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      depositStatus: asDepositStatus(fields.depositStatus),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/cancel", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Admin", "Sales", "Supply Chain & Procurement"]);
    const body = await optionalJsonObject(c);
    const po = await cancelPurchaseOrder(createPOStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actorUserId(auth, body),
    });
    return ok(c, po);
  });

  app.post("/api/purchase-orders/:purchaseOrderId/approve-for-production", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Supply Chain & Procurement"]);
    const body = await optionalJsonObject(c);
    const po = await approvePurchaseOrderForProduction(createPOStore(db), createInventoryStore(db), {
      purchaseOrderId: c.req.param("purchaseOrderId"),
      actorUserId: actorUserId(auth, body),
    });

    return ok(c, po);
  });

  app.get("/api/purchase-orders/:purchaseOrderId/change-requests", async (c) => {
    const db = c.env?.DB;
    const poStore = createPOStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const po = await readPurchaseOrder(poStore, c.req.param("purchaseOrderId"));
    if (auth) authorizePurchaseOrderReadOrChangeRequestReview(auth, po.customerId);
    assertChangeRequestStore(poStore);
    return ok(c, await poStore.listChangeRequests!(po.id));
  });

  app.post("/api/purchase-orders/:purchaseOrderId/change-requests", async (c) => {
    const db = c.env?.DB;
    const poStore = createPOStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const po = await readPurchaseOrder(poStore, c.req.param("purchaseOrderId"));
    if (auth) authorizePurchaseOrderRead(auth, po.customerId);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["requestType", "message"]);
    assertChangeRequestStore(poStore);
    const request = await poStore.createChangeRequest!({
      id: `po_change_${crypto.randomUUID()}`,
      purchaseOrderId: po.id,
      customerId: po.customerId,
      requestType: asChangeRequestType(fields.requestType),
      message: asString(fields.message, "message"),
      requestedByUserId: auth?.user.id,
    });
    await poStore.createAuditEvent({
      actorUserId: auth?.user.id,
      entityType: "purchase_order_change_request",
      entityId: request.id,
      action: "purchase_order.change_request_created",
      metadata: { purchaseOrderId: po.id, requestType: request.requestType },
    });
    return ok(c, request);
  });

  app.post("/api/purchase-order-change-requests/:requestId/resolve", async (c) => {
    const db = c.env?.DB;
    const poStore = createPOStore(db);
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireAnyRole(auth, ["Sales"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["status"]);
    const status = asResolvedChangeRequestStatus(fields.status);
    assertChangeRequestStore(poStore);
    const existing = await poStore.getChangeRequest!(c.req.param("requestId"));
    if (!existing) throw new ApiError("PO_CHANGE_REQUEST_NOT_FOUND", "PO change request not found", 404);
    const updated = await poStore.resolveChangeRequest!(existing.id, {
      status,
      resolvedByUserId: auth?.user.id,
      resolutionNote: optionalString(body.resolutionNote, "resolutionNote") ?? null,
    });
    if (!updated) throw new ApiError("PO_CHANGE_REQUEST_NOT_FOUND", "PO change request not found", 404);
    await poStore.createAuditEvent({
      actorUserId: auth?.user.id,
      entityType: "purchase_order_change_request",
      entityId: updated.id,
      action: "purchase_order.change_request_resolved",
      metadata: { purchaseOrderId: updated.purchaseOrderId, status: updated.status },
    });
    return ok(c, updated);
  });
}

async function logSubmittedPONotification(
  store: PurchaseOrderStore,
  env: NotificationEnv,
  po: PurchaseOrderRecord,
  actorUserId: string | undefined,
  notifySubmittedPO: NotifySubmittedPurchaseOrder,
) {
  let result: SubmittedPONotificationResult;
  try {
    result = await notifySubmittedPO(env, po);
  } catch (error) {
    result = { status: "failed", error: errorMessage(error) };
  }

  const metadata: Record<string, unknown> = {
    channel: "sendgrid",
    notificationType: "submitted_po",
    status: result.status,
  };
  if (result.status === "failed") metadata.error = result.error;
  if (result.status === "skipped") metadata.reason = result.reason;

  try {
    await store.createAuditEvent({
      actorUserId,
      entityType: "purchase_order",
      entityId: po.id,
      action: `purchase_order.notification_${result.status}`,
      metadata,
    });
  } catch (error) {
    console.warn("Failed to record submitted-PO notification audit event", error);
  }
}

async function optionalJsonObject(c: Context<AppBindings>) {
  if (!c.req.header("content-type")) {
    return {};
  }

  return parseJsonObject(c);
}

function actorUserId(auth: AuthContext | null, body: Record<string, unknown>) {
  return auth?.user.id ?? optionalString(body.actorUserId, "actorUserId");
}

function scopePurchaseOrdersForAuth(records: PurchaseOrderRecord[], auth: AuthContext | null) {
  if (!auth || auth.user.userType !== "customer") return records;
  return records.filter((po) => hasCustomerAccess(auth, po.customerId));
}

function authorizePurchaseOrderRead(auth: AuthContext, customerId: string) {
  if (auth.user.userType === "customer") requireCustomerAccess(auth, customerId);
}

function authorizePurchaseOrderReadOrChangeRequestReview(auth: AuthContext, customerId: string) {
  if (auth.user.userType === "customer") {
    requireCustomerAccess(auth, customerId);
    return;
  }
  requireAnyRole(auth, ["Sales"]);
}

function authorizePurchaseOrderCreate(auth: AuthContext, customerId: string) {
  if (auth.user.userType === "customer") {
    requireCustomerAccess(auth, customerId);
    return;
  }
  requireAnyRole(auth, ["Sales"]);
}

async function assertUniquePONumber(store: PurchaseOrderStore, poNumber: string) {
  const existing = await listPurchaseOrders(store);
  if (existing.some((po) => po.poNumber.toLowerCase() === poNumber.toLowerCase())) {
    throw new POError("PO_NUMBER_ALREADY_EXISTS", "A purchase order with this Customer PO # already exists");
  }
}

async function normalizeCustomerPOLines(
  auth: AuthContext,
  customerId: string,
  lines: ReturnType<typeof asLines>,
  catalogStore: CatalogStore,
) {
  const normalized = [];
  for (const [index, line] of lines.entries()) {
    if (!line.productId) {
      if (!line.description.trim() || line.masterItemId) {
        throw new ApiError(
          "CUSTOMER_PO_PRODUCT_DESCRIPTION_REQUIRED",
          "Customer PO lines must include a product or product description",
          400,
          { fields: [`lines[${index}].description`] },
        );
      }
      normalized.push({
        ...line,
        description: line.description.trim(),
        productId: null,
        masterItemId: null,
      });
      continue;
    }
    if (line.masterItemId) {
      throw new ApiError(
        "CUSTOMER_PO_PRODUCT_REQUIRED",
        "Customer PO lines must use an active linked product",
        400,
        { fields: [`lines[${index}].productId`] },
      );
    }
    const product = await catalogStore.getProduct(line.productId);
    if (!product) {
      throw new ApiError(
        "CUSTOMER_PO_PRODUCT_REQUIRED",
        "Customer PO lines must use an active linked product",
        400,
        { fields: [`lines[${index}].productId`] },
      );
    }
    if (!product.customerId) {
      throw new ApiError("FORBIDDEN", "Customer access is limited to linked records", 403);
    }
    requireCustomerAccess(auth, product.customerId);
    if (product.customerId !== customerId) {
      throw new ApiError("FORBIDDEN", "Customer access is limited to linked records", 403);
    }
    if (product.status !== "active") {
      throw new ApiError(
        "CUSTOMER_PO_PRODUCT_UNAVAILABLE",
        "Customer PO lines must use an active linked product",
        400,
        { fields: [`lines[${index}].productId`] },
      );
    }
    normalized.push({
      ...line,
      description: product.name,
      masterItemId: null,
    });
  }
  return normalized;
}

function assertChangeRequestStore(store: PurchaseOrderStore) {
  if (
    !store.createChangeRequest ||
    !store.listChangeRequests ||
    !store.getChangeRequest ||
    !store.resolveChangeRequest
  ) {
    throw new ApiError("PO_CHANGE_REQUESTS_UNAVAILABLE", "PO change requests are unavailable", 501);
  }
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }

  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return asString(value, field);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown notification error";
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`, { fields: [field] });
  }

  return value;
}

function asDepositStatus(value: unknown) {
  if (typeof value !== "string" || !depositStatuses.has(value as DepositStatus)) {
    throw new ValidationError("depositStatus is invalid", { fields: ["depositStatus"] });
  }

  return value as DepositStatus;
}

function asSupplyChainStatus(value: unknown) {
  if (typeof value !== "string" || !supplyChainStatuses.has(value as SupplyChainStatus)) {
    throw new ValidationError("supplyChainStatus is invalid", { fields: ["supplyChainStatus"] });
  }

  return value as SupplyChainStatus;
}

function asChangeRequestType(value: unknown): POChangeRequestType {
  if (value === "change" || value === "cancel") return value;
  throw new ValidationError("requestType is invalid", { fields: ["requestType"] });
}

function asResolvedChangeRequestStatus(value: unknown): Exclude<POChangeRequestStatus, "open"> {
  if (value === "resolved" || value === "rejected") return value;
  throw new ValidationError("status is invalid", { fields: ["status"] });
}

function asLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("lines must be a non-empty array", { fields: ["lines"] });
  }

  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new ValidationError(`lines[${index}] must be an object`, { fields: ["lines"] });
    }

    const record = line as Record<string, unknown>;
    return {
      description: optionalString(record.description, `lines[${index}].description`) ?? "",
      quantity: asNumber(record.quantity, `lines[${index}].quantity`),
      unitOfMeasure: asString(record.unitOfMeasure, `lines[${index}].unitOfMeasure`),
      productId: optionalString(record.productId, `lines[${index}].productId`) ?? null,
      masterItemId: optionalString(record.masterItemId, `lines[${index}].masterItemId`) ?? null,
    };
  });
}
