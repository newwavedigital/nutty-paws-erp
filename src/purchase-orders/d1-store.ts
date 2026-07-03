import type {
  DepositStatus,
  POChangeRequestStatus,
  POChangeRequestType,
  ProductBomItemRecord,
  PurchaseOrderChangeRequestRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  PurchaseOrderStore,
  SupplyChainStatus,
} from "./service";

type PORow = {
  id: string;
  po_number: string;
  customer_id: string;
  status: PurchaseOrderStatus;
  deposit_status: DepositStatus;
  requested_ship_date: string | null;
  notes: string | null;
  post_shipment_coa_file_id: string | null;
};

type POLineRow = {
  id: string;
  purchase_order_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_of_measure: string;
  product_id: string | null;
  master_item_id: string | null;
  supply_chain_status: SupplyChainStatus;
};

type ProductBomItemRow = {
  product_id: string;
  master_item_id: string;
  quantity_per_unit: number;
};

type POChangeRequestRow = {
  id: string;
  purchase_order_id: string;
  customer_id: string;
  request_type: POChangeRequestType;
  message: string;
  status: POChangeRequestStatus;
  requested_by_user_id: string | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
};

export class D1PurchaseOrderStore implements PurchaseOrderStore {
  constructor(private readonly db: D1Database) {}

