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
import type {
  CatalogStore,
  MasterItemInput,
  MasterItemRecord,
  ProductBomInput,
  ProductInput,
  ProductRecord,
} from "../src/catalog/service";

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

function makeProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "product-1",
    customerId: "customer-1",
    sku: "BN-16",
    name: "Bnutty 16oz",
    description: null,
    status: "active",
    productionRoom: "Main",
    size: 16,
    sizeUnit: "oz",
    caseQuantity: 12,
    caseSticker: "2x3",
    unitPriceCents: 899,
    kosher: true,
    allergen: true,
    allergenDetails: "Peanuts",
    dailyProductionRate: 500,
    notes: "Classic jar",
    bomItems: [
      {
        id: "bom-1",
        productId: "product-1",
        masterItemId: "master-1",
        quantityPerUnit: 1.25,
        percentOfFormula: 100,
      },
    ],
    ...overrides,
  };
}

function makeMasterItem(overrides: Partial<MasterItemRecord> = {}): MasterItemRecord {
  return {
    id: "master-1",
    sku: "RAW-PNUT",
    name: "Raw Peanuts",
    itemType: "raw_material",
    unitOfMeasure: "lb",
    customerId: "general",
    allergens: ["Peanut"],
    ...overrides,
  };
}

function createCatalogStore() {
  const products = new Map<string, ProductRecord>([["product-1", makeProduct()]]);
  const masterItems = new Map<string, MasterItemRecord>([["master-1", makeMasterItem()]]);

  const store: CatalogStore = {
    async listProducts() { return [...products.values()]; },
    async getProduct(id) { return products.get(id) ?? null; },
    async createProduct(input: ProductInput) {
      const product = makeProduct({ ...input, id: input.id, bomItems: input.bomItems.map((bom, index) => ({ ...bom, id: `bom-${index + 1}`, productId: input.id })) });
      products.set(product.id, product);
      return product;
    },
    async updateProduct(id: string, input: ProductInput) {
      const product = makeProduct({ ...(products.get(id) ?? {}), ...input, id, bomItems: input.bomItems.map((bom, index) => ({ ...bom, id: `bom-${index + 1}`, productId: id })) });
      products.set(id, product);
      return product;
    },
    async listMasterItems() { return [...masterItems.values()]; },
    async getMasterItem(id) { return masterItems.get(id) ?? null; },
    async createMasterItem(input: MasterItemInput) {
      const item = makeMasterItem({ ...input, id: input.id });
      masterItems.set(item.id, item);
      return item;
    },
    async updateMasterItem(id: string, input: MasterItemInput) {
      const item = makeMasterItem({ ...(masterItems.get(id) ?? {}), ...input, id });
      masterItems.set(id, item);
      return item;
    },
    async replaceProductBomItems(productId: string, bomItems: ProductBomInput[]) {
      const product = products.get(productId);
      if (!product) return null;
      const updated = {
        ...product,
        bomItems: bomItems.map((bom, index) => ({ id: `bom-${index + 1}`, productId, ...bom })),
      };
      products.set(productId, updated);
      return updated;
    },
  };

  return store;
}

async function seedUser(data: ReturnType<typeof createAuthStore>, input: { id: string; email: string; role: RoleName }) {
  data.users.set(input.id, {
    id: input.id,
    email: input.email,
    displayName: input.email,
    userType: input.role === "Customer" ? "customer" : "employee",
    passwordHash: await hashPassword("secret123"),
    isActive: true,
  });
  data.roles.set(input.id, [input.role]);
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

describe("Sprint 5 catalog setup routes", () => {
  it("allows employee users to create and update products with durable setup fields and BOM rows", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "admin-user", email: "admin@example.com", role: "Admin" });
    const app = createRouteApp(auth.store, createCatalogStore());
    const token = await login(app, "admin@example.com");

    const createResponse = await app.request("/api/products", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        sku: "PB-8",
        name: "Poochie 8oz",
        productionRoom: "Room 2",
        size: 8,
        sizeUnit: "oz",
        caseQuantity: 24,
        caseSticker: "Keyence",
        unitPriceCents: 699,
        kosher: false,
        allergen: true,
        allergenDetails: "Peanuts",
        dailyProductionRate: 700,
        notes: "Dog butter",
        status: "active",
        bomItems: [{ masterItemId: "master-1", quantityPerUnit: 0.75, percentOfFormula: 100 }],
      }),
    });

    expect(createResponse.status).toBe(200);
    const created = await createResponse.json() as { data: ProductRecord };
    expect(created.data).toMatchObject({
      id: expect.stringMatching(/^product_/),
      sku: "PB-8",
      productionRoom: "Room 2",
      caseQuantity: 24,
      bomItems: [expect.objectContaining({ masterItemId: "master-1", quantityPerUnit: 0.75 })],
    });

    const updateResponse = await app.request(`/api/products/${created.data.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Poochie Butter 8oz",
        bomItems: [{ masterItemId: "master-1", quantityPerUnit: 0.8, percentOfFormula: 100 }],
      }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: {
        name: "Poochie Butter 8oz",
        bomItems: [expect.objectContaining({ quantityPerUnit: 0.8 })],
      },
    });
  });

  it("allows employee users to create and update Master List items with customer scope and allergens", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "warehouse-user", email: "warehouse@example.com", role: "Warehousing" });
    const app = createRouteApp(auth.store, createCatalogStore());
    const token = await login(app, "warehouse@example.com");

    const createResponse = await app.request("/api/master-items", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        sku: "JAR-16",
        name: "16oz Jar",
        itemType: "packaging",
        unitOfMeasure: "ea",
        customerId: "general",
        allergens: [],
      }),
    });

    expect(createResponse.status).toBe(200);
    const created = await createResponse.json() as { data: MasterItemRecord };
    expect(created.data).toMatchObject({ id: expect.stringMatching(/^master_/), name: "16oz Jar", customerId: "general" });

    const updateResponse = await app.request(`/api/master-items/${created.data.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ allergens: ["Peanut"], customerId: "customer-1" }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: { customerId: "customer-1", allergens: ["Peanut"] },
    });
  });

  it("blocks customer users from product and Master List setup writes", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "customer-user", email: "customer@example.com", role: "Customer" });
    const app = createRouteApp(auth.store, createCatalogStore());
    const token = await login(app, "customer@example.com");

    const product = await app.request("/api/products", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sku: "NOPE", name: "Nope" }),
    });
    const masterItem = await app.request("/api/master-items", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sku: "NOPE", name: "Nope", itemType: "other", unitOfMeasure: "ea" }),
    });

    expect(product.status).toBe(403);
    expect(masterItem.status).toBe(403);
  });
});
