import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { sha256Hex, type AuthSessionRecord, type AuthStore, type AuthUserRecord, type RoleName } from "../src/auth/service";
import { registerResearchRoutes } from "../src/research/routes";
import type { ResearchRequestRecord, ResearchStore } from "../src/research/service";

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

  return { store, users, sessions, roles, customerAccess };
}

function createResearchStore(): ResearchStore {
  const request: ResearchRequestRecord = {
    id: "rd-request-1",
    customerId: "customer-1",
    customerName: "Customer One",
    status: "queue",
    packagingType: "Jar",
    unitsRequested: 12,
    productDescription: "Customer one prototype",
    submittedAt: "2026-06-20T00:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    createdByUserId: "user-employee",
    updatedByUserId: "user-employee",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    notes: [],
    comments: [],
  };

  return {
    async customerExists() {
      return true;
    },
    async listResearchRequests() {
      return [request];
    },
    async getResearchRequest() {
      return request;
    },
    async createResearchRequest() {
      return request;
    },
    async updateResearchRequest() {
      return request;
    },
    async addResearchRequestNote() {
      return { id: "note-1", requestId: request.id, note: "note", createdByUserId: "user-employee", createdAt: request.createdAt };
    },
    async addResearchRequestComment() {
      return { id: "comment-1", requestId: request.id, comment: "comment", createdByUserId: "user-employee", createdAt: request.createdAt };
    },
    async updateResearchRequestStatus() {
      return request;
    },
    async createAuditEvent() {},
  };
}

async function createProtectedApp() {
  const { store: authStore, users, roles, sessions } = createAuthStore();
  const researchStore = createResearchStore();

  users.set("user-employee", {
    id: "user-employee",
    email: "employee@example.com",
    displayName: "Employee User",
    userType: "employee",
    passwordHash: null,
    isActive: true,
  });
  roles.set("user-employee", ["Production" as RoleName]);
  const employeeToken = "employee-token";
  sessions.set("session-employee", {
    id: "session-employee",
    userId: "user-employee",
    tokenHash: await sha256Hex(employeeToken),
    expiresAt: "2999-01-01T00:00:00.000Z",
    revokedAt: null,
  });

  users.set("user-customer", {
    id: "user-customer",
    email: "customer@example.com",
    displayName: "Customer User",
    userType: "customer",
    passwordHash: null,
    isActive: true,
  });
  roles.set("user-customer", ["Customer"]);
  const customerToken = "customer-token";
  sessions.set("session-customer", {
    id: "session-customer",
    userId: "user-customer",
    tokenHash: await sha256Hex(customerToken),
    expiresAt: "2999-01-01T00:00:00.000Z",
    revokedAt: null,
  });

  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerResearchRoutes(route, () => researchStore, () => authStore);
  }, { AUTH_REQUIRED: "true" });

  return { app, employeeToken, customerToken };
}

describe("protected research routes", () => {
  it("blocks Customer users and allows employee users", async () => {
    const { app, employeeToken, customerToken } = await createProtectedApp();

    const customerResponse = await app.request("/api/research/requests", {
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const employeeResponse = await app.request("/api/research/requests", {
      headers: { authorization: `Bearer ${employeeToken}` },
    });

    expect(customerResponse.status).toBe(403);
    expect(employeeResponse.status).toBe(200);
  });
});
