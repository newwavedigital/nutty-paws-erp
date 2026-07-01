import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerQualityRoutes } from "../src/quality/routes";
import type { QualityStore } from "../src/quality/service";

function createAuthStore(role: "Customer" | "Production" | "Warehousing" | "Admin"): AuthStore {
  return {
    async createUser() { throw new Error("not used"); },
    async getUserByEmail() { return null; },
    async getUserById(id) {
      return {
        id,
        email: `${id}@example.com`,
        displayName: id,
        userType: role === "Customer" ? "customer" : "employee",
        passwordHash: null,
        isActive: true,
      };
    },
    async listUserRoles() { return [role as RoleName]; },
    async setUserRoles() {},
    async listCustomerAccess() { return []; },
    async setCustomerAccess() {},
    async createSession() { throw new Error("not used"); },
    async getSessionByTokenHash() {
      return { id: "session-1", userId: role, tokenHash: "hash", expiresAt: "2999-01-01T00:00:00.000Z", revokedAt: null };
    },
    async revokeSession() {},
    async countUsers() { return 1; },
  };
}

function createQualityStore(): QualityStore {
  return {
    async listQualityQueue() { return []; },
    async getPurchaseOrder() { return null; },
    async getActiveCoaFile() { return null; },
    async releaseInventoryLots() { return 0; },
    async updatePurchaseOrderQualityRelease() { return null; },
    async updatePurchaseOrderQualitySkip() { return null; },
    async attachPostShipmentCoaFile() { return null; },
    async updatePurchaseOrderQualityNotes() { return null; },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createProtectedApp(role: "Customer" | "Production" | "Warehousing" | "Admin") {
  const authStore = createAuthStore(role);
  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerQualityRoutes(route, () => createQualityStore(), () => authStore);
  }, { AUTH_REQUIRED: "true" });
  return app;
}

describe("protected quality routes", () => {
  it("blocks Customer users and allows Production/Warehousing/Admin users", async () => {
    const customerResponse = await createProtectedApp("Customer").request("/api/quality/queue", {
      headers: { authorization: "Bearer customer-token" },
    });
    const productionResponse = await createProtectedApp("Production").request("/api/quality/queue", {
      headers: { authorization: "Bearer production-token" },
    });
    const warehousingResponse = await createProtectedApp("Warehousing").request("/api/quality/queue", {
      headers: { authorization: "Bearer warehousing-token" },
    });
    const adminResponse = await createProtectedApp("Admin").request("/api/quality/queue", {
      headers: { authorization: "Bearer admin-token" },
    });

    expect(customerResponse.status).toBe(403);
    expect(productionResponse.status).toBe(200);
    expect(warehousingResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
  });
});
