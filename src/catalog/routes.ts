import type { Hono } from "hono";
import { ApiError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { hasCustomerAccess, requireAuthWhenEnabled, requireCustomerAccess, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1CatalogStore } from "./d1-store";
import type {
  CatalogStore,
  MasterItemInput,
  MasterItemType,
  ProductBomInput,
  ProductInput,
  ProductRecord,
  ProductStatus,
} from "./service";

type CatalogStoreFactory = (db: D1Database) => CatalogStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

export function registerCatalogRoutes(
  app: Hono<AppBindings>,
  createCatalogStore: CatalogStoreFactory = (db) => new D1CatalogStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/products", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const products = await createCatalogStore(db).listProducts();
    return ok(c, scopeProductsForAuth(products, auth));
  });

  app.get("/api/products/:productId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    const product = await createCatalogStore(db).getProduct(c.req.param("productId"));
    if (!product) throw new ApiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    if (auth?.user.userType === "customer") {
      if (!product.customerId) throw new ApiError("FORBIDDEN", "Customer access is limited to linked records", 403);
      requireCustomerAccess(auth, product.customerId);
    }
    return ok(c, product);
  });

  app.post("/api/products", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createCatalogStore(db);
    if (!store.createProduct) throw new ApiError("CATALOG_WRITE_UNAVAILABLE", "Catalog writes are unavailable", 501);
    const input = productInputFromBody(await parseJsonObject(c), `product_${crypto.randomUUID()}`);
    return ok(c, await store.createProduct(input));
  });

  app.patch("/api/products/:productId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createCatalogStore(db);
    if (!store.updateProduct) throw new ApiError("CATALOG_WRITE_UNAVAILABLE", "Catalog writes are unavailable", 501);
    const existing = await store.getProduct(c.req.param("productId"));
    if (!existing) throw new ApiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    const input = productInputFromBody(await parseJsonObject(c), existing.id, existing);
    const product = await store.updateProduct(existing.id, input);
    if (!product) throw new ApiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    return ok(c, product);
  });

  app.get("/api/master-items", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await createCatalogStore(db).listMasterItems());
  });

  app.get("/api/master-items/:masterItemId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const masterItem = await createCatalogStore(db).getMasterItem(c.req.param("masterItemId"));
    if (!masterItem) throw new ApiError("MASTER_ITEM_NOT_FOUND", "Master item not found", 404);
    return ok(c, masterItem);
  });

  app.post("/api/master-items", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createCatalogStore(db);
    if (!store.createMasterItem) throw new ApiError("CATALOG_WRITE_UNAVAILABLE", "Catalog writes are unavailable", 501);
    const input = masterItemInputFromBody(await parseJsonObject(c), `master_${crypto.randomUUID()}`);
    return ok(c, await store.createMasterItem(input));
  });

  app.patch("/api/master-items/:masterItemId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const store = createCatalogStore(db);
    if (!store.updateMasterItem) throw new ApiError("CATALOG_WRITE_UNAVAILABLE", "Catalog writes are unavailable", 501);
    const existing = await store.getMasterItem(c.req.param("masterItemId"));
    if (!existing) throw new ApiError("MASTER_ITEM_NOT_FOUND", "Master item not found", 404);
    const input = masterItemInputFromBody(await parseJsonObject(c), existing.id, existing);
    const masterItem = await store.updateMasterItem(existing.id, input);
    if (!masterItem) throw new ApiError("MASTER_ITEM_NOT_FOUND", "Master item not found", 404);
    return ok(c, masterItem);
  });
}

function scopeProductsForAuth(products: ProductRecord[], auth: AuthContext | null) {
  if (!auth || auth.user.userType !== "customer") return products;
  return products.filter((product) => product.customerId && hasCustomerAccess(auth, product.customerId));
}

