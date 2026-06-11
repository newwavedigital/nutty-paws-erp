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
import { registerUserRoutes, type UserAdminStore } from "../src/users/routes";

function createAuthStore() {
  const users = new Map<string, AuthUserRecord>();
  const sessions = new Map<string, AuthSessionRecord>();
  const roles = new Map<string, RoleName[]>();
  const customerAccess = new Map<string, CustomerAccessRecord[]>();

  const authStore: AuthStore = {
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
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) sessions.set(sessionId, { ...session, revokedAt: new Date().toISOString() });
    },
  };

  const userStore: UserAdminStore = {
    ...authStore,
    async listUsers() { return [...users.values()].sort((a, b) => a.email.localeCompare(b.email)); },
    async updateUser(userId, input) {
      const existing = users.get(userId);
      if (!existing) return null;
      const updated = { ...existing, ...input };
      users.set(userId, updated);
      return updated;
    },
  };

  return { authStore, userStore, users, roles, customerAccess };
}

async function seedUser(
  data: ReturnType<typeof createAuthStore>,
  input: { id: string; email: string; role: RoleName; userType?: "employee" | "customer"; customerId?: string },
) {
  data.users.set(input.id, {
    id: input.id,
    email: input.email,
    displayName: input.email,
    userType: input.userType ?? (input.role === "Customer" ? "customer" : "employee"),
    passwordHash: await hashPassword("secret123"),
    isActive: true,
  });
  data.roles.set(input.id, [input.role]);
  if (input.customerId) data.customerAccess.set(input.id, [{ customerId: input.customerId, accessLevel: "manager" }]);
}

function createRouteApp(authStore: AuthStore, userStore: UserAdminStore) {
  return createApp(
    (app) => {
      registerAuthRoutes(app, () => authStore);
      registerUserRoutes(app, () => userStore);
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
  const body = await response.json() as { data: { token: string } }; return body.data.token;
}

describe("user admin routes", () => {
  it("allows Admin users to create employee users with selected roles", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "admin-1", email: "admin@example.com", role: "Admin" });
    const app = createRouteApp(data.authStore, data.userStore);
    const token = await login(app, "admin@example.com");

    const response = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "sales@example.com", displayName: "Sales User", password: "secret123", roles: ["Sales"] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { email: "sales@example.com", userType: "employee", roles: ["Sales"], customerAccess: [] },
    });
  });

  it("requires Customer users to be linked to a customer", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "admin-1", email: "admin@example.com", role: "Admin" });
    const app = createRouteApp(data.authStore, data.userStore);
    const token = await login(app, "admin@example.com");

    const missingLink = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "customer@example.com", displayName: "Customer User", password: "secret123", roles: ["Customer"] }),
    });
    expect(missingLink.status).toBe(400);

    const linked = await app.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "customer@example.com", displayName: "Customer User", password: "secret123", roles: ["Customer"], customerId: "customer-1" }),
    });
    expect(linked.status).toBe(200);
    await expect(linked.json()).resolves.toMatchObject({
      data: { userType: "customer", roles: ["Customer"], customerAccess: [{ customerId: "customer-1", accessLevel: "manager" }] },
    });
  });

  it("blocks non-admin users from account management", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "sales-1", email: "sales@example.com", role: "Sales" });
    const app = createRouteApp(data.authStore, data.userStore);
    const token = await login(app, "sales@example.com");

    const response = await app.request("/api/users", { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("updates roles/customer link and deactivates users instead of deleting them", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "admin-1", email: "admin@example.com", role: "Admin" });
    await seedUser(data, { id: "sales-1", email: "sales@example.com", role: "Sales" });
    const app = createRouteApp(data.authStore, data.userStore);
    const token = await login(app, "admin@example.com");

    const patch = await app.request("/api/users/sales-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: "Customer User", isActive: true, roles: ["Customer"], customerId: "customer-2" }),
    });
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({ data: { roles: ["Customer"], customerAccess: [{ customerId: "customer-2" }] } });

    const deactivate = await app.request("/api/users/sales-1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deactivate.status).toBe(200);
    expect(data.users.get("sales-1")?.isActive).toBe(false);
  });
});

