import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerContentLibraryRoutes } from "../src/content-library/routes";
import { registerFeedbackRoutes } from "../src/feedback/routes";
import { registerFoodSafetyRoutes } from "../src/food-safety/routes";
import { registerMachineryRoutes } from "../src/machinery/routes";
import type { AuthStore, RoleName } from "../src/auth/service";
import type { DataRecord, DataRecordStore } from "../src/records/service";
import { registerSupplierRoutes } from "../src/suppliers/routes";
import { registerTeamChatRoutes } from "../src/team-chat/routes";

type ModuleCase = {
  basePath: string;
  kind: string;
  register: (app: ReturnType<typeof createApp>, store: DataRecordStore, authStore?: AuthStore) => void;
};

function makeRecord(module: string, kind: string, overrides: Partial<DataRecord> = {}): DataRecord {
  return {
    id: `${module}_seed`,
    module,
    kind,
    title: `${module} seed`,
    status: "active",
    payload: { seeded: true },
    fileIds: [],
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...overrides,
  };
}

function createStore(module: string, kind: string) {
  const records = new Map<string, DataRecord>([[`${module}_seed`, makeRecord(module, kind)]]);
  const store: DataRecordStore = {
    async listRecords(input = {}) {
      return [...records.values()].filter((record) => {
        if (input.kind && record.kind !== input.kind) return false;
        if (input.status && record.status !== input.status) return false;
        return true;
      });
    },
    async getRecord(recordId) {
      return records.get(recordId) ?? null;
    },
    async createRecord(input) {
      const record = makeRecord(input.module, input.kind, {
        id: input.id,
        title: input.title,
        payload: input.payload ?? {},
        fileIds: input.fileIds ?? [],
        createdByUserId: input.actorUserId ?? null,
        updatedByUserId: input.actorUserId ?? null,
      });
      records.set(record.id, record);
      return record;
    },
    async updateRecord(input) {
      const current = records.get(input.recordId);
      if (!current) return null;
      const updated = {
        ...current,
        title: input.title ?? current.title,
        payload: input.payload ?? current.payload,
        fileIds: input.fileIds ?? current.fileIds,
        updatedByUserId: input.actorUserId ?? null,
      };
      records.set(updated.id, updated);
      return updated;
    },
    async archiveRecord(input) {
      const current = records.get(input.recordId);
      if (!current) return null;
      const updated = { ...current, status: "archived" as const, updatedByUserId: input.actorUserId ?? null };
      records.set(updated.id, updated);
      return updated;
    },
    async createAuditEvent() {},
  };
  return store;
}

