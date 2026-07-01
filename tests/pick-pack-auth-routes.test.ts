import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerPickPackRoutes } from "../src/pick-pack/routes";
import type { PickPackStore } from "../src/pick-pack/service";

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

function createPickPackStore(): PickPackStore {
  return {
    async listOrders() { return []; },
    async getOrder() { return null; },
    async customerExists() { return true; },
    async getFinishedGoodInventoryItem() { return null; },
    async nextPickPackSequence() { return 1001; },
    async createOrder() { throw new Error("not used"); },
    async replaceOrderLines() {},
    async updateOrder() { throw new Error("not used"); },
    async completePickPackPick() { throw new Error("not used"); },
    async markOrderShipped() { throw new Error("not used"); },
    async cancelOrder() { throw new Error("not used"); },
    async upsertShippingDetails() { throw new Error("not used"); },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createProtectedApp(role: "Customer" | "Production" | "Warehousing" | "Admin") {
  const authStore = createAuthStore(role);
  const pickPackStore = createPickPackStore();
  return createApp((app) => {
    registerAuthRoutes(app, () => authStore);
    registerPickPackRoutes(app, () => pickPackStore, () => authStore);
  }, { AUTH_REQUIRED: "true" });
}

describe("protected pick pack routes", () => {
  it("blocks Customer users and allows Production/Warehousing/Admin users", async () => {
    const customerResponse = await createProtectedApp("Customer").request("/api/pick-pack/orders", {
      headers: { authorization: "Bearer customer-token" },
    });
    const productionResponse = await createProtectedApp("Production").request("/api/pick-pack/orders", {
      headers: { authorization: "Bearer production-token" },
    });
    const warehousingResponse = await createProtectedApp("Warehousing").request("/api/pick-pack/orders", {
      headers: { authorization: "Bearer warehousing-token" },
    });
    const adminResponse = await createProtectedApp("Admin").request("/api/pick-pack/orders", {
      headers: { authorization: "Bearer admin-token" },
    });

    expect(customerResponse.status).toBe(403);
    expect(productionResponse.status).toBe(200);
    expect(warehousingResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
  });
});
