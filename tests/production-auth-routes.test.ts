import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerProductionRoutes } from "../src/production/routes";
import type { ProductionStore } from "../src/production/service";

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

function createProductionStore(): ProductionStore {
  return {
    async getPurchaseOrder() { throw new Error("not used"); },
    async getProductionRunByPurchaseOrderId() { return null; },
    async getProductionRun() { return null; },
    async upsertProductionRun() { throw new Error("not used"); },
    async updatePurchaseOrderStatus() {},
    async listProductBomItems() { return []; },
    async findFinishedGoodInventoryItem() { return null; },
    async replaceRunLines() {},
    async replaceRunMaterials() {},
    async listInventoryEffects() { return []; },
    async clearInventoryEffects() {},
    async adjustInventory() {},
    async createInventoryEffect() {},
    async upsertInventoryLot() {},
    async finalizeRun() { throw new Error("not used"); },
    async reopenRun() { throw new Error("not used"); },
    async listProductionRuns() { return []; },
    async upsertProductionLog() {},
    async listProductionLogs() { return []; },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createProtectedApp(role: "Customer" | "Production" | "Warehousing" | "Admin") {
  return createApp((route) => {
    registerAuthRoutes(route, () => createAuthStore(role));
    registerProductionRoutes(route, () => createProductionStore(), () => createAuthStore(role));
  }, { AUTH_REQUIRED: "true" });
}

describe("protected production routes", () => {
  it("blocks Customer users and allows Production/Warehousing users", async () => {
    const customerResponse = await createProtectedApp("Customer").request("/api/production/logs", {
      headers: { authorization: "Bearer customer-token" },
    });
    const productionResponse = await createProtectedApp("Production").request("/api/production/logs", {
      headers: { authorization: "Bearer production-token" },
    });
    const warehousingResponse = await createProtectedApp("Warehousing").request("/api/production/logs", {
      headers: { authorization: "Bearer warehousing-token" },
    });

    expect(customerResponse.status).toBe(403);
    expect(productionResponse.status).toBe(200);
    expect(warehousingResponse.status).toBe(200);
  });

  it("allows Admin users through the existing admin override", async () => {
    const adminResponse = await createProtectedApp("Admin").request("/api/production/logs", {
      headers: { authorization: "Bearer admin-token" },
    });

    expect(adminResponse.status).toBe(200);
  });
});
