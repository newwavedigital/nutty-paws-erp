import type { DataRecord, DataRecordInput, DataRecordStatus, DataRecordStore, DataRecordUpdateInput } from "./service";

type DataRecordRow = {
  id: string;
  module: string;
  kind: string;
  title: string;
  status: DataRecordStatus;
  payload_json: string;
  file_ids_json: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

const ALLOWED_TABLES = new Set([
  "suppliers",
  "content_library_entries",
  "team_chat_entries",
  "food_safety_records",
  "machinery_records",
  "feedback_items",
]);

export class D1DataRecordStore implements DataRecordStore {
  constructor(
    private readonly db: D1Database,
    private readonly tableName: string,
    private readonly moduleName: string,
  ) {
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Unsupported data record table: ${tableName}`);
    }
  }

  async listRecords(input: { kind?: string; status?: DataRecordStatus } = {}): Promise<DataRecord[]> {
    const status = input.status ?? "active";
    const query = input.kind
      ? `
          SELECT id, module, kind, title, status, payload_json, file_ids_json,
                 created_by_user_id, updated_by_user_id, created_at, updated_at
          FROM ${this.tableName}
          WHERE kind = ?
            AND status = ?
          ORDER BY updated_at DESC, created_at DESC
        `
      : `
          SELECT id, module, kind, title, status, payload_json, file_ids_json,
                 created_by_user_id, updated_by_user_id, created_at, updated_at
          FROM ${this.tableName}
          WHERE status = ?
          ORDER BY updated_at DESC, created_at DESC
        `;

    const statement = this.db.prepare(query);
    const rows = input.kind
      ? await statement.bind(input.kind, status).all<DataRecordRow>()
      : await statement.bind(status).all<DataRecordRow>();

    return (rows.results ?? []).map(mapRecord);
  }

  async getRecord(recordId: string): Promise<DataRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, module, kind, title, status, payload_json, file_ids_json,
                 created_by_user_id, updated_by_user_id, created_at, updated_at
          FROM ${this.tableName}
          WHERE id = ?
        `,
      )
      .bind(recordId)
      .first<DataRecordRow>();

    return row ? mapRecord(row) : null;
  }

  async createRecord(input: DataRecordInput): Promise<DataRecord> {
    const record: DataRecord = {
      id: input.id,
      module: this.moduleName,
      kind: input.kind,
      title: input.title,
      status: "active",
      payload: input.payload ?? {},
      fileIds: input.fileIds ?? [],
      createdByUserId: input.actorUserId ?? null,
      updatedByUserId: input.actorUserId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.db
      .prepare(
        `
          INSERT INTO ${this.tableName} (
            id, module, kind, title, status, payload_json, file_ids_json,
            created_by_user_id, updated_by_user_id
          )
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
        `,
      )
      .bind(
        record.id,
        record.module,
        record.kind,
        record.title,
        JSON.stringify(record.payload),
        JSON.stringify(record.fileIds),
        record.createdByUserId,
        record.updatedByUserId,
      )
      .run();

    return (await this.getRecord(record.id)) ?? record;
  }

  async updateRecord(input: DataRecordUpdateInput): Promise<DataRecord | null> {
    const current = await this.getRecord(input.recordId);
    if (!current) return null;

    const updated = {
      ...current,
      title: input.title ?? current.title,
      payload: input.payload ?? current.payload,
      fileIds: input.fileIds ?? current.fileIds,
      updatedByUserId: input.actorUserId ?? null,
    };

    await this.db
      .prepare(
        `
          UPDATE ${this.tableName}
          SET title = ?,
              payload_json = ?,
              file_ids_json = ?,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(updated.title, JSON.stringify(updated.payload), JSON.stringify(updated.fileIds), updated.updatedByUserId, input.recordId)
      .run();

    return this.getRecord(input.recordId);
  }

  async archiveRecord(input: { recordId: string; actorUserId?: string | null }): Promise<DataRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE ${this.tableName}
          SET status = 'archived',
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.actorUserId ?? null, input.recordId)
      .run();

    return this.getRecord(input.recordId);
  }

  async createAuditEvent(input: {
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO audit_events (
            id, actor_user_id, entity_type, entity_id, action, metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(`audit_${crypto.randomUUID()}`, input.actorUserId ?? null, input.entityType, input.entityId, input.action, JSON.stringify(input.metadata))
      .run();
  }
}

function mapRecord(row: DataRecordRow): DataRecord {
  return {
    id: row.id,
    module: row.module,
    kind: row.kind,
    title: row.title,
    status: row.status,
    payload: parseJsonObject(row.payload_json),
    fileIds: parseJsonArray(row.file_ids_json),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
