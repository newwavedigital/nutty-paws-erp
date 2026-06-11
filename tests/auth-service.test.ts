import { describe, expect, it } from "vitest";
import {
  AuthError,
  createSessionForUser,
  hashPassword,
  verifyPassword,
  verifySessionToken,
  type AuthSessionRecord,
  type AuthStore,
  type AuthUserRecord,
} from "../src/auth/service";

function createAuthStore() {
  const users = new Map<string, AuthUserRecord>();
  const sessions = new Map<string, AuthSessionRecord>();
  const roles = new Map<string, string[]>();
  const customerAccess = new Map<string, Array<{ customerId: string; accessLevel: "viewer" | "manager" }>>();

  const store: AuthStore = {
    async getUserByEmail(email) {
      return [...users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
    },
    async getUserById(id) {
      return users.get(id) ?? null;
    },
    async createUser(user) {
      users.set(user.id, user);
    },
    async countUsers() {
      return users.size;
    },
    async listUserRoles(userId) {
      return roles.get(userId) ?? [];
    },
    async setUserRoles(userId, roleNames) {
      roles.set(userId, roleNames);
    },
    async listCustomerAccess(userId) {
      return customerAccess.get(userId) ?? [];
    },
    async setCustomerAccess(userId, access) {
      customerAccess.set(userId, access);
    },
    async createSession(session) {
      sessions.set(session.id, session);
    },
    async getSessionByTokenHash(tokenHash) {
      return [...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
    },
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) sessions.set(sessionId, { ...session, revokedAt: new Date().toISOString() });
    },
  };

  return { store, users, roles, customerAccess, sessions };
}

describe("auth service", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^pbkdf2_sha256\$100000\$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("creates a session token and verifies it by token hash", async () => {
    const { store, users, roles, customerAccess } = createAuthStore();
    users.set("user-1", {
      id: "user-1",
      email: "admin@example.com",
      displayName: "Admin User",
      userType: "employee",
      passwordHash: await hashPassword("secret123"),
      isActive: true,
    });
    roles.set("user-1", ["Admin"]);
    customerAccess.set("user-1", [{ customerId: "customer-1", accessLevel: "manager" }]);

    const created = await createSessionForUser(store, users.get("user-1")!);
    const verified = await verifySessionToken(store, created.token);

    expect(created.token).toHaveLength(64);
    expect(verified.user.id).toBe("user-1");
    expect(verified.roles).toEqual(["Admin"]);
    expect(verified.customerAccess).toEqual([{ customerId: "customer-1", accessLevel: "manager" }]);
  });

  it("rejects revoked and expired sessions", async () => {
    const { store, users, sessions } = createAuthStore();
    users.set("user-1", {
      id: "user-1",
      email: "admin@example.com",
      displayName: "Admin User",
      userType: "employee",
      passwordHash: await hashPassword("secret123"),
      isActive: true,
    });
    const created = await createSessionForUser(store, users.get("user-1")!);
    const stored = [...sessions.values()][0];

    sessions.set(stored.id, { ...stored, revokedAt: new Date().toISOString() });
    await expect(verifySessionToken(store, created.token)).rejects.toEqual(
      new AuthError("UNAUTHORIZED", "Session is no longer active"),
    );

    sessions.set(stored.id, { ...stored, revokedAt: null, expiresAt: "2000-01-01T00:00:00.000Z" });
    await expect(verifySessionToken(store, created.token)).rejects.toEqual(
      new AuthError("UNAUTHORIZED", "Session is no longer active"),
    );
  });
});
