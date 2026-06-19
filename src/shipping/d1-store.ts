import type {
  ShipmentDocumentFileRecord,
  ShippingDetailsRecord,
  ShippingLogRecord,
  ShippingPurchaseOrderLineRecord,
  ShippingPurchaseOrderRecord,
  ShippingStore,
} from "./service";

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  customer_id: string;
  status: string;
  requested_ship_date: string | null;
  notes: string | null;
  shipped_at: string | null;
  shipped_by_user_id: string | null;
  stocked_at: string | null;
  stocked_by_user_id: string | null;
  shipping_notes: string | null;
  shipment_document_file_id: string | null;
};

type PurchaseOrderLineRow = {
  id: string;
  product_id: string | null;
  quantity: number;
  description: string;
  product_is_own_brand: number | null;
};

type ShippingDetailsRow = {
  id: string;
  purchase_order_id: string;
  bol_number: string | null;
  pro_number: string | null;
  carrier: string | null;
  freight_class: string | null;
  notes: string | null;
  pallet_list_json: string | null;
  shipment_document_file_id: string | null;
  updated_at: string;
};

type ShipmentDocumentFileRow = {
  id: string;
  owner_type: "purchase_order";
  owner_id: string;
  file_category: "shipment_document";
  status: "active";
  file_name: string;
};

type ShippingLogRow = {
  id: string;
  purchase_order_id: string;
  shipping_log_number: string;
  shipped_at: string | null;
  stocked_at: string | null;
  carrier: string | null;
  bol_number: string | null;
  pro_number: string | null;
  pallet_list_json: string | null;
  weight: number | null;
  items_snapshot_json: string;
  created_at: string;
};

export class D1ShippingStore implements ShippingStore {
  constructor(private readonly db: D1Database) {}

