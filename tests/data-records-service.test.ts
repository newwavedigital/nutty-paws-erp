import { describe, expect, it } from "vitest";
import {
  archiveDataRecord,
  createDataRecord,
  readDataRecord,
  updateDataRecord,
  type DataRecord,
  type DataRecordStore,
} from "../src/records/service";

function makeRecord(overrides: Partial<DataRecord> = {}): DataRecord {
  return {
    id: "supplier_1",
    module: "supplier",
    kind: "supplier",
    title: "Acme Nuts",
    status: "active",
    payload: { contact: "Ava" },
    fileIds: [],
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...overrides,
  };
}

function createStore(seed: DataRecord[] = []) {
  const records = new Map(seed.map((record) => [record.id, record]));
  const auditEvents: Array<{ action: string; entityId: string }> = [];
  const store: DataRecordStore & { auditEvents: Array<{ action: string; entityId: string }> } = {
    auditEvents,
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
      const record = makeRecord({
        id: input.id,
        module: input.module,
        kind: input.kind,
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
      const archived = { ...current, status: "archived" as const, updatedByUserId: input.actorUserId ?? null };
      records.set(archived.id, archived);
      return archived;
    },
    async createAuditEvent(input) {
      auditEvents.push({ action: input.action, entityId: input.entityId });
    },
  };
  return { store, records };
}

describe("data record service", () => {
  it("creates, updates, reads, archives, and audits generic module records", async () => {
    const { store } = createStore();

    const created = await createDataRecord(store, {
      id: "supplier_created",
      module: "supplier",
      kind: "supplier",
      title: "Acme Nuts",
      payload: { email: "ops@example.com" },
      fileIds: ["file-1"],
      actorUserId: "admin-1",
    });

    expect(created).toMatchObject({
      id: "supplier_created",
      module: "supplier",
      kind: "supplier",
      title: "Acme Nuts",
      fileIds: ["file-1"],
    });

    const updated = await updateDataRecord(store, {
      recordId: created.id,
      title: "Acme Ingredients",
      payload: { email: "new@example.com" },
      actorUserId: "admin-2",
    });

    expect(updated).toMatchObject({ title: "Acme Ingredients", updatedByUserId: "admin-2" });
    await expect(readDataRecord(store, created.id)).resolves.toMatchObject({ title: "Acme Ingredients" });

    const archived = await archiveDataRecord(store, created.id, "admin-3");
    expect(archived.status).toBe("archived");
    expect(store.auditEvents.map((event) => event.action)).toEqual(["supplier.created", "supplier.updated", "supplier.archived"]);
  });

  it("rejects invalid inputs and blocks archived edits", async () => {
    const { store } = createStore([makeRecord({ id: "archived", status: "archived" })]);

    await expect(createDataRecord(store, {
      id: "bad",
      module: "supplier",
      kind: "supplier",
      title: "",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(updateDataRecord(store, {
      recordId: "archived",
      title: "Nope",
    })).rejects.toMatchObject({ code: "DATA_RECORD_ARCHIVED", status: 409 });
  });
});
