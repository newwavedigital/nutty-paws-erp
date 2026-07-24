import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AuthStore, RoleName } from "../src/auth/service";
import { registerImportRoutes } from "../src/imports/routes";
import { getImportSchema, ImportCommitConflictError, type ImportSnapshot, type ImportStore } from "../src/imports/service";

const emptySnapshot: ImportSnapshot = { customers: [], products: [], suppliers: [], masterItems: [], inventoryItems: [] };

function authStore(role: RoleName): AuthStore {
  return {
    async getUserByEmail() { return null; },
    async getUserById() { return { id: "user-1", email: "user@example.com", displayName: "User", userType: role === "Customer" ? "customer" : "employee", passwordHash: null, isActive: true }; },
    async createUser() {}, async countUsers() { return 1; }, async listUserRoles() { return [role]; }, async setUserRoles() {},
    async listCustomerAccess() { return []; }, async setCustomerAccess() {}, async createSession() {},
    async getSessionByTokenHash() { return { id: "session-1", userId: "user-1", tokenHash: "ignored", expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null }; },
    async revokeSession() {},
  };
}

function routeApp(role: RoleName, importStore: ImportStore) {
  return createApp(app => registerImportRoutes(app, () => importStore, () => authStore(role)), { AUTH_REQUIRED: "true" });
}