  async listShippingQueue(): Promise<ShippingPurchaseOrderRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, requested_ship_date, notes,
                 shipped_at, shipped_by_user_id, stocked_at, stocked_by_user_id,
                 shipping_notes, shipment_document_file_id
          FROM purchase_orders
          WHERE status = 'shipping'
             OR (
               status = 'completed'
               AND stocked_at IS NULL
               AND shipped_at IS NULL
               AND (qa_released_at IS NOT NULL OR qa_skipped_at IS NOT NULL)
             )
          ORDER BY updated_at DESC, created_at DESC, id DESC
        `,
      )
      .all<PurchaseOrderRow>();
    const hydrated = await Promise.all((rows.results ?? []).map((row) => this.hydratePurchaseOrder(row)));
    return hydrated.filter((po) => po.status === "shipping" || isInternalOwnBrand(po));
  }

  async listShippingLogs(): Promise<ShippingLogRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, shipping_log_number, shipped_at, stocked_at,
                 carrier, bol_number, pro_number, pallet_list_json, weight,
                 items_snapshot_json, created_at
          FROM shipping_logs
          ORDER BY COALESCE(shipped_at, stocked_at, created_at) DESC, shipping_log_number DESC
        `,
      )
      .all<ShippingLogRow>();
    return (rows.results ?? []).map(mapShippingLogRow);
  }

  async getPurchaseOrder(id: string): Promise<ShippingPurchaseOrderRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, requested_ship_date, notes,
                 shipped_at, shipped_by_user_id, stocked_at, stocked_by_user_id,
                 shipping_notes, shipment_document_file_id
          FROM purchase_orders
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<PurchaseOrderRow>();
    return row ? this.hydratePurchaseOrder(row) : null;
  }

  async getActiveShipmentDocument(purchaseOrderId: string, fileId: string): Promise<ShipmentDocumentFileRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, owner_type, owner_id, file_category, status, file_name
          FROM file_metadata
          WHERE id = ?
            AND owner_type = 'purchase_order'
            AND owner_id = ?
            AND file_category = 'shipment_document'
            AND status = 'active'
        `,
      )
      .bind(fileId, purchaseOrderId)
      .first<ShipmentDocumentFileRow>();
    return row ? mapShipmentDocumentRow(row) : null;
  }

  async findActiveShipmentDocument(purchaseOrderId: string): Promise<ShipmentDocumentFileRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, owner_type, owner_id, file_category, status, file_name
          FROM file_metadata
          WHERE owner_type = 'purchase_order'
            AND owner_id = ?
            AND file_category = 'shipment_document'
            AND status = 'active'
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
      )
      .bind(purchaseOrderId)
      .first<ShipmentDocumentFileRow>();
    return row ? mapShipmentDocumentRow(row) : null;
  }

  async upsertShippingDetails(input: {
    purchaseOrderId: string;
    bolNumber?: string | null;
    proNumber?: string | null;
    carrier?: string | null;
    freightClass?: string | null;
    notes?: string | null;
    palletListJson?: string | null;
    shipmentDocumentFileId?: string | null;
  }): Promise<ShippingDetailsRecord> {
    const existing = await this.getShippingDetails(input.purchaseOrderId);
    const id = existing?.id ?? `shipping_details_${crypto.randomUUID()}`;
    await this.db
      .prepare(
        `
          INSERT INTO shipping_details (
            id, purchase_order_id, bol_number, pro_number, carrier, freight_class,
            notes, pallet_list_json, shipment_document_file_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(purchase_order_id) DO UPDATE SET
            bol_number = excluded.bol_number,
            pro_number = excluded.pro_number,
            carrier = excluded.carrier,
            freight_class = excluded.freight_class,
            notes = excluded.notes,
            pallet_list_json = excluded.pallet_list_json,
            shipment_document_file_id = excluded.shipment_document_file_id,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        id,
        input.purchaseOrderId,
        input.bolNumber ?? null,
        input.proNumber ?? null,
        input.carrier ?? null,
        input.freightClass ?? null,
        input.notes ?? null,
        input.palletListJson ?? null,
        input.shipmentDocumentFileId ?? null,
      )
      .run();
    const details = await this.getShippingDetails(input.purchaseOrderId);
    if (!details) throw new Error("Shipping details upsert failed");
    return details;
  }

  async markPurchaseOrderShipped(input: {
    purchaseOrderId: string;
    shippedAt: string;
    shippedByUserId?: string;
    shipmentDocumentFileId: string;
    notes?: string | null;
  }): Promise<ShippingPurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET status = 'completed',
              shipped_at = COALESCE(shipped_at, ?),
              shipped_by_user_id = COALESCE(shipped_by_user_id, ?),
              shipment_document_file_id = ?,
              shipping_notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.shippedAt, input.shippedByUserId ?? null, input.shipmentDocumentFileId, input.notes ?? null, input.purchaseOrderId)
      .run();
    return this.getPurchaseOrder(input.purchaseOrderId);
  }

  async markPurchaseOrderStocked(input: {
    purchaseOrderId: string;
    stockedAt: string;
    stockedByUserId?: string;
  }): Promise<ShippingPurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET status = 'completed',
              stocked_at = COALESCE(stocked_at, ?),
              stocked_by_user_id = COALESCE(stocked_by_user_id, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.stockedAt, input.stockedByUserId ?? null, input.purchaseOrderId)
      .run();
    return this.getPurchaseOrder(input.purchaseOrderId);
  }

  async upsertShippingLog(input: {
    purchaseOrderId: string;
    shippedAt?: string | null;
    stockedAt?: string | null;
    carrier?: string | null;
    bolNumber?: string | null;
    proNumber?: string | null;
    palletListJson?: string | null;
    weight?: number | null;
    itemsSnapshotJson: string;
  }): Promise<ShippingLogRecord> {
    const existing = await this.getShippingLog(input.purchaseOrderId);
    const id = existing?.id ?? `shipping_log_${crypto.randomUUID()}`;
    const logNumber = existing?.shippingLogNumber ?? (await this.nextShippingLogNumber());
    await this.db
      .prepare(
        `
          INSERT INTO shipping_logs (
            id, purchase_order_id, shipping_log_number, shipped_at, stocked_at,
            carrier, bol_number, pro_number, pallet_list_json, weight, items_snapshot_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(purchase_order_id) DO UPDATE SET
            shipped_at = COALESCE(excluded.shipped_at, shipping_logs.shipped_at),
            stocked_at = COALESCE(excluded.stocked_at, shipping_logs.stocked_at),
            carrier = COALESCE(excluded.carrier, shipping_logs.carrier),
            bol_number = COALESCE(excluded.bol_number, shipping_logs.bol_number),
            pro_number = COALESCE(excluded.pro_number, shipping_logs.pro_number),
            pallet_list_json = COALESCE(excluded.pallet_list_json, shipping_logs.pallet_list_json),
            weight = COALESCE(excluded.weight, shipping_logs.weight),
            items_snapshot_json = excluded.items_snapshot_json,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        id,
        input.purchaseOrderId,
        logNumber,
        input.shippedAt ?? null,
        input.stockedAt ?? null,
        input.carrier ?? null,
        input.bolNumber ?? null,
        input.proNumber ?? null,
        input.palletListJson ?? null,
        input.weight ?? null,
        input.itemsSnapshotJson,
      )
      .run();
    const log = await this.getShippingLog(input.purchaseOrderId);
    if (!log) throw new Error("Shipping log upsert failed");
    return log;
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

  private async hydratePurchaseOrder(row: PurchaseOrderRow): Promise<ShippingPurchaseOrderRecord> {
    const [lines, details] = await Promise.all([
      this.db
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
        .all<PurchaseOrderLineRow>(),
      this.getShippingDetails(row.id),
    ]);

    return {
      id: row.id,
      poNumber: row.po_number,
      customerId: row.customer_id,
      status: row.status,
      requestedShipDate: row.requested_ship_date,
      notes: row.notes,
      shippedAt: row.shipped_at,
      shippedByUserId: row.shipped_by_user_id,
      stockedAt: row.stocked_at,
      stockedByUserId: row.stocked_by_user_id,
      shippingNotes: row.shipping_notes,
      shipmentDocumentFileId: row.shipment_document_file_id,
      lines: (lines.results ?? []).map(mapLineRow),
      shippingDetails: details,
    };
  }

  private async getShippingDetails(purchaseOrderId: string): Promise<ShippingDetailsRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, bol_number, pro_number, carrier, freight_class,
                 notes, pallet_list_json, shipment_document_file_id, updated_at
          FROM shipping_details
          WHERE purchase_order_id = ?
        `,
      )
      .bind(purchaseOrderId)
      .first<ShippingDetailsRow>();
    return row ? mapShippingDetailsRow(row) : null;
  }

  private async getShippingLog(purchaseOrderId: string): Promise<ShippingLogRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, shipping_log_number, shipped_at, stocked_at,
                 carrier, bol_number, pro_number, pallet_list_json, weight,
                 items_snapshot_json, created_at
          FROM shipping_logs
          WHERE purchase_order_id = ?
        `,
      )
      .bind(purchaseOrderId)
      .first<ShippingLogRow>();
    return row ? mapShippingLogRow(row) : null;
  }

  private async nextShippingLogNumber() {
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM shipping_logs").first<{ count: number }>();
    return `SL-${String((row?.count ?? 0) + 1).padStart(6, "0")}`;
  }
}

function mapLineRow(row: PurchaseOrderLineRow): ShippingPurchaseOrderLineRecord {
  return {
    id: row.id,
    productId: row.product_id,
    quantity: row.quantity,
    description: row.description,
    productIsOwnBrand: row.product_is_own_brand === 1,
  };
}

function mapShippingDetailsRow(row: ShippingDetailsRow): ShippingDetailsRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    bolNumber: row.bol_number,
    proNumber: row.pro_number,
    carrier: row.carrier,
    freightClass: row.freight_class,
    notes: row.notes,
    palletListJson: row.pallet_list_json,
    shipmentDocumentFileId: row.shipment_document_file_id,
    updatedAt: row.updated_at,
  };
}

function mapShipmentDocumentRow(row: ShipmentDocumentFileRow): ShipmentDocumentFileRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileCategory: row.file_category,
    status: row.status,
    fileName: row.file_name,
  };
}

function mapShippingLogRow(row: ShippingLogRow): ShippingLogRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    shippingLogNumber: row.shipping_log_number,
    shippedAt: row.shipped_at,
    stockedAt: row.stocked_at,
    carrier: row.carrier,
    bolNumber: row.bol_number,
    proNumber: row.pro_number,
    palletListJson: row.pallet_list_json,
    weight: row.weight,
    itemsSnapshotJson: row.items_snapshot_json,
    createdAt: row.created_at,
  };
}

function isInternalOwnBrand(po: ShippingPurchaseOrderRecord) {
  return po.lines.length > 0 && po.lines.every((line) => line.productId && line.productIsOwnBrand);
}
