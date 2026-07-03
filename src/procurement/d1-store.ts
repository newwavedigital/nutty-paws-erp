import { ProcurementError, calculateNeedToOrderRows, type NeedToOrderInventoryItem, type ProcurementInventorySnapshot, type ProcurementOrderInput, type ProcurementOrderLineInput, type ProcurementOrderLineRecord, type ProcurementOrderRecord, type ProcurementOrderStatus, type ProcurementReceiptTransactionInput, type ProcurementStore, type SupplyChainDemand } from "./service";

type ProcurementOrderRow = {
  id: string;
  procurement_order_number: string;
  quickbooks_po_number: string | null;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  status: ProcurementOrderStatus;
  date_ordered: string | null;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
};

type ProcurementLineRow = {
  id: string;
  procurement_order_id: string;
  line_number: number;
  master_item_id: string;
  inventory_item_id: string | null;
  description: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_of_measure: string;
  unit_cost_cents: number | null;
  suggested_quantity: number;
  source_reason: ProcurementOrderLineRecord["sourceReason"];
  source_purchase_order_line_id: string | null;
};

type InventoryItemSnapshotDbRow = {
  id: string;
  on_hand_quantity: number;
  lot_number: string | null;
  location: string | null;
};

type InventoryNeedRow = {
  id: string;
  master_item_id: string;
  master_item_name: string;
  supplier_id: string | null;
  on_hand_quantity: number;
  allocated_quantity: number;
  reorder_point_quantity: number;
  unit_of_measure: string;
  unit_cost_cents: number | null;
  lead_time_days: number | null;
};

type DemandRow = {
  inventory_item_id: string;
  purchase_order_line_id: string;
  required_quantity: number;
};

type CoverageRow = {
  inventory_item_id: string;
  remaining_quantity: number;
};

export class D1ProcurementStore implements ProcurementStore {
  constructor(private readonly db: D1Database) {}

  async listNeedToOrderRows() {
    const inventoryRows = await this.db
      .prepare(
        `
          SELECT inv.id,
                 inv.master_item_id,
                 mi.name AS master_item_name,
                 inv.supplier_id,
                 inv.on_hand_quantity,
                 inv.allocated_quantity,
                 inv.reorder_point_quantity,
                 inv.unit_of_measure,
                 inv.unit_cost_cents,
                 inv.lead_time_days
          FROM inventory_items inv
          JOIN master_items mi ON mi.id = inv.master_item_id
          ORDER BY mi.name
        `,
      )
      .all<InventoryNeedRow>();

    const demandRows = await this.db
      .prepare(
        `
          SELECT inv.id AS inventory_item_id,
                 pol.id AS purchase_order_line_id,
                 SUM(req.required_quantity) AS required_quantity
          FROM (
            SELECT pol.id AS purchase_order_line_id,
                   pbi.master_item_id,
                   pbi.quantity_per_unit * pol.quantity * 1.05 AS required_quantity
            FROM purchase_order_lines pol
            JOIN purchase_orders po ON po.id = pol.purchase_order_id
            JOIN product_bom_items pbi ON pbi.product_id = pol.product_id
            WHERE po.status = 'supply_chain_review'
              AND pol.product_id IS NOT NULL

            UNION ALL

            SELECT pol.id AS purchase_order_line_id,
                   pol.master_item_id,
                   pol.quantity AS required_quantity
            FROM purchase_order_lines pol
            JOIN purchase_orders po ON po.id = pol.purchase_order_id
            WHERE po.status = 'supply_chain_review'
              AND pol.master_item_id IS NOT NULL
          ) req
          JOIN purchase_order_lines pol ON pol.id = req.purchase_order_line_id
          JOIN inventory_items inv ON inv.master_item_id = req.master_item_id
          GROUP BY inv.id, pol.id
        `,
      )
      .all<DemandRow>();

    const coverageRows = await this.db
      .prepare(
        `
          SELECT pol.inventory_item_id,
                 SUM(pol.quantity_ordered - pol.quantity_received) AS remaining_quantity
          FROM procurement_order_lines pol
          JOIN procurement_orders po ON po.id = pol.procurement_order_id
          WHERE po.status IN ('draft', 'ordered', 'partially_received')
            AND pol.inventory_item_id IS NOT NULL
            AND pol.quantity_ordered > pol.quantity_received
          GROUP BY pol.inventory_item_id
        `,
      )
      .all<CoverageRow>();

    return calculateNeedToOrderRows({
      inventoryItems: (inventoryRows.results ?? []).map(mapInventoryNeedRow),
      supplyChainDemands: (demandRows.results ?? []).map(mapDemandRow),
      activeProcurementCoverage: new Map(
        (coverageRows.results ?? []).map((row) => [row.inventory_item_id, row.remaining_quantity]),
      ),
    });
  }