function createAuthStore(role: "Customer" | "Sales" | "Admin"): AuthStore {
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

function moduleNameFromPath(basePath: string) {
  if (basePath === "/api/suppliers") return "supplier";
  return basePath.replace("/api/", "").replace(/-/g, "_");
}

const moduleCases: ModuleCase[] = [
  { basePath: "/api/suppliers", kind: "supplier", register: (app, store, authStore) => registerSupplierRoutes(app, () => store, authStore ? () => authStore : undefined) },
  { basePath: "/api/content-library", kind: "folder", register: (app, store, authStore) => registerContentLibraryRoutes(app, () => store, authStore ? () => authStore : undefined) },
  { basePath: "/api/team-chat", kind: "channel", register: (app, store, authStore) => registerTeamChatRoutes(app, () => store, authStore ? () => authStore : undefined) },
  { basePath: "/api/food-safety", kind: "complaint", register: (app, store, authStore) => registerFoodSafetyRoutes(app, () => store, authStore ? () => authStore : undefined) },
  { basePath: "/api/machinery", kind: "maintenance", register: (app, store, authStore) => registerMachineryRoutes(app, () => store, authStore ? () => authStore : undefined) },
  { basePath: "/api/feedback", kind: "general", register: (app, store, authStore) => registerFeedbackRoutes(app, () => store, authStore ? () => authStore : undefined) },
];

describe("Sprint A8 data record routes", () => {
  it.each(moduleCases)("supports list/create/read/update/archive for $basePath", async ({ basePath, kind, register }) => {
    const moduleName = moduleNameFromPath(basePath);
    const store = createStore(moduleName, kind);
    const app = createApp((hono) => register(hono, store));

    const list = await app.request(`${basePath}?kind=${kind}`);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ ok: true, data: [expect.objectContaining({ kind })] });

    const created = await app.request(basePath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        title: "Created record",
        payload: { priority: "High" },
        fileIds: ["file-1"],
      }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { data: DataRecord };
    expect(createdBody.data).toMatchObject({ module: moduleName, kind, title: "Created record", fileIds: ["file-1"] });

    const read = await app.request(`${basePath}/${createdBody.data.id}`);
    expect(read.status).toBe(200);

    const updated = await app.request(`${basePath}/${createdBody.data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated record", payload: { priority: "Low" } }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ data: { title: "Updated record", payload: { priority: "Low" } } });

    const archived = await app.request(`${basePath}/${createdBody.data.id}`, { method: "DELETE" });
    expect(archived.status).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({ data: { status: "archived" } });
  });

  it("rejects unsupported kinds", async () => {
    const store = createStore("food_safety", "complaint");
    const app = createApp((hono) => registerFoodSafetyRoutes(hono, () => store));

    const response = await app.request("/api/food-safety", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "not-real", title: "Bad record" }),
    });

    expect(response.status).toBe(400);
  });

  it.each(moduleCases)("blocks Customer users from employee-only $basePath reads and writes", async ({ basePath, kind, register }) => {
    const moduleName = moduleNameFromPath(basePath);
    const store = createStore(moduleName, kind);
    const authStore = createAuthStore("Customer");
    const app = createApp((hono) => register(hono, store, authStore), { AUTH_REQUIRED: "true" });
    const headers = { authorization: "Bearer customer-token", "content-type": "application/json" };

    const list = await app.request(`${basePath}?kind=${kind}`, { headers });
    const read = await app.request(`${basePath}/${moduleName}_seed`, { headers });
    const update = await app.request(`${basePath}/${moduleName}_seed`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ title: "Customer update" }),
    });
    const archive = await app.request(`${basePath}/${moduleName}_seed`, {
      method: "DELETE",
      headers,
    });

    expect(list.status).toBe(403);
    expect(read.status).toBe(403);
    expect(update.status).toBe(403);
    expect(archive.status).toBe(403);
  });

  it.each(moduleCases.filter((moduleCase) => moduleCase.basePath !== "/api/feedback"))(
    "blocks Customer users from creating employee-only $basePath records",
    async ({ basePath, kind, register }) => {
      const moduleName = moduleNameFromPath(basePath);
      const store = createStore(moduleName, kind);
      const authStore = createAuthStore("Customer");
      const app = createApp((hono) => register(hono, store, authStore), { AUTH_REQUIRED: "true" });

      const created = await app.request(basePath, {
        method: "POST",
        headers: { authorization: "Bearer customer-token", "content-type": "application/json" },
        body: JSON.stringify({ kind, title: "Customer create", payload: { priority: "High" } }),
      });

      expect(created.status).toBe(403);
    },
  );

  it("allows authenticated Customer users to create feedback but blocks feedback list/update/archive", async () => {
    const store = createStore("feedback", "general");
    const authStore = createAuthStore("Customer");
    const app = createApp((hono) => registerFeedbackRoutes(hono, () => store, () => authStore), { AUTH_REQUIRED: "true" });
    const headers = { authorization: "Bearer customer-token", "content-type": "application/json" };

    const created = await app.request("/api/feedback", {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "general", title: "Customer feedback", payload: { note: "Found an issue" } }),
    });
    const list = await app.request("/api/feedback?kind=general", { headers });
    const update = await app.request("/api/feedback/feedback_seed", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ title: "Customer update" }),
    });
    const archive = await app.request("/api/feedback/feedback_seed", { method: "DELETE", headers });

    expect(created.status).toBe(200);
    expect(list.status).toBe(403);
    expect(update.status).toBe(403);
    expect(archive.status).toBe(403);
  });

  it.each(moduleCases)("allows employee users through protected $basePath routes", async ({ basePath, kind, register }) => {
    const moduleName = moduleNameFromPath(basePath);
    const store = createStore(moduleName, kind);
    const authStore = createAuthStore("Sales");
    const app = createApp((hono) => register(hono, store, authStore), { AUTH_REQUIRED: "true" });

    const list = await app.request(`${basePath}?kind=${kind}`, {
      headers: { authorization: "Bearer sales-token" },
    });

    expect(list.status).toBe(200);
  });
});
