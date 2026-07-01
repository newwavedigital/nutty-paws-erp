import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerQualityRoutes } from "../src/quality/routes";
import type { QualityPurchaseOrderRecord, QualityStore } from "../src/quality/service";

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

function makePO(overrides: Partial<QualityPurchaseOrderRecord> = {}): QualityPurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "qa_review",
    requestedShipDate: null,
    notes: null,
    qaReleasedAt: null,
    qaReleasedByUserId: null,
    qaReleaseType: null,
    qaNotes: null,
    qaSkippedAt: null,
    qaSkippedByUserId: null,
    qaSkipReason: null,
    postShipmentCoaFileId: null,
    lines: [
      { id: "line-1", productId: "product-1", quantity: 10, description: "Product", productIsOwnBrand: true },
    ],
    ...overrides,
  };
}

function createQualityStore(): QualityStore {
  let po = makePO();
  return {
    async listQualityQueue() { return [po]; },
    async getPurchaseOrder(id) { return id === po.id ? po : null; },
    async getActiveCoaFile(purchaseOrderId, fileId) {
      return purchaseOrderId === po.id && fileId === "coa-1"
        ? { id: "coa-1", ownerType: "purchase_order", ownerId: po.id, fileCategory: "coa", status: "active", fileName: "coa.pdf" }
        : null;
    },
    async releaseInventoryLots() { return 1; },
    async updatePurchaseOrderQualityRelease(input) {
      po = { ...po, status: input.routeStatus, qaReleaseType: input.releaseType, qaReleasedAt: input.releasedAt, qaReleasedByUserId: input.releasedByUserId ?? null, qaNotes: input.notes ?? null };
      return po;
    },
    async updatePurchaseOrderQualitySkip(input) {
      po = { ...po, status: input.routeStatus, qaSkippedAt: input.skippedAt, qaSkippedByUserId: input.skippedByUserId ?? null, qaSkipReason: input.skipReason, qaNotes: input.notes ?? null };
      return po;
    },
    async attachPostShipmentCoaFile(input) {
      po = { ...po, postShipmentCoaFileId: input.fileId };
      return po;
    },
    async updatePurchaseOrderQualityNotes(input) {
      po = { ...po, qaNotes: input.notes };
      return po;
    },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createRouteApp(role: "Customer" | "Production" | "Warehousing" | "Admin") {
  const authStore = createAuthStore(role);
  const qualityStore = createQualityStore();
  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerQualityRoutes(route, () => qualityStore, () => authStore);
  }, { AUTH_REQUIRED: "true" });
  return app;
}

describe("quality routes", () => {
  it("lists and processes QA queue actions", async () => {
    const app = createRouteApp("Production");

    const queue = await app.request("/api/quality/queue", {
      headers: { authorization: "Bearer production-token" },
    });
    const release = await app.request("/api/quality/purchase-orders/po-1/release", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer production-token" },
      body: JSON.stringify({ coaFileId: "coa-1", notes: "ready" }),
    });
    const postShipment = await app.request("/api/quality/purchase-orders/po-1/post-shipment-coa", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer production-token" },
      body: JSON.stringify({ coaFileId: "coa-1" }),
    });

    expect(queue.status).toBe(200);
    expect(release.status).toBe(200);
    expect(postShipment.status).toBe(200);
    await expect(postShipment.json()).resolves.toMatchObject({ ok: true, data: { postShipmentCoaFileId: "coa-1" } });
  });

  it("returns validation errors for missing QA skip reasons", async () => {
    const app = createRouteApp("Warehousing");

    const response = await app.request("/api/quality/purchase-orders/po-1/skip", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer warehousing-token" },
      body: JSON.stringify({ reason: "" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("saves standalone QA notes through a backend note endpoint", async () => {
    const app = createRouteApp("Production");

    const response = await app.request("/api/quality/purchase-orders/po-1/notes", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: "Bearer production-token" },
      body: JSON.stringify({ notes: "hold for lab review" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { qaNotes: "hold for lab review" },
    });
  });
});
