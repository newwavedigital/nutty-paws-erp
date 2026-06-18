import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { registerProcurementRoutes } from "../src/procurement/routes";
import type { AuthStore } from "../src/auth/service";
import type { ProcurementStore } from "../src/procurement/service";

function createAuthStore(role: "customer" | "employee"): AuthStore {
  return {
    async createUser() { throw new Error("not used"); },
    async getUserByEmail() { return null; },
    async getUserById(id) {
      return {
        id,
        email: `${id}@example.com`,
        displayName: id,
        userType: role === "customer" ? "customer" : "employee",
        passwordHash: null,
        isActive: true,
      };
    },
    async listUserRoles() { return role === "employee" ? ["Supply Chain & Procurement"] : ["Customer"]; },
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

function createProcurementStore(): ProcurementStore {
  return {
    async listNeedToOrderRows() { return []; },
    async nextOrderSequence() { return 1001; },
    async nextReceiptSequence() { return 2001; },
    async createOrder() {},
    async createOrderLine() {},
    async listOrders() { return []; },
    async getOrder() { return null; },
    async updateOrder() {},
    async updateLineReceivedQuantity() {},
    async createReceipt() {},
    async createReceiptLine() {},
    async increaseInventory() {},
    async createAuditEvent() {},
  };
}

function createProtectedApp(role: "customer" | "employee") {
  return createApp((route) => {
    registerAuthRoutes(route, () => createAuthStore(role));
    registerProcurementRoutes(route, () => createProcurementStore(), () => createAuthStore(role));
  }, { AUTH_REQUIRED: "true" });
}

describe("protected procurement routes", () => {
  it("blocks Customer users and allows employee Procurement users", async () => {
    const customerResponse = await createProtectedApp("customer").request("/api/procurement/orders", {
      headers: { authorization: "Bearer customer-token" },
    });
    const employeeResponse = await createProtectedApp("employee").request("/api/procurement/orders", {
      headers: { authorization: "Bearer employee-token" },
    });

    expect(customerResponse.status).toBe(403);
    expect(employeeResponse.status).toBe(200);
  });
});
