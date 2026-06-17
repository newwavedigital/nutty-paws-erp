import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { hashPassword, type AuthSessionRecord, type AuthStore, type AuthUserRecord, type CustomerAccessRecord, type RoleName } from "../src/auth/service";
import { registerFileRoutes } from "../src/files/routes";
import type { FileMetadataRecord, FileStore } from "../src/files/service";
import { registerPurchaseOrderRoutes } from "../src/purchase-orders/routes";
import type { InventoryStore } from "../src/inventory/service";
import type { PurchaseOrderRecord, PurchaseOrderStore } from "../src/purchase-orders/service";

function makePO(overrides: Partial<PurchaseOrderRecord> = {}): PurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "draft",
    depositStatus: "received",
    requestedShipDate: null,
    notes: null,
    lines: [{ id: "line-1", purchaseOrderId: "po-1", lineNumber: 1, description: "Cashews", quantity: 25, unitOfMeasure: "lb", productId: null, masterItemId: "master-1", supplyChainStatus: "available" }],
    ...overrides,
  };
}

function createPOStore() {
  const purchaseOrders = new Map<string, PurchaseOrderRecord>([
    ["po-1", makePO()],
    ["po-2", makePO({ id: "po-2", poNumber: "PO-2002", customerId: "customer-2" })],
  ]);
  const calls: string[] = [];
  const store: PurchaseOrderStore & { calls: string[] } = {
    calls,
    async createPurchaseOrder(input) { calls.push(`create:${input.customerId}:${input.createdByUserId}`); purchaseOrders.set(input.id, makePO({ id: input.id, poNumber: input.poNumber, customerId: input.customerId, notes: input.notes, requestedShipDate: input.requestedShipDate, lines: [] })); },
    async createPurchaseOrderLine(input) { const po = purchaseOrders.get(input.purchaseOrderId)!; purchaseOrders.set(po.id, { ...po, lines: [...po.lines, { ...input, supplyChainStatus: "pending" }] }); },
    async listPurchaseOrders() { return [...purchaseOrders.values()]; },
    async getPurchaseOrder(id) { return purchaseOrders.get(id) ?? null; },
    async updatePurchaseOrderSafeFields(id, input) { const po = purchaseOrders.get(id); if (!po) return null; const updated = { ...po, ...input }; purchaseOrders.set(id, updated); return updated; },
    async updatePurchaseOrderStatus(id, status) { const po = purchaseOrders.get(id)!; purchaseOrders.set(id, { ...po, status }); },
    async updatePurchaseOrderDepositStatus(id, depositStatus) { const po = purchaseOrders.get(id)!; purchaseOrders.set(id, { ...po, depositStatus }); },
    async updateLineSupplyChainStatus(lineId, status) { calls.push(`review:${lineId}:${status}`); },
    async createStatusEvent(input) { calls.push(`statusEvent:${input.actorUserId}`); },
    async createAuditEvent(input) { calls.push(`audit:${input.actorUserId}:${input.action}`); },
    async findInventoryItemByMasterItemId() { return { id: "inv-1" }; },
  };
  return store;
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
  return { store, users, roles, customerAccess };
}

async function seedUser(data: ReturnType<typeof createAuthStore>, input: { id: string; email: string; role: RoleName; customerId?: string }) {
  data.users.set(input.id, { id: input.id, email: input.email, displayName: input.email, userType: input.role === "Customer" ? "customer" : "employee", passwordHash: await hashPassword("secret123"), isActive: true });
  data.roles.set(input.id, [input.role]);
  if (input.customerId) data.customerAccess.set(input.id, [{ customerId: input.customerId, accessLevel: "manager" }]);
}

function createRouteApp(authStore: AuthStore, poStore: PurchaseOrderStore = createPOStore()) {
  return createApp((app) => {
    registerAuthRoutes(app, () => authStore);
    registerPurchaseOrderRoutes(app, () => poStore, () => createInventoryStore(), () => authStore);
  }, { AUTH_REQUIRED: "true" });
}

