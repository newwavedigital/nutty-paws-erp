import type { Hono } from "hono";
import { ApiError } from "../api/errors";
import { ok } from "../api/responses";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { hasCustomerAccess, requireAuthWhenEnabled, requireCustomerAccess, requireEmployee } from "../auth/guards";
import type { AuthContext, AuthStore } from "../auth/service";
import { D1CatalogStore } from "./d1-store";
import type { CatalogStore, ProductRecord } from "./service";

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
}

function scopeProductsForAuth(products: ProductRecord[], auth: AuthContext | null) {
  if (!auth || auth.user.userType !== "customer") return products;
  return products.filter((product) => product.customerId && hasCustomerAccess(auth, product.customerId));
}
