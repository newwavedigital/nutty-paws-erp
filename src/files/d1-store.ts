import type { FileCategory, FileMetadataRecord, FileOwnerType, FileStatus, FileStore } from "./service";

type FileMetadataRow = {
  id: string;
  owner_type: FileOwnerType;
  owner_id: string;
  file_category: FileCategory;
  storage_provider: "r2";
  storage_key: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by_user_id: string | null;
  created_at: string;
  status: FileStatus;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
};

export class D1FileStore implements FileStore {
  constructor(private readonly db: D1Database) {}

  async createFileMetadata(record: FileMetadataRecord): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO file_metadata (
            id,
            owner_type,
            owner_id,
            file_category,
            storage_provider,
            storage_key,
            file_name,
            content_type,
            size_bytes,
            uploaded_by_user_id,
            status,
            deleted_at,
            deleted_by_user_id
          )
          VALUES (?, ?, ?, ?, 'r2', ?, ?, ?, ?, ?, 'active', NULL, NULL)
        `,
      )
      .bind(
        record.id,
        record.ownerType,
        record.ownerId,
        record.fileCategory,
        record.storageKey,
        record.fileName,
        record.contentType,
        record.sizeBytes,
        record.uploadedByUserId,
      )
      .run();
  }

  async listFilesByOwner(ownerType: FileOwnerType, ownerId: string): Promise<FileMetadataRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, owner_type, owner_id, file_category, storage_provider, storage_key,
                 file_name, content_type, size_bytes, uploaded_by_user_id, created_at,
                 status, deleted_at, deleted_by_user_id
          FROM file_metadata
          WHERE owner_type = ?
            AND owner_id = ?
            AND status = 'active'
          ORDER BY created_at DESC
        `,
      )
      .bind(ownerType, ownerId)
      .all<FileMetadataRow>();

    return (rows.results ?? []).map(mapFileRow);
  }

  async getFileMetadata(fileId: string): Promise<FileMetadataRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, owner_type, owner_id, file_category, storage_provider, storage_key,
                 file_name, content_type, size_bytes, uploaded_by_user_id, created_at,
                 status, deleted_at, deleted_by_user_id
          FROM file_metadata
          WHERE id = ?
        `,
      )
      .bind(fileId)
      .first<FileMetadataRow>();

    return row ? mapFileRow(row) : null;
  }

  async softDeleteFile(fileId: string, input: { deletedByUserId?: string | null }): Promise<FileMetadataRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE file_metadata
          SET status = 'deleted',
              deleted_at = CURRENT_TIMESTAMP,
              deleted_by_user_id = ?
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(input.deletedByUserId ?? null, fileId)
      .run();

    return this.getFileMetadata(fileId);
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
            id,
            actor_user_id,
            entity_type,
            entity_id,
            action,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `audit_${crypto.randomUUID()}`,
        input.actorUserId ?? null,
        input.entityType,
        input.entityId,
        input.action,
        JSON.stringify(input.metadata),
      )
      .run();
  }

  async resolveOwnerCustomerId(ownerType: FileOwnerType, ownerId: string): Promise<string | null> {
    if (ownerType === "customer") return ownerId;

    if (ownerType === "purchase_order") {
      return this.lookupCustomer("SELECT customer_id FROM purchase_orders WHERE id = ?", ownerId);
    }

    if (ownerType === "purchase_order_line") {
      return this.lookupCustomer(
        `
          SELECT po.customer_id
          FROM purchase_order_lines pol
          JOIN purchase_orders po ON po.id = pol.purchase_order_id
          WHERE pol.id = ?
        `,
        ownerId,
      );
    }

    if (ownerType === "rd_request") {
      return this.lookupCustomer("SELECT customer_id FROM rd_requests WHERE id = ?", ownerId);
    }

    if (ownerType === "product") {
      return this.lookupCustomer("SELECT customer_id FROM products WHERE id = ?", ownerId);
    }

    if (ownerType === "inventory_item") {
      return this.lookupCustomer("SELECT customer_id FROM inventory_items WHERE id = ?", ownerId);
    }

    return null;
  }

  private async lookupCustomer(query: string, id: string) {
    const row = await this.db.prepare(query).bind(id).first<{ customer_id: string | null }>();
    return row?.customer_id ?? null;
  }
}

function mapFileRow(row: FileMetadataRow): FileMetadataRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileCategory: row.file_category,
    storageProvider: "r2",
    storageKey: row.storage_key,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: row.created_at,
    status: row.status,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
  };
}