function createR2() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    async put(key: string, value: ArrayBuffer | Blob) {
      objects.set(key, value instanceof Blob ? await value.arrayBuffer() : value);
      return { key };
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new Blob([object]).stream(),
        httpMetadata: { contentType: "application/pdf" },
      };
    },
  } as unknown as R2Bucket;
}

function createFileStore(poStore: PurchaseOrderStore) {
  const files = new Map<string, FileMetadataRecord>();
  const store: FileStore = {
    async createFileMetadata(record) {
      files.set(record.id, record);
    },
    async listFilesByOwner(ownerType, ownerId) {
      return [...files.values()].filter((record) => record.ownerType === ownerType && record.ownerId === ownerId && record.status === "active");
    },
    async getFileMetadata(fileId) {
      return files.get(fileId) ?? null;
    },
    async softDeleteFile(fileId, input) {
      const existing = files.get(fileId);
      if (!existing || existing.status === "deleted") return null;
      const updated = {
        ...existing,
        status: "deleted" as const,
        deletedAt: "2026-06-17T00:00:00.000Z",
        deletedByUserId: input.deletedByUserId ?? null,
      };
      files.set(fileId, updated);
      return updated;
    },
    async createAuditEvent() {},
    async resolveOwnerCustomerId(ownerType, ownerId) {
      if (ownerType === "customer") return ownerId;
      if (ownerType === "purchase_order") return (await poStore.getPurchaseOrder(ownerId))?.customerId ?? null;
      if (ownerType === "purchase_order_line") {
        const purchaseOrders = await poStore.listPurchaseOrders();
        return purchaseOrders.find((po) => po.lines.some((line) => line.id === ownerId))?.customerId ?? null;
      }
      return null;
    },
  };
  return { store, files };
}

function createPOAndFileRouteApp(authStore: AuthStore, poStore: PurchaseOrderStore, fileStore: FileStore, bucket: R2Bucket) {
  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerPurchaseOrderRoutes(route, () => poStore, () => createInventoryStore(), () => authStore);
    registerFileRoutes(route, () => fileStore, () => authStore);
  }, { AUTH_REQUIRED: "true" });

  return (request: Request) => app.fetch(request, { FILES: bucket } as Env);
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "secret123" }) });
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

async function loginViaFetch(app: ReturnType<typeof createPOAndFileRouteApp>, email: string) {
  const response = await app(new Request("http://test.local/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret123" }),
  }));
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

