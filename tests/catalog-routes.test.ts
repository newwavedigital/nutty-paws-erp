import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import {
  hashPassword,
  type AuthSessionRecord,
  type AuthStore,
  type AuthUserRecord,
  type CustomerAccessRecord,
  type RoleName,
} from "../src/auth/service";
import { registerCatalogRoutes } from "../src/catalog/routes";
import type { CatalogStore, MasterItemRecord, ProductRecord } from "../src/catalog/service";

function createAuthStore() {
  const users = new Map<string, AuthUserRecord>();
  const sessions = new Map<string, AuthSessionRecord>();
  const roles = new Map<string, RoleName[]>();
  const customerAccess = new Map<string, CustomerAccessRecord[]>();

  const store: AuthStore = {
    async getUserByEmail(email) { return [...users.values()].find((user) => user.email === email.toLowerCase()) ?? null; },
    async getUserById(id) { return users.get(id) ?? null; },
    async createUser(user) { users.set(user.id, user); },
    async countUsers() { return users.size; },
    async listUserRoles(userId) { return roles.get(userId) ?? []; },
    async setUserRoles(userId, roleNames) { roles.set(userId, roleNames); },
    async listCustomerAccess(userId) { return customerAccess.get(userId) ?? []; },
    async setCustomerAccess(userId, access) { customerAccess.set(userId, access); },
    async createSession(session) { sessions.set(session.id, session); },
    async getSessionByTokenHash(tokenHash) { return [...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null; },
    async revokeSession() {},
  };

  return { store, users, roles, customerAccess };
}

function createCatalogStore() {
  const products: ProductRecord[] = [
    { id: "product-1", customerId: "customer-1", sku: "BN-16", name: "Bnutty 16oz", description: "Classic", status: "active" },
    { id: "product-2", customerId: "customer-2", sku: "PB-8", name: "Poochie 8oz", description: "Dog butter", status: "active" },
    { id: "product-3", customerId: null, sku: "GEN", name: "General Product", description: null, status: "inactive" },
  ];
  const masterItems: MasterItemRecord[] = [
    { id: "master-1", sku: "RAW-PNUT", name: "Raw Peanuts", itemType: "raw_material", unitOfMeasure: "lb" },
    { id: "master-2", sku: "JAR-16", name: "16oz Jar", itemType: "packaging", unitOfMeasure: "ea" },
  ];

  const store: CatalogStore = {
    async listProducts() { return products; },
    async getProduct(id) { return products.find((product) => product.id === id) ?? null; },
    async listMasterItems() { return masterItems; },
    async getMasterItem(id) { return masterItems.find((item) => item.id === id) ?? null; },
  };

  return store;
}

async function seedUser(
  data: ReturnType<typeof createAuthStore>,
  input: { id: string; email: string; role: RoleName; customerId?: string },
) {
  data.users.set(input.id, {
    id: input.id,
    email: input.email,
    displayName: input.email,
    userType: input.role === "Customer" ? "customer" : "employee",
    passwordHash: await hashPassword("secret123"),
    isActive: true,
  });
  data.roles.set(input.id, [input.role]);
  if (input.customerId) data.customerAccess.set(input.id, [{ customerId: input.customerId, accessLevel: "manager" }]);
}

function createRouteApp(authStore: AuthStore, catalogStore: CatalogStore) {
  return createApp(
    (app) => {
      registerAuthRoutes(app, () => authStore);
      registerCatalogRoutes(app, () => catalogStore, () => authStore);
    },
    { AUTH_REQUIRED: "true" },
  );
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret123" }),
  });
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

describe("catalog routes", () => {
  it("allows employee users to list and read products and master items", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "sales-user", email: "sales@example.com", role: "Sales" });
    const app = createRouteApp(auth.store, createCatalogStore());
    const token = await login(app, "sales@example.com");

    const products = await app.request("/api/products", { headers: { authorization: `Bearer ${token}` } });
    expect(products.status).toBe(200);
    await expect(products.json()).resolves.toMatchObject({ data: [{ id: "product-1" }, { id: "product-2" }, { id: "product-3" }] });

    const product = await app.request("/api/products/product-2", { headers: { authorization: `Bearer ${token}` } });
    expect(product.status).toBe(200);
    await expect(product.json()).resolves.toMatchObject({ data: { id: "product-2", customerId: "customer-2" } });

    const masterItems = await app.request("/api/master-items", { headers: { authorization: `Bearer ${token}` } });
    expect(masterItems.status).toBe(200);
    await expect(masterItems.json()).resolves.toMatchObject({ data: [{ id: "master-1" }, { id: "master-2" }] });

    const masterItem = await app.request("/api/master-items/master-1", { headers: { authorization: `Bearer ${token}` } });
    expect(masterItem.status).toBe(200);
    await expect(masterItem.json()).resolves.toMatchObject({ data: { id: "master-1", unitOfMeasure: "lb" } });
  });

  it("scopes customer users to linked products and blocks master-item access", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    const app = createRouteApp(auth.store, createCatalogStore());
    const token = await login(app, "customer@example.com");

    const products = await app.request("/api/products", { headers: { authorization: `Bearer ${token}` } });
    expect(products.status).toBe(200);
    const productBody = await products.json() as { data: ProductRecord[] };
    expect(productBody.data.map((product) => product.id)).toEqual(["product-1"]);

    const ownProduct = await app.request("/api/products/product-1", { headers: { authorization: `Bearer ${token}` } });
    expect(ownProduct.status).toBe(200);

    const crossProduct = await app.request("/api/products/product-2", { headers: { authorization: `Bearer ${token}` } });
    expect(crossProduct.status).toBe(403);

    const masterItems = await app.request("/api/master-items", { headers: { authorization: `Bearer ${token}` } });
    expect(masterItems.status).toBe(403);

    const masterItem = await app.request("/api/master-items/master-1", { headers: { authorization: `Bearer ${token}` } });
    expect(masterItem.status).toBe(403);
  });
});
