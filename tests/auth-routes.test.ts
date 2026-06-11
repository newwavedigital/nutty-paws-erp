import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { hashPassword, type AuthSessionRecord, type AuthStore, type AuthUserRecord } from "../src/auth/service";

function createAuthStore() {
  const users = new Map<string, AuthUserRecord>();
  const sessions = new Map<string, AuthSessionRecord>();
  const roles = new Map<string, string[]>();
  const customerAccess = new Map<string, Array<{ customerId: string; accessLevel: "viewer" | "manager" }>>();

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
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) sessions.set(sessionId, { ...session, revokedAt: new Date().toISOString() });
    },
  };

  return { store, users, roles, customerAccess };
}

function createRouteApp(store: AuthStore) {
  return createApp((app) => registerAuthRoutes(app, () => store));
}

describe("auth routes", () => {
  it("reports setup status and creates the first admin once", async () => {
    const { store } = createAuthStore();
    const app = createRouteApp(store);

    const status = await app.request("/api/auth/setup-status");
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ ok: true, data: { needsSetup: true } });

    const setup = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "Admin@Example.com", password: "secret123", displayName: "Admin User" }),
    });
    expect(setup.status).toBe(200);
    const setupBody = await setup.json() as { data: { token: string; user: { email: string; roles: string[] } } };
    expect(setupBody.data.token).toHaveLength(64);
    expect(setupBody.data.user).toMatchObject({ email: "admin@example.com", roles: ["Admin"] });

    const secondSetup = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "second@example.com", password: "secret123", displayName: "Second" }),
    });
    expect(secondSetup.status).toBe(409);
  });

  it("logs in, returns /me, and logs out", async () => {
    const { store, users, roles } = createAuthStore();
    users.set("user-1", {
      id: "user-1",
      email: "admin@example.com",
      displayName: "Admin User",
      userType: "employee",
      passwordHash: await hashPassword("secret123"),
      isActive: true,
    });
    roles.set("user-1", ["Admin"]);
    const app = createRouteApp(store);

    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "secret123" }),
    });
    expect(login.status).toBe(200);
    const body = await login.json() as { data: { token: string } };

    const me = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${body.data.token}` } });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ ok: true, data: { user: { id: "user-1" }, roles: ["Admin"] } });

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${body.data.token}` },
    });
    expect(logout.status).toBe(200);

    const afterLogout = await app.request("/api/auth/me", { headers: { authorization: `Bearer ${body.data.token}` } });
    expect(afterLogout.status).toBe(401);
  });

  it("rejects invalid login attempts", async () => {
    const { store, users } = createAuthStore();
    users.set("user-1", {
      id: "user-1",
      email: "admin@example.com",
      displayName: "Admin User",
      userType: "employee",
      passwordHash: await hashPassword("secret123"),
      isActive: true,
    });
    const app = createRouteApp(store);

    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "wrong" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });
});