describe("protected purchase order routes", () => {
  it("requires login when AUTH_REQUIRED is true", async () => {
    const data = createAuthStore();
    const app = createRouteApp(data.store);

    const response = await app.request("/api/purchase-orders");

    expect(response.status).toBe(401);
  });

  it("scopes Customer users to their linked customer purchase orders", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    const app = createRouteApp(data.store);
    const token = await login(app, "customer@example.com");

    const list = await app.request("/api/purchase-orders", { headers: { authorization: `Bearer ${token}` } });
    expect(list.status).toBe(200);
    const listBody = await list.json() as { data: PurchaseOrderRecord[] };
    expect(listBody.data.map((po) => po.customerId)).toEqual(["customer-1"]);

    const forbiddenRead = await app.request("/api/purchase-orders/po-2", { headers: { authorization: `Bearer ${token}` } });
    expect(forbiddenRead.status).toBe(403);
  });

  it("allows Customer users to create only for their linked customer and ignores spoofed actor ids", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    const poStore = createPOStore();
    const app = createRouteApp(data.store, poStore);
    const token = await login(app, "customer@example.com");

    const create = await app.request("/api/purchase-orders", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ poNumber: "PO-CUST", customerId: "customer-1", actorUserId: "spoofed", lines: [{ description: "Cashews", quantity: 1, unitOfMeasure: "lb" }] }),
    });
    expect(create.status).toBe(200);
    expect(poStore.calls).toContainEqual(expect.stringContaining("customer-user"));

    const forbiddenCreate = await app.request("/api/purchase-orders", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ poNumber: "PO-BAD", customerId: "customer-2", lines: [{ description: "Cashews", quantity: 1, unitOfMeasure: "lb" }] }),
    });
    expect(forbiddenCreate.status).toBe(403);
  });

  it("blocks Customer approval but allows Supply Chain approval", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    await seedUser(data, { id: "sc-user", email: "sc@example.com", role: "Supply Chain & Procurement" });
    const app = createRouteApp(data.store);
    const customerToken = await login(app, "customer@example.com");
    const scToken = await login(app, "sc@example.com");

    const blocked = await app.request("/api/purchase-orders/po-1/approve-for-production", { method: "POST", headers: { authorization: `Bearer ${customerToken}` } });
    expect(blocked.status).toBe(403);

    const approved = await app.request("/api/purchase-orders/po-1/approve-for-production", { method: "POST", headers: { authorization: `Bearer ${scToken}` } });
    expect(approved.status).toBe(200);
  });

  it("allows linked customers to create a PO, attach a PO file, and blocks cross-customer file access", async () => {
    const data = createAuthStore();
    await seedUser(data, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    await seedUser(data, { id: "other-customer-user", email: "other@example.com", role: "Customer", customerId: "customer-2" });
    await seedUser(data, { id: "sales-user", email: "sales@example.com", role: "Sales" });
    const poStore = createPOStore();
    const fileStore = createFileStore(poStore);
    const bucket = createR2();
    const app = createPOAndFileRouteApp(data.store, poStore, fileStore.store, bucket);
    const customerToken = await loginViaFetch(app, "customer@example.com");
    const otherCustomerToken = await loginViaFetch(app, "other@example.com");
    const salesToken = await loginViaFetch(app, "sales@example.com");

    const create = await app(new Request("http://test.local/api/purchase-orders", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        poNumber: "PO-CUSTOMER-FILE",
        customerId: "customer-1",
        actorUserId: "spoofed-user",
        lines: [{ description: "Custom packed cashews", quantity: 12, unitOfMeasure: "case" }],
      }),
    }));
    expect(create.status).toBe(200);
    const createBody = await create.json() as { data: PurchaseOrderRecord };
    const createdPoId = createBody.data.id;
    expect(poStore.calls).toContainEqual(expect.stringContaining("customer-user"));

    const form = new FormData();
    form.set("ownerType", "purchase_order");
    form.set("ownerId", createdPoId);
    form.set("fileCategory", "po_file");
    form.set("file", new File(["customer po"], "customer-po.pdf", { type: "application/pdf" }));
    const upload = await app(new Request("http://test.local/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${customerToken}` },
      body: form,
    }));
    expect(upload.status).toBe(200);
    const uploadBody = await upload.json() as { data: FileMetadataRecord };

    const ownList = await app(new Request(`http://test.local/api/files?ownerType=purchase_order&ownerId=${createdPoId}`, {
      headers: { authorization: `Bearer ${customerToken}` },
    }));
    expect(ownList.status).toBe(200);
    await expect(ownList.json()).resolves.toMatchObject({ data: [{ fileName: "customer-po.pdf" }] });

    const ownDownload = await app(new Request(`http://test.local/api/files/${uploadBody.data.id}/download`, {
      headers: { authorization: `Bearer ${customerToken}` },
    }));
    expect(ownDownload.status).toBe(200);
    await expect(ownDownload.text()).resolves.toBe("customer po");

    const forbiddenList = await app(new Request(`http://test.local/api/files?ownerType=purchase_order&ownerId=${createdPoId}`, {
      headers: { authorization: `Bearer ${otherCustomerToken}` },
    }));
    expect(forbiddenList.status).toBe(403);

    const forbiddenDownload = await app(new Request(`http://test.local/api/files/${uploadBody.data.id}/download`, {
      headers: { authorization: `Bearer ${otherCustomerToken}` },
    }));
    expect(forbiddenDownload.status).toBe(403);

    const salesList = await app(new Request("http://test.local/api/purchase-orders", {
      headers: { authorization: `Bearer ${salesToken}` },
    }));
    expect(salesList.status).toBe(200);
    const salesBody = await salesList.json() as { data: PurchaseOrderRecord[] };
    expect(salesBody.data.some((po) => po.id === createdPoId && po.customerId === "customer-1")).toBe(true);
  });
});