  async createPurchaseOrder(input: {
    id: string;
    poNumber: string;
    customerId: string;
    requestedShipDate: string | null;
    notes: string | null;
    createdByUserId?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO purchase_orders (
            id,
            po_number,
            customer_id,
            status,
            deposit_status,
            requested_ship_date,
            notes,
            created_by_user_id
          )
          VALUES (?, ?, ?, 'draft', 'not_required', ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.poNumber,
        input.customerId,
        input.requestedShipDate,
        input.notes,
        input.createdByUserId ?? null,
      )
      .run();
  }

  async createPurchaseOrderLine(input: {
    id: string;
    purchaseOrderId: string;
    lineNumber: number;
    description: string;
    quantity: number;
    unitOfMeasure: string;
    productId: string | null;
    masterItemId: string | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO purchase_order_lines (
            id,
            purchase_order_id,
            line_number,
            description,
            quantity,
            unit_of_measure,
            product_id,
            master_item_id,
            supply_chain_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `,
      )
      .bind(
        input.id,
        input.purchaseOrderId,
        input.lineNumber,
        input.description,
        input.quantity,
        input.unitOfMeasure,
        input.productId,
        input.masterItemId,
      )
      .run();
  }

  async listPurchaseOrders(): Promise<PurchaseOrderRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, deposit_status, requested_ship_date, notes,
                 post_shipment_coa_file_id
          FROM purchase_orders
          ORDER BY created_at DESC
        `,
      )
      .all<PORow>();

    return Promise.all((rows.results ?? []).map((row) => this.hydratePO(row)));
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrderRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, po_number, customer_id, status, deposit_status, requested_ship_date, notes,
                 post_shipment_coa_file_id
          FROM purchase_orders
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<PORow>();

    return row ? this.hydratePO(row) : null;
  }

  async updatePurchaseOrderSafeFields(
    id: string,
    input: { notes?: string | null; requestedShipDate?: string | null },
  ): Promise<PurchaseOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET notes = COALESCE(?, notes),
              requested_ship_date = COALESCE(?, requested_ship_date),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.notes ?? null, input.requestedShipDate ?? null, id)
      .run();

    return this.getPurchaseOrder(id);
  }

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<void> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET status = ?,
              submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
              approved_for_production_at = CASE WHEN ? = 'approved_for_production' THEN CURRENT_TIMESTAMP ELSE approved_for_production_at END,
              cancelled_at = CASE WHEN ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(status, status, status, status, id)
      .run();
  }

  async transitionPurchaseOrder(input: {
    purchaseOrderId: string;
    fromStatus: PurchaseOrderStatus | null;
    toStatus: PurchaseOrderStatus;
    eventType: string;
    actorUserId?: string;
    note?: string;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `
            UPDATE purchase_orders
            SET status = ?,
                submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
                approved_for_production_at = CASE WHEN ? = 'approved_for_production' THEN CURRENT_TIMESTAMP ELSE approved_for_production_at END,
                cancelled_at = CASE WHEN ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
        )
        .bind(input.toStatus, input.toStatus, input.toStatus, input.toStatus, input.purchaseOrderId),
      this.db
        .prepare(
          `
            INSERT INTO purchase_order_status_events (
              id,
              purchase_order_id,
              from_status,
              to_status,
              event_type,
              note,
              created_by_user_id
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
        ),
      this.db
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
          "purchase_order",
          input.purchaseOrderId,
          input.eventType,
          JSON.stringify({ fromStatus: input.fromStatus, toStatus: input.toStatus }),
        ),
    ]);
  }

  async updatePurchaseOrderDepositStatus(id: string, depositStatus: DepositStatus): Promise<void> {
    await this.db
      .prepare(
        `
          UPDATE purchase_orders
          SET deposit_status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(depositStatus, id)
      .run();
  }

  async updateLineSupplyChainStatus(lineId: string, status: SupplyChainStatus): Promise<void> {
    await this.db
      .prepare(
        `
          UPDATE purchase_order_lines
          SET supply_chain_status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(status, lineId)
      .run();
  }

  async createStatusEvent(input: {
    purchaseOrderId: string;
    fromStatus: PurchaseOrderStatus | null;
    toStatus: PurchaseOrderStatus;
    eventType: string;
    actorUserId?: string;
    note?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO purchase_order_status_events (
            id,
            purchase_order_id,
            from_status,
            to_status,
            event_type,
            note,
            created_by_user_id
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

  async findInventoryItemByMasterItemId(masterItemId: string): Promise<{ id: string } | null> {
    const row = await this.db
      .prepare("SELECT id FROM inventory_items WHERE master_item_id = ?")
      .bind(masterItemId)
      .first<{ id: string }>();

    return row ? { id: row.id } : null;
  }

  async listProductBomItems(productId: string): Promise<ProductBomItemRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT product_id, master_item_id, quantity_per_unit
          FROM product_bom_items
          WHERE product_id = ?
          ORDER BY master_item_id
        `,
      )
      .bind(productId)
      .all<ProductBomItemRow>();

    return (rows.results ?? []).map((row) => ({
      productId: row.product_id,
      masterItemId: row.master_item_id,
      quantityPerUnit: row.quantity_per_unit,
    }));
  }

  async createChangeRequest(input: {
    id: string;
    purchaseOrderId: string;
    customerId: string;
    requestType: POChangeRequestType;
    message: string;
    requestedByUserId?: string;
  }): Promise<PurchaseOrderChangeRequestRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO purchase_order_change_requests (
            id,
            purchase_order_id,
            customer_id,
            request_type,
            message,
            status,
            requested_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, 'open', ?)
        `,
      )
      .bind(
        input.id,
        input.purchaseOrderId,
        input.customerId,
        input.requestType,
        input.message,
        input.requestedByUserId ?? null,
      )
      .run();
    const record = await this.getChangeRequest(input.id);
    if (!record) throw new Error("Failed to create PO change request");
    return record;
  }

  async listChangeRequests(purchaseOrderId: string): Promise<PurchaseOrderChangeRequestRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, customer_id, request_type, message, status,
                 requested_by_user_id, resolved_by_user_id, resolution_note
          FROM purchase_order_change_requests
          WHERE purchase_order_id = ?
          ORDER BY created_at DESC
        `,
      )
      .bind(purchaseOrderId)
      .all<POChangeRequestRow>();
    return (rows.results ?? []).map(mapChangeRequestRow);
  }

  async getChangeRequest(id: string): Promise<PurchaseOrderChangeRequestRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, customer_id, request_type, message, status,
                 requested_by_user_id, resolved_by_user_id, resolution_note
          FROM purchase_order_change_requests
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<POChangeRequestRow>();
    return row ? mapChangeRequestRow(row) : null;
  }

  async resolveChangeRequest(
    id: string,
    input: {
      status: Exclude<POChangeRequestStatus, "open">;
      resolvedByUserId?: string;
      resolutionNote?: string | null;
    },
  ): Promise<PurchaseOrderChangeRequestRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE purchase_order_change_requests
          SET status = ?,
              resolved_by_user_id = ?,
              resolution_note = ?,
              resolved_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.status, input.resolvedByUserId ?? null, input.resolutionNote ?? null, id)
      .run();
    return this.getChangeRequest(id);
  }

  private async hydratePO(row: PORow): Promise<PurchaseOrderRecord> {
    const lines = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, line_number, description, quantity, unit_of_measure,
                 product_id, master_item_id, supply_chain_status
          FROM purchase_order_lines
          WHERE purchase_order_id = ?
          ORDER BY line_number ASC
        `,
      )
      .bind(row.id)
      .all<POLineRow>();

    return {
      id: row.id,
      poNumber: row.po_number,
      customerId: row.customer_id,
      status: row.status,
      depositStatus: row.deposit_status,
      requestedShipDate: row.requested_ship_date,
      notes: row.notes,
      postShipmentCoaFileId: row.post_shipment_coa_file_id,
      lines: (lines.results ?? []).map((line): PurchaseOrderLineRecord => ({
        id: line.id,
        purchaseOrderId: line.purchase_order_id,
        lineNumber: line.line_number,
        description: line.description,
        quantity: line.quantity,
        unitOfMeasure: line.unit_of_measure,
        productId: line.product_id,
        masterItemId: line.master_item_id,
        supplyChainStatus: line.supply_chain_status,
      })),
    };
  }
}

function mapChangeRequestRow(row: POChangeRequestRow): PurchaseOrderChangeRequestRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    customerId: row.customer_id,
    requestType: row.request_type,
    message: row.message,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    resolvedByUserId: row.resolved_by_user_id,
    resolutionNote: row.resolution_note,
  };
}
