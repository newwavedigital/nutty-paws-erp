import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerAuthRoutes } from "../src/auth/routes";
import { hashPassword, type AuthSessionRecord, type AuthStore, type AuthUserRecord, type CustomerAccessRecord, type RoleName } from "../src/auth/service";
import { registerFileRoutes } from "../src/files/routes";
import type { FileMetadataRecord, FileStore } from "../src/files/service";

function makeRecord(overrides: Partial<FileMetadataRecord> = {}): FileMetadataRecord {
  return {
    id: "file-1",
    ownerType: "customer",
    ownerId: "customer-1",
    fileCategory: "customer_spec_sheet",
    storageProvider: "r2",
    storageKey: "files/customer/customer-1/customer_spec_sheet/file-1-spec.pdf",
    fileName: "spec.pdf",
    contentType: "application/pdf",
    sizeBytes: 4,
    uploadedByUserId: "customer-user",
    createdAt: "2026-06-17T00:00:00.000Z",
    status: "active",
    deletedAt: null,
    deletedByUserId: null,
    ...overrides,
  };
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
  data.users.set(input.id, {
    id: input.id,
    email: input.email,
    displayName: input.email,
    userType: input.role === "Customer" ? "customer" : "employee",
    passwordHash: await hashPassword("secret123"),
    isActive: true,
  });
  data.roles.set(input.id, [input.role]);
  if (input.customerId) data.customerAccess.set(input.id, [{ customerId: input.customerId, accessLevel: "manager" }]);
}

function createStore(records: FileMetadataRecord[] = []) {
  const files = new Map(records.map((record) => [record.id, record]));
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
      if (ownerId === "po-1") return "customer-1";
      if (ownerId === "po-2") return "customer-2";
      return null;
    },
  };
  return store;
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

function createRouteApp(authStore: AuthStore, fileStore: FileStore, bucket: R2Bucket) {
  const app = createApp((route) => {
    registerAuthRoutes(route, () => authStore);
    registerFileRoutes(route, () => fileStore, () => authStore);
  }, { AUTH_REQUIRED: "true" });

  return (request: Request) => app.fetch(request, { FILES: bucket } as Env);
}

async function login(app: ReturnType<typeof createRouteApp>, email: string) {
  const response = await app(new Request("http://test.local/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret123" }),
  }));
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

describe("protected file routes", () => {
  it("requires login when AUTH_REQUIRED is true", async () => {
    const auth = createAuthStore();
    const app = createRouteApp(auth.store, createStore(), createR2());

    const response = await app(new Request("http://test.local/api/files?ownerType=customer&ownerId=customer-1"));

    expect(response.status).toBe(401);
  });

  it("allows linked customers to upload, list, and download only their own files", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    const bucket = createR2();
    const store = createStore([makeRecord()]);
    const app = createRouteApp(auth.store, store, bucket);
    const token = await login(app, "customer@example.com");
    await bucket.put("files/customer/customer-1/customer_spec_sheet/file-1-spec.pdf", new TextEncoder().encode("spec"));

    const list = await app(new Request("http://test.local/api/files?ownerType=customer&ownerId=customer-1", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(list.status).toBe(200);

    const download = await app(new Request("http://test.local/api/files/file-1/download", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(download.status).toBe(200);
    await expect(download.text()).resolves.toBe("spec");

    const form = new FormData();
    form.set("ownerType", "customer");
    form.set("ownerId", "customer-1");
    form.set("fileCategory", "customer_spec_sheet");
    form.set("file", new File(["spec"], "spec.pdf", { type: "application/pdf" }));
    const upload = await app(new Request("http://test.local/api/files", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }));
    expect(upload.status).toBe(200);

    const forbidden = await app(new Request("http://test.local/api/files?ownerType=customer&ownerId=customer-2", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(forbidden.status).toBe(403);

    const unresolvedOwner = await app(new Request("http://test.local/api/files?ownerType=product&ownerId=product-without-customer", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(unresolvedOwner.status).toBe(403);
  });

  it("blocks customer soft-delete but allows Admin soft-delete", async () => {
    const auth = createAuthStore();
    await seedUser(auth, { id: "customer-user", email: "customer@example.com", role: "Customer", customerId: "customer-1" });
    await seedUser(auth, { id: "admin-user", email: "admin@example.com", role: "Admin" });
    const app = createRouteApp(auth.store, createStore([makeRecord()]), createR2());
    const customerToken = await login(app, "customer@example.com");
    const adminToken = await login(app, "admin@example.com");

    const blocked = await app(new Request("http://test.local/api/files/file-1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${customerToken}` },
    }));
    expect(blocked.status).toBe(403);

    const deleted = await app(new Request("http://test.local/api/files/file-1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${adminToken}` },
    }));
    expect(deleted.status).toBe(200);
    const body = await deleted.json() as { data: FileMetadataRecord };
    expect(body.data).toMatchObject({ status: "deleted", deletedByUserId: "admin-user" });
  });
});