describe("bulk import routes", () => {
  it.each(["customers", "products", "suppliers", "inventory"] as const)("allows Admin to access the %s import schema", async (moduleName) => {
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() {} };
    const response = await routeApp("Admin", store).request(`/api/imports/${moduleName}/schema`, { headers: { authorization: "Bearer token" } });
    expect(response.status).toBe(200);
  });

  it.each([
    ["customers", "Sales"], ["products", "Sales"], ["suppliers", "Supply Chain & Procurement"],
    ["inventory", "Supply Chain & Procurement"], ["inventory", "Warehousing"],
  ] as const)("allows %s imports for %s", async (moduleName, role) => {
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() {} };
    const response = await routeApp(role, store).request(`/api/imports/${moduleName}/schema`, { headers: { authorization: "Bearer token" } });
    expect(response.status).toBe(200);
  });

  it.each([
    ["customers", "Production"], ["products", "Warehousing"], ["suppliers", "Sales"],
    ["inventory", "Production"], ["inventory", "Customer"],
  ] as const)("denies %s imports for %s", async (moduleName, role) => {
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() {} };
    const response = await routeApp(role, store).request(`/api/imports/${moduleName}/schema`, { headers: { authorization: "Bearer token" } });
    expect(response.status).toBe(403);
  });

  it("requires authentication and rejects unknown import modules", async () => {
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() {} };
    const app = routeApp("Admin", store);
    const unauthenticated = await app.request("/api/imports/customers/schema");
    const unknown = await app.request("/api/imports/not-a-module/schema", { headers: { authorization: "Bearer token" } });
    expect(unauthenticated.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect((await unknown.json() as { error: { code: string } }).error.code).toBe("IMPORT_MODULE_NOT_FOUND");
  });

  it("returns every validation error and performs no commit", async () => {
    let commits = 0;
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() { commits += 1; } };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/commit", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "", contact_name: "", contact_email: "bad", phone: "", status: "wrong" }], rowNumbers: [2], sourceFileBytes: 100 }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string; details: { preview: { errors: unknown[] } } } };
    expect(body.error.code).toBe("IMPORT_VALIDATION_FAILED");
    expect(body.error.details.preview.errors).toHaveLength(3);
    expect(commits).toBe(0);
  });

  it("rejects oversized files before loading or committing data", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers: [], rows: [], rowNumbers: [], sourceFileBytes: 5 * 1024 * 1024 + 1 }),
    });
    expect(response.status).toBe(413);
    expect(loads).toBe(0);
  });

  it.each([undefined, "100", -1, 1.5])("rejects invalid source file size metadata %j before loading data", async (sourceFileBytes) => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "One" }], rowNumbers: [2], sourceFileBytes }),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IMPORT_FILE_SIZE_REQUIRED");
    expect(loads).toBe(0);
  });

  it("accepts a source file exactly at the 5 MB boundary", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "Boundary" }], rowNumbers: [2], sourceFileBytes: 5 * 1024 * 1024 }),
    });
    expect(response.status).toBe(200);
    expect(loads).toBe(1);
  });

  it("rejects decoded payloads over 6 MB before loading data", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        headers,
        rows: [{ name: "Large", contact_name: "x".repeat(6 * 1024 * 1024) }],
        rowNumbers: [2],
        sourceFileBytes: 5 * 1024 * 1024,
      }),
    });
    expect(response.status).toBe(413);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IMPORT_PAYLOAD_TOO_LARGE");
    expect(loads).toBe(0);
  });

  it("enforces the raw request limit even when source file metadata understates the payload", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        headers,
        rows: [{ name: "Small declared file" }],
        rowNumbers: [2],
        sourceFileBytes: 1,
        ignoredPadding: "x".repeat(6 * 1024 * 1024),
      }),
    });
    expect(response.status).toBe(413);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IMPORT_PAYLOAD_TOO_LARGE");
    expect(loads).toBe(0);
  });

  it("rejects over-limit row arrays before walking rows or loading a snapshot", async () => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const rows = Array.from({ length: 501 }, (_, index) => ({ name: `Customer ${index}` }));
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows, rowNumbers: rows.map((_, index) => index + 2), sourceFileBytes: 100 }),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IMPORT_ROW_LIMIT_EXCEEDED");
    expect(loads).toBe(0);
  });

  it.each([
    [undefined, "required"],
    ["not-an-array", "required"],
    [[], "required"],
    [[1], "strictly increasing"],
    [[2.5], "strictly increasing"],
  ])("rejects invalid source row metadata %j before loading data", async (rowNumbers, message) => {
    let loads = 0;
    const store: ImportStore = { async loadSnapshot() { loads += 1; return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "One" }], rowNumbers, sourceFileBytes: 100 }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("IMPORT_ROW_NUMBERS_INVALID");
    expect(body.error.message).toContain(message);
    expect(loads).toBe(0);
  });

  it("returns physical source rows and zero projected counts for invalid files", async () => {
    const store: ImportStore = { async loadSnapshot() { return emptySnapshot; }, async commit() {} };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/preview", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({
        headers,
        rows: [{ name: "Valid" }, { name: "Invalid", contact_email: "bad" }],
        rowNumbers: [2, 9],
        sourceFileBytes: 100,
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { valid: boolean; creates: number; records: unknown[]; errors: Array<{ row: number; field: string }> } };
    expect(body.data).toMatchObject({ valid: false, creates: 0, records: [] });
    expect(body.data.errors).toContainEqual(expect.objectContaining({ row: 9, field: "contact_email" }));
  });

  it("blocks an existing Inventory Master SKU and refuses commit regardless of lots", async () => {
    let commits = 0;
    const multiLotSnapshot: ImportSnapshot = {
      ...emptySnapshot,
      masterItems: [{ id: "master-1", sku: "INV-MULTI", status: "active" }],
      inventoryItems: [{
        id: "inventory-1",
        masterItemId: "master-1",
        status: "active",
        onHandQuantity: 20,
        allocatedQuantity: 0,
        lotsJson: '[{"lotNumber":"LOT-A","qty":10},{"lotNumber":"LOT-B","qty":10}]',
      }],
    };
    const store: ImportStore = { async loadSnapshot() { return multiLotSnapshot; }, async commit() { commits += 1; } };
    const headers = getImportSchema("inventory").columns.map(column => column.key);
    const payload = JSON.stringify({
      headers,
      rows: [{ sku: "inv-multi", name: "Ingredient", category: "Ingredient", unit_of_measure: "LBS", on_hand_quantity: "20" }],
      rowNumbers: [17],
      sourceFileBytes: 100,
    });
    const app = routeApp("Warehousing", store);
    const previewResponse = await app.request("/api/imports/inventory/preview", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: payload });
    const commitResponse = await app.request("/api/imports/inventory/commit", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: payload });
    expect(previewResponse.status).toBe(200);
    expect(commitResponse.status).toBe(400);
    const previewBody = await previewResponse.json() as { data: { valid: boolean; records: unknown[]; errors: Array<{ row: number; code?: string; recordKey?: string }> } };
    const commitBody = await commitResponse.json() as { error: { details: { preview: { errors: Array<{ code?: string }> } } } };
    expect(previewBody.data).toMatchObject({ valid: false, records: [] });
    expect(previewBody.data.errors).toContainEqual(expect.objectContaining({ row: 17, code: "IMPORT_RECORD_EXISTS", recordKey: "inv-multi" }));
    expect(commitBody.error.details.preview.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_RECORD_EXISTS" }));
    expect(commits).toBe(0);
  });

  it("loads a fresh module snapshot for preview and commit", async () => {
    const loaded: string[] = [];
    let commits = 0;
    const store: ImportStore = {
      async loadSnapshot(module) { loaded.push(module); return emptySnapshot; },
      async commit() { commits += 1; },
    };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const payload = JSON.stringify({ headers, rows: [{ name: "New Customer" }], rowNumbers: [4], sourceFileBytes: 100 });
    const app = routeApp("Sales", store);
    const preview = await app.request("/api/imports/customers/preview", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: payload });
    const commit = await app.request("/api/imports/customers/commit", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: payload });
    expect(preview.status).toBe(200);
    expect(commit.status).toBe(200);
    expect(loaded).toEqual(["customers", "customers"]);
    expect(commits).toBe(1);
  });

  it("returns a clear stale-preview conflict when insert-only persistence loses a race", async () => {
    const store: ImportStore = {
      async loadSnapshot() { return emptySnapshot; },
      async commit() { throw new ImportCommitConflictError(); },
    };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/commit", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "Race" }], rowNumbers: [2], sourceFileBytes: 100 }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "IMPORT_PREVIEW_STALE", message: expect.stringContaining("Preview") } });
  });

  it("does not mask unrelated persistence failures as stale previews", async () => {
    const store: ImportStore = {
      async loadSnapshot() { return emptySnapshot; },
      async commit() { throw new Error("database unavailable"); },
    };
    const headers = getImportSchema("customers").columns.map(column => column.key);
    const response = await routeApp("Sales", store).request("/api/imports/customers/commit", {
      method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ headers, rows: [{ name: "Failure" }], rowNumbers: [2], sourceFileBytes: 100 }),
    });
    expect(response.status).toBe(500);
  });
});
