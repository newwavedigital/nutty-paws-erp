import type {
  DepositStatus,
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
          SELECT id, po_number, customer_id, status, deposit_status, requested_ship_date, notes
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
          SELECT id, po_number, customer_id, status, deposit_status, requested_ship_date, notes
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
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(status, status, status, id)
      .run();
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
