import type {
  QualityCoaFileRecord,
  QualityPurchaseOrderLineRecord,
  QualityPurchaseOrderRecord,
  QualityReleaseType,
  QualityStore,
} from "./service";

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  customer_id: string;
  status: string;
  requested_ship_date: string | null;
  notes: string | null;
  qa_released_at: string | null;
  qa_released_by_user_id: string | null;
  qa_release_type: QualityReleaseType | null;
  qa_notes: string | null;
  qa_skipped_at: string | null;
  qa_skipped_by_user_id: string | null;
  qa_skip_reason: string | null;
  post_shipment_coa_file_id: string | null;
};

type PurchaseOrderLineRow = {
  id: string;
  product_id: string | null;
  quantity: number;
  description: string;
  product_is_own_brand: number | null;
};

type QualityCoaFileRow = {
  id: string;
  owner_type: "purchase_order";
  owner_id: string;
  file_category: "coa";
  status: "active";
  file_name: string;
};

export class D1QualityStore implements QualityStore {
  constructor(private readonly db: D1Database) {}

  async listQualityQueue(): Promise<QualityPurchaseOrderRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, requested_ship_date, notes,
                 qa_released_at, qa_released_by_user_id, qa_release_type,
                 qa_notes, qa_skipped_at, qa_skipped_by_user_id, qa_skip_reason,
                 post_shipment_coa_file_id
          FROM purchase_orders
          WHERE status = 'qa_review'
          ORDER BY created_at DESC, id DESC
        `,
      )
      .all<PurchaseOrderRow>();
    return Promise.all((rows.results ?? []).map((row) => this.hydratePurchaseOrder(row)));
  }

  async getPurchaseOrder(id: string): Promise<QualityPurchaseOrderRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, requested_ship_date, notes,
                 qa_released_at, qa_released_by_user_id, qa_release_type,
                 qa_notes, qa_skipped_at, qa_skipped_by_user_id, qa_skip_reason,
                 post_shipment_coa_file_id
          FROM purchase_orders
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<PurchaseOrderRow>();
    return row ? this.hydratePurchaseOrder(row) : null;
  }

  async getActiveCoaFile(purchaseOrderId: string, fileId: string): Promise<QualityCoaFileRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, owner_type, owner_id, file_category, status, file_name
          FROM file_metadata
          WHERE id = ?
            AND owner_type = 'purchase_order'
            AND owner_id = ?
            AND file_category = 'coa'
            AND status = 'active'
        `,
      )
      .bind(fileId, purchaseOrderId)
      .first<QualityCoaFileRow>();
    return row ? mapCoaFileRow(row) : null;
  }

  async releaseInventoryLots(purchaseOrderId: string): Promise<number> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_lots
          SET status = 'released',
              updated_at = CURRENT_TIMESTAMP
          WHERE purchase_order_id = ?
            AND status = 'qa_review'
        `,
      )
      .bind(purchaseOrderId)
      .run();
    return result.meta.changes ?? 0;
  }

  async updatePurchaseOrderQualityRelease(input: {
    purchaseOrderId: string;
    routeStatus: "shipping" | "completed";
    releaseType: QualityReleaseType;
    releasedAt: string;
    releasedByUserId?: string;
    notes?: string | null;
  }): Promise<QualityPurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET status = ?,
              qa_released_at = ?,
              qa_released_by_user_id = ?,
              qa_release_type = ?,
              qa_notes = ?,
              qa_skipped_at = NULL,
              qa_skipped_by_user_id = NULL,
              qa_skip_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.routeStatus,
        input.releasedAt,
        input.releasedByUserId ?? null,
        input.releaseType,
        input.notes ?? null,
        input.purchaseOrderId,
      )
      .run();
    return this.getPurchaseOrder(input.purchaseOrderId);
  }

  async updatePurchaseOrderQualitySkip(input: {
    purchaseOrderId: string;
    routeStatus: "shipping" | "completed";
    skippedAt: string;
    skippedByUserId?: string;
    skipReason: string;
    notes?: string | null;
  }): Promise<QualityPurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET status = ?,
              qa_released_at = NULL,
              qa_released_by_user_id = NULL,
              qa_release_type = NULL,
              qa_notes = ?,
              qa_skipped_at = ?,
              qa_skipped_by_user_id = ?,
              qa_skip_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.routeStatus,
        input.notes ?? null,
        input.skippedAt,
        input.skippedByUserId ?? null,
        input.skipReason,
        input.purchaseOrderId,
      )
      .run();
    return this.getPurchaseOrder(input.purchaseOrderId);
  }

  async attachPostShipmentCoaFile(input: { purchaseOrderId: string; fileId: string }): Promise<QualityPurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET post_shipment_coa_file_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.fileId, input.purchaseOrderId)
      .run();
    return this.getPurchaseOrder(input.purchaseOrderId);
  }

  async createStatusEvent(input: {
    purchaseOrderId: string;
    fromStatus: string | null;
    toStatus: string;
    eventType: string;
    actorUserId?: string;
    note?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO purchase_order_status_events (
            id, purchase_order_id, from_status, to_status, event_type, note, created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `po_status_event_${crypto.randomUUID()}`,
        input.purchaseOrderId,
        input.fromStatus,
        input.toStatus,
        input.eventType,
        input.note ?? null,
        input.actorUserId ?? null,
      )
      .run();
  }

  async createAuditEvent(input: {
    actorUserId?: string;
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

  private async hydratePurchaseOrder(row: PurchaseOrderRow): Promise<QualityPurchaseOrderRecord> {
    const lines = await this.db
      .prepare(
        `
          SELECT pol.id, pol.product_id, pol.quantity, pol.description,
                 COALESCE(p.is_own_brand, 0) AS product_is_own_brand
          FROM purchase_order_lines pol
          LEFT JOIN products p ON p.id = pol.product_id
          WHERE pol.purchase_order_id = ?
          ORDER BY pol.line_number ASC
        `,
      )
      .bind(row.id)
      .all<PurchaseOrderLineRow>();

    return {
      id: row.id,
      poNumber: row.po_number,
      customerId: row.customer_id,
      status: row.status,
      requestedShipDate: row.requested_ship_date,
      notes: row.notes,
      qaReleasedAt: row.qa_released_at,
      qaReleasedByUserId: row.qa_released_by_user_id,
      qaReleaseType: row.qa_release_type,
      qaNotes: row.qa_notes,
      qaSkippedAt: row.qa_skipped_at,
      qaSkippedByUserId: row.qa_skipped_by_user_id,
      qaSkipReason: row.qa_skip_reason,
      postShipmentCoaFileId: row.post_shipment_coa_file_id,
      lines: (lines.results ?? []).map(mapLineRow),
    };
  }
}

function mapLineRow(row: PurchaseOrderLineRow): QualityPurchaseOrderLineRecord {
  return {
    id: row.id,
    productId: row.product_id,
    quantity: row.quantity,
    description: row.description,
    productIsOwnBrand: row.product_is_own_brand === 1,
  };
}

function mapCoaFileRow(row: QualityCoaFileRow): QualityCoaFileRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileCategory: row.file_category,
    status: row.status,
    fileName: row.file_name,
  };
}
