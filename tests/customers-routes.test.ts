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
import { registerCustomerRoutes } from "../src/customers/routes";
import type { CustomerRecord, CustomerStore } from "../src/customers/service";

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

function createCustomerStore() {
  const customers = new Map<string, CustomerRecord>([
    ["customer-1", { id: "customer-1", name: "Bnutty", contactName: "Bonnie", contactEmail: "ops@bnutty.example", phone: "555-1000", status: "active" }],
    ["customer-2", { id: "customer-2", name: "Poochie Butter", contactName: "Pat", contactEmail: "ops@poochie.example", phone: "555-2000", status: "active" }],
  ]);

  const store: CustomerStore = {
    async listCustomers() { return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name)); },
    async getCustomer(id) { return customers.get(id) ?? null; },
    async createCustomer(input) {
      customers.set(input.id, input);
      return input;
    },
    async updateCustomer(id, input) {
      const existing = customers.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...input };
      customers.set(id, updated);
      return updated;
    },
  };

  return { store, customers };
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

function createRouteApp(authStore: AuthStore, customerStore: CustomerStore) {
  return createApp(
    (app) => {
      registerAuthRoutes(app, () => authStore);
      registerCustomerRoutes(app, () => customerStore, () => authStore);
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

describe("customer data routes", () => {
  it("allows employee users to list, read, and update customers", async () => {
    const auth = createAuthStore();
    const customerData = createCustomerStore();
    await seedUser(auth, { id: "sales-user", email: "sales@example.com", role: "Sales" });
    const app = createRouteApp(auth.store, customerData.store);
    const token = await login(app, "sales@example.com");

    const list = await app.request("/api/customers", { headers: { authorization: `Bearer ${token}` } });
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ data: [{ id: "customer-1" }, { id: "customer-2" }] });

    const read = await app.request("/api/customers/customer-1", { headers: { authorization: `Bearer ${token}` } });
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ data: { id: "customer-1", name: "Bnutty" } });

    const patch = await app.request("/api/customers/customer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Bnutty Foods", contactEmail: "new@bnutty.example", phone: "555-9999" }),
    });
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({
      data: { id: "customer-1", name: "Bnutty Foods", contactEmail: "new@bnutty.example", phone: "555-9999" },
    });
  });

  it("allows employee users to create customers", async () => {
    const auth = createAuthStore();
    const customerData = createCustomerStore();
    await seedUser(auth, { id: "admin-user", email: "admin@example.com", role: "Admin" });
    const app = createRouteApp(auth.store, customerData.store);
    const token = await login(app, "admin@example.com");

    const create = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "New Co-Pack Customer",
        contactName: "Nina",
        contactEmail: "nina@example.com",
        phone: "555-3000",
      }),
    });

    expect(create.status).toBe(201);
    const body = await create.json() as { data: CustomerRecord };
    expect(body.data).toMatchObject({
      name: "New Co-Pack Customer",
      contactName: "Nina",
      contactEmail: "nina@example.com",
      phone: "555-3000",
      status: "active",
    });
    expect(body.data.id).toMatch(/^customer_/);
    expect(customerData.customers.get(body.data.id)).toMatchObject({ name: "New Co-Pack Customer" });
  });

  it("archives customers through DELETE instead of hard-deleting", async () => {
    const auth = createAuthStore();
    const customerData = createCustomerStore();
    await seedUser(auth, { id: "sales-user", email: "sales@example.com", role: "Sales" });
    const app = createRouteApp(auth.store, customerData.store);
    const token = await login(app, "sales@example.com");

    const response = await app.request("/api/customers/customer-1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: "customer-1", status: "inactive" } });
    expect(customerData.customers.get("customer-1")).toMatchObject({ status: "inactive" });
  });

  it("lets linked customer users read only their own profile", async () => {
    const auth = createAuthStore();
    const customerData = createCustomerStore();
    await seedUser(auth, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    const app = createRouteApp(auth.store, customerData.store);
    const token = await login(app, "customer@example.com");

    const ownProfile = await app.request("/api/customers/me", { headers: { authorization: `Bearer ${token}` } });
    expect(ownProfile.status).toBe(200);
    await expect(ownProfile.json()).resolves.toMatchObject({ data: { id: "customer-1", name: "Bnutty" } });

    const list = await app.request("/api/customers", { headers: { authorization: `Bearer ${token}` } });
    expect(list.status).toBe(403);

    const crossRead = await app.request("/api/customers/customer-2", { headers: { authorization: `Bearer ${token}` } });
    expect(crossRead.status).toBe(403);

    const patch = await app.request("/api/customers/customer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Spoofed" }),
    });
    expect(patch.status).toBe(403);
  });
});
