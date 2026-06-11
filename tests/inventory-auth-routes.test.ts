import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { hashPassword, type AuthSessionRecord, type AuthStore, type AuthUserRecord, type CustomerAccessRecord, type RoleName } from "../src/auth/service";
import { registerInventoryRoutes } from "../src/inventory/routes";
import type { InventoryStore } from "../src/inventory/service";

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
  return { store, users, roles };
}

async function seedUser(data: ReturnType<typeof createAuthStore>, input: { id: string; email: string; role: RoleName }) {
  data.users.set(input.id, { id: input.id, email: input.email, displayName: input.email, userType: input.role === "Customer" ? "customer" : "employee", passwordHash: await hashPassword("secret123"), isActive: true });
  data.roles.set(input.id, [input.role]);
}

function createInventoryStore() {
  const store: InventoryStore = {
    async getInventoryItem(id) { return { id, onHandQuantity: 100, allocatedQuantity: 0, unitOfMeasure: "lb" }; },
    async allocateInventoryItem() { return true; },
    async createReservation() {},
    async createMovement() {},
    async createAuditEvent() {},
    async getActiveReservation() { return null; },
    async releaseReservationRecord() {},
    async releaseInventoryItemAllocation() {},
  };
  return store;
}

function createRouteApp(authStore: AuthStore) {
  return createApp((app) => {
    registerAuthRoutes(app, () => authStore);
    registerInventoryRoutes(app, () => createInventoryStore(), () => authStore);
  }, { AUTH_REQUIRED: "true" });
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "secret123" }) });
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

describe("protected inventory routes", () => {
  it("blocks Customer users from raw inventory APIs when auth is required", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "customer-user", email: "customer@example.com", role: "Customer" });
    const app = createRouteApp(data.store);
    const token = await login(app, "customer@example.com");

    const response = await app.request("/api/inventory/inv-1/availability", { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(403);
  });

  it("allows employee users to use inventory APIs when auth is required", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "warehouse-user", email: "warehouse@example.com", role: "Warehousing" });
    const app = createRouteApp(data.store);
    const token = await login(app, "warehouse@example.com");

    const response = await app.request("/api/inventory/inv-1/availability", { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
  });
});
