import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerShippingRoutes } from "../src/shipping/routes";
import type { ShippingStore } from "../src/shipping/service";

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

function createShippingStore(): ShippingStore {
  return {
    async listShippingQueue() { return []; },
    async listShippingLogs() { return []; },
    async getPurchaseOrder() { return null; },
    async getActiveShipmentDocument() { return null; },
    async findActiveShipmentDocument() { return null; },
    async upsertShippingDetails() { throw new Error("not used"); },
    async markPurchaseOrderShipped() { throw new Error("not used"); },
    async markPurchaseOrderStocked() { throw new Error("not used"); },
    async upsertShippingLog() { throw new Error("not used"); },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createProtectedApp(role: "Customer" | "Production" | "Warehousing" | "Admin") {
  const authStore = createAuthStore(role);
  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerShippingRoutes(route, () => createShippingStore(), () => authStore);
  }, { AUTH_REQUIRED: "true" });
  return app;
}

describe("protected shipping routes", () => {
  it("blocks Customer users and allows Production/Warehousing/Admin users", async () => {
    const customerResponse = await createProtectedApp("Customer").request("/api/shipping/queue", {
      headers: { authorization: "Bearer customer-token" },
    });
    const productionResponse = await createProtectedApp("Production").request("/api/shipping/queue", {
      headers: { authorization: "Bearer production-token" },
    });
    const warehousingResponse = await createProtectedApp("Warehousing").request("/api/shipping/queue", {
      headers: { authorization: "Bearer warehousing-token" },
    });
    const adminResponse = await createProtectedApp("Admin").request("/api/shipping/queue", {
      headers: { authorization: "Bearer admin-token" },
    });

    expect(customerResponse.status).toBe(403);
    expect(productionResponse.status).toBe(200);
    expect(warehousingResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
  });
});