function productInputFromBody(body: Record<string, unknown>, id: string, existing?: ProductRecord): ProductInput {
  return {
    id,
    customerId: nullableString(body.customerId, existing?.customerId ?? null),
    sku: requiredString(body.sku, "sku", existing?.sku),
    name: requiredString(body.name, "name", existing?.name),
    description: nullableString(body.description, existing?.description ?? null),
    status: productStatus(body.status, existing?.status ?? "active"),
    productionRoom: nullableString(body.productionRoom, existing?.productionRoom ?? null),
    size: nullableNumber(body.size, existing?.size ?? null),
    sizeUnit: nullableString(body.sizeUnit, existing?.sizeUnit ?? null),
    caseQuantity: nullableNumber(body.caseQuantity, existing?.caseQuantity ?? null),
    caseSticker: nullableString(body.caseSticker, existing?.caseSticker ?? null),
    unitPriceCents: nullableNumber(body.unitPriceCents, existing?.unitPriceCents ?? null),
    kosher: booleanValue(body.kosher, existing?.kosher ?? false),
    allergen: booleanValue(body.allergen, existing?.allergen ?? false),
    allergenDetails: nullableString(body.allergenDetails, existing?.allergenDetails ?? null),
    dailyProductionRate: nullableNumber(body.dailyProductionRate, existing?.dailyProductionRate ?? null),
    notes: nullableString(body.notes, existing?.notes ?? null),
    bomItems: bomInputArray(body.bomItems, existing?.bomItems?.map((item) => ({
      masterItemId: item.masterItemId,
      quantityPerUnit: item.quantityPerUnit,
      percentOfFormula: item.percentOfFormula ?? null,
    })) ?? []),
  };
}

function masterItemInputFromBody(body: Record<string, unknown>, id: string, existing?: MasterItemInput | { sku: string; name: string; itemType: MasterItemType; unitOfMeasure: string; customerId?: string | null; allergens?: string[] }): MasterItemInput {
  return {
    id,
    sku: requiredString(body.sku, "sku", existing?.sku),
    name: requiredString(body.name, "name", existing?.name),
    itemType: masterItemType(body.itemType, existing?.itemType ?? "other"),
    unitOfMeasure: requiredString(body.unitOfMeasure, "unitOfMeasure", existing?.unitOfMeasure),
    customerId: nullableString(body.customerId, existing?.customerId ?? "general"),
    allergens: stringArray(body.allergens, existing?.allergens ?? []),
  };
}

function requiredString(value: unknown, field: string, fallback?: string) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a non-empty string`, 400);
  }
  return value.trim();
}

function nullableString(value: unknown, fallback: string | null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("VALIDATION_ERROR", "Expected string value", 400);
  return value.trim();
}

function nullableNumber(value: unknown, fallback: number | null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ApiError("VALIDATION_ERROR", "Expected number value", 400);
  return value;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === true;
}

function productStatus(value: unknown, fallback: ProductStatus): ProductStatus {
  if (value === undefined) return fallback;
  if (value === "active" || value === "inactive") return value;
  throw new ApiError("VALIDATION_ERROR", "status must be active or inactive", 400);
}

function masterItemType(value: unknown, fallback: MasterItemType): MasterItemType {
  if (value === undefined) return fallback;
  if (value === "raw_material" || value === "packaging" || value === "finished_good" || value === "other") return value;
  throw new ApiError("VALIDATION_ERROR", "itemType is not supported", 400);
}

function stringArray(value: unknown, fallback: string[]) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) throw new ApiError("VALIDATION_ERROR", "Expected string array", 400);
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function bomInputArray(value: unknown, fallback: ProductBomInput[]) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) throw new ApiError("VALIDATION_ERROR", "bomItems must be an array", 400);
  return value.map((item): ProductBomInput => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError("VALIDATION_ERROR", "bomItems must contain objects", 400);
    }
    const row = item as Record<string, unknown>;
    const quantityPerUnit = nullableNumber(row.quantityPerUnit, null);
    if (!quantityPerUnit || quantityPerUnit <= 0) {
      throw new ApiError("VALIDATION_ERROR", "quantityPerUnit must be greater than zero", 400);
    }
    return {
      masterItemId: requiredString(row.masterItemId, "masterItemId"),
      quantityPerUnit,
      percentOfFormula: nullableNumber(row.percentOfFormula, null),
    };
  });
}