  async nextOrderSequence() {
    return this.nextSequence("procurement_orders", "procurement_order_number", 1000);
  }

  async nextReceiptSequence() {
    return this.nextSequence("procurement_receipts", "receipt_number", 2000);
  }

  async createOrder(input: ProcurementOrderInput) {
    await this.db
      .prepare(
        `
          INSERT INTO procurement_orders (
            id, procurement_order_number, quickbooks_po_number, supplier_id,
            supplier_name_snapshot, status, date_ordered, expected_date,
            received_date, notes, created_by_user_id, submitted_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.procurementOrderNumber,
        input.quickBooksPoNumber,
        input.supplierId,
        input.supplierNameSnapshot,
        input.status,
        input.dateOrdered,
        input.expectedDate,
        input.receivedDate,
        input.notes,
        input.createdByUserId ?? null,
        input.submittedByUserId ?? null,
      )
      .run();
  }

  async createOrderLine(input: ProcurementOrderLineInput) {
    await this.db
      .prepare(
        `
          INSERT INTO procurement_order_lines (
            id, procurement_order_id, line_number, master_item_id,
            inventory_item_id, description, quantity_ordered,
            quantity_received, unit_of_measure, unit_cost_cents,
            suggested_quantity, source_reason, source_purchase_order_line_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.procurementOrderId,
        input.lineNumber,
        input.masterItemId,
        input.inventoryItemId,
        input.description,
        input.quantityOrdered,
        input.quantityReceived,
        input.unitOfMeasure,
        input.unitCostCents,
        input.suggestedQuantity,
        input.sourceReason,
        input.sourcePurchaseOrderLineId,
      )
      .run();
  }

  async listOrders() {
    const rows = await this.db
      .prepare(
        `
          SELECT id, procurement_order_number, quickbooks_po_number,
                 supplier_id, supplier_name_snapshot, status, date_ordered,
                 expected_date, received_date, notes
          FROM procurement_orders
          ORDER BY created_at DESC
        `,
      )
      .all<ProcurementOrderRow>();
    return Promise.all((rows.results ?? []).map((row) => this.hydrateOrder(row)));
  }

  async getOrder(id: string) {
    const row = await this.db
      .prepare(
        `
          SELECT id, procurement_order_number, quickbooks_po_number,
                 supplier_id, supplier_name_snapshot, status, date_ordered,
                 expected_date, received_date, notes
          FROM procurement_orders
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ProcurementOrderRow>();
    return row ? this.hydrateOrder(row) : null;
  }

  async updateOrder(input: {
    id: string;
    status: ProcurementOrderStatus;
    quickBooksPoNumber?: string | null;
    dateOrdered?: string | null;
    expectedDate?: string | null;
    receivedDate?: string | null;
    notes?: string | null;
    submittedByUserId?: string;
  }) {
    await this.db
      .prepare(
        `
          UPDATE procurement_orders
          SET status = ?,
              quickbooks_po_number = COALESCE(?, quickbooks_po_number),
              date_ordered = COALESCE(?, date_ordered),
              expected_date = COALESCE(?, expected_date),
              received_date = COALESCE(?, received_date),
              notes = COALESCE(?, notes),
              submitted_by_user_id = COALESCE(?, submitted_by_user_id),
              ordered_at = CASE WHEN ? = 'ordered' AND ordered_at IS NULL THEN CURRENT_TIMESTAMP ELSE ordered_at END,
              completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.status,
        input.quickBooksPoNumber ?? null,
        input.dateOrdered ?? null,
        input.expectedDate ?? null,
        input.receivedDate ?? null,
        input.notes ?? null,
        input.submittedByUserId ?? null,
        input.status,
        input.status,
        input.id,
      )
      .run();
  }

  async updateLineReceivedQuantity(input: { lineId: string; quantityReceived: number }) {
    await this.db
      .prepare(
        `
          UPDATE procurement_order_lines
          SET quantity_received = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.quantityReceived, input.lineId)
      .run();
  }

  async createReceipt(input: {
    id: string;
    receiptNumber: string;
    procurementOrderId: string;
    receiptDate: string;
    receivedByUserId?: string;
    isFinal: boolean;
  }) {
    await this.db
      .prepare(
        `
          INSERT INTO procurement_receipts (
            id, receipt_number, procurement_order_id, receipt_date,
            received_by_user_id, is_final
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.receiptNumber,
        input.procurementOrderId,
        input.receiptDate,
        input.receivedByUserId ?? null,
        input.isFinal ? 1 : 0,
      )
      .run();
  }

  async createReceiptLine(input: {
    id: string;
    procurementReceiptId: string;
    procurementOrderLineId: string;
    inventoryItemId: string | null;
    receivedQuantity: number;
    lotNumber?: string | null;
    location?: string | null;
  }) {
    await this.db
      .prepare(
        `
          INSERT INTO procurement_receipt_lines (
            id, procurement_receipt_id, procurement_order_line_id,
            inventory_item_id, received_quantity, lot_number, location
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.procurementReceiptId,
        input.procurementOrderLineId,
        input.inventoryItemId,
        input.receivedQuantity,
        input.lotNumber ?? null,
        input.location ?? null,
      )
      .run();
  }

  async getInventoryItem(inventoryItemId: string): Promise<ProcurementInventorySnapshot | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, on_hand_quantity, lot_number, location
          FROM inventory_items
          WHERE id = ?
        `,
      )
      .bind(inventoryItemId)
      .first<InventoryItemSnapshotDbRow>();
    return row
      ? {
          id: row.id,
          onHandQuantity: row.on_hand_quantity,
          lotNumber: row.lot_number,
          location: row.location,
        }
      : null;
  }

  async increaseInventory(input: {
    inventoryItemId: string;
    quantity: number;
    referenceId: string;
    actorUserId?: string;
    lotNumber?: string | null;
    location?: string | null;
  }) {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET on_hand_quantity = on_hand_quantity + ?,
              lot_number = COALESCE(?, lot_number),
              location = COALESCE(?, location),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
      `,
      )
      .bind(input.quantity, input.lotNumber ?? null, input.location ?? null, input.inventoryItemId)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      throw new ProcurementError("PROCUREMENT_INVENTORY_ITEM_NOT_FOUND", "Procurement inventory item not found");
    }

    await this.db
      .prepare(
        `
          INSERT INTO inventory_movements (
            id, inventory_item_id, movement_type, quantity_delta,
            reference_type, reference_id, created_by_user_id
          )
          VALUES (?, ?, 'received', ?, 'procurement_receipt_line', ?, ?)
        `,
      )
      .bind(
        `movement_${crypto.randomUUID()}`,
        input.inventoryItemId,
        input.quantity,
        input.referenceId,
        input.actorUserId ?? null,
      )
      .run();
  }

  async restoreInventoryItem(input: ProcurementInventorySnapshot) {
    await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET on_hand_quantity = ?,
              lot_number = ?,
              location = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.onHandQuantity, input.lotNumber, input.location, input.id)
      .run();
  }

  async deleteReceiptLine(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM procurement_receipt_lines WHERE id = ?")
      .bind(id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async deleteReceipt(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM procurement_receipts WHERE id = ?")
      .bind(id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async receiveOrderTransaction(input: ProcurementReceiptTransactionInput) {
    const statements = [
      this.db
        .prepare(
          `
            INSERT INTO procurement_receipts (
              id, receipt_number, procurement_order_id, receipt_date,
              received_by_user_id, is_final
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          input.receipt.id,
          input.receipt.receiptNumber,
          input.receipt.procurementOrderId,
          input.receipt.receiptDate,
          input.receipt.receivedByUserId ?? null,
          input.receipt.isFinal ? 1 : 0,
        ),
    ];

    for (const line of input.lines) {
      statements.push(
        this.db
          .prepare(
            `
              INSERT INTO procurement_receipt_lines (
                id, procurement_receipt_id, procurement_order_line_id,
                inventory_item_id, received_quantity, lot_number, location
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            line.receiptLineId,
            input.receipt.id,
            line.procurementOrderLineId,
            line.inventoryItemId,
            line.receivedQuantity,
            line.lotNumber ?? null,
            line.location ?? null,
          ),
      );

      if (line.inventoryItemId) {
        statements.push(
          this.db
            .prepare(
              `
                UPDATE inventory_items
                SET on_hand_quantity = on_hand_quantity + ?,
                    lot_number = COALESCE(?, lot_number),
                    location = COALESCE(?, location),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `,
            )
            .bind(line.receivedQuantity, line.lotNumber ?? null, line.location ?? null, line.inventoryItemId),
          this.db
            .prepare(
              `
                INSERT INTO inventory_movements (
                  id, inventory_item_id, movement_type, quantity_delta,
                  reference_type, reference_id, created_by_user_id
                )
                VALUES (?, ?, 'received', ?, 'procurement_receipt_line', ?, ?)
              `,
            )
            .bind(
              `movement_${crypto.randomUUID()}`,
              line.inventoryItemId,
              line.receivedQuantity,
              line.receiptLineId,
              input.receipt.receivedByUserId ?? null,
            ),
        );
      }

      statements.push(
        this.db
          .prepare(
            `
              UPDATE procurement_order_lines
              SET quantity_received = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
          )
          .bind(line.finalReceivedQuantity, line.procurementOrderLineId),
      );
    }

    statements.push(
      this.db
        .prepare(
          `
            UPDATE procurement_orders
            SET status = ?,
                received_date = COALESCE(?, received_date),
                completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
        )
        .bind(
          input.orderUpdate.status,
          input.orderUpdate.receivedDate ?? null,
          input.orderUpdate.status,
          input.orderUpdate.id,
        ),
      this.db
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
          input.audit.actorUserId ?? null,
          input.audit.entityType,
          input.audit.entityId,
          input.audit.action,
          JSON.stringify(input.audit.metadata),
        ),
    );

    await this.db.batch(statements);
  }

  async createAuditEvent(input: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }) {
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

  private async hydrateOrder(row: ProcurementOrderRow): Promise<ProcurementOrderRecord> {
    const lineRows = await this.db
      .prepare(
        `
          SELECT id, procurement_order_id, line_number, master_item_id,
                 inventory_item_id, description, quantity_ordered,
                 quantity_received, unit_of_measure, unit_cost_cents,
                 suggested_quantity, source_reason, source_purchase_order_line_id
          FROM procurement_order_lines
          WHERE procurement_order_id = ?
          ORDER BY line_number ASC
        `,
      )
      .bind(row.id)
      .all<ProcurementLineRow>();

    return {
      id: row.id,
      procurementOrderNumber: row.procurement_order_number,
      quickBooksPoNumber: row.quickbooks_po_number,
      supplierId: row.supplier_id,
      supplierNameSnapshot: row.supplier_name_snapshot,
      status: row.status,
      dateOrdered: row.date_ordered,
      expectedDate: row.expected_date,
      receivedDate: row.received_date,
      notes: row.notes,
      lines: (lineRows.results ?? []).map(mapLineRow),
    };
  }

  private async nextSequence(table: string, column: string, base: number) {
    const row = await this.db
      .prepare(
        `
          SELECT MAX(CAST(SUBSTR(${column}, INSTR(${column}, '-') + 1) AS INTEGER)) AS max_id
          FROM ${table}
        `,
      )
      .first<{ max_id: number | null }>();
    return (row?.max_id ?? base) + 1;
  }
}

function mapInventoryNeedRow(row: InventoryNeedRow): NeedToOrderInventoryItem {
  return {
    id: row.id,
    masterItemId: row.master_item_id,
    name: row.master_item_name,
    supplierId: row.supplier_id,
    onHandQuantity: row.on_hand_quantity,
    allocatedQuantity: row.allocated_quantity,
    reorderPointQuantity: row.reorder_point_quantity,
    unitOfMeasure: row.unit_of_measure,
    unitCostCents: row.unit_cost_cents,
    leadTimeDays: row.lead_time_days,
  };
}

function mapDemandRow(row: DemandRow): SupplyChainDemand {
  return {
    inventoryItemId: row.inventory_item_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    requiredQuantity: row.required_quantity,
  };
}

function mapLineRow(row: ProcurementLineRow): ProcurementOrderLineRecord {
  return {
    id: row.id,
    procurementOrderId: row.procurement_order_id,
    lineNumber: row.line_number,
    masterItemId: row.master_item_id,
    inventoryItemId: row.inventory_item_id,
    description: row.description,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    unitOfMeasure: row.unit_of_measure,
    unitCostCents: row.unit_cost_cents,
    suggestedQuantity: row.suggested_quantity,
    sourceReason: row.source_reason,
    sourcePurchaseOrderLineId: row.source_purchase_order_line_id,
  };
}
