import { ProductionError, type ProductionBomItem, type ProductionLogRecord, type ProductionPurchaseOrder, type ProductionRunLineRecord, type ProductionRunMaterialRecord, type ProductionRunRecord, type ProductionStore } from "./service";

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  customer_id: string;
  status: string;
};

type PurchaseOrderLineRow = {
  id: string;
  product_id: string | null;
  quantity: number;
  description: string;
};

type ProductionRunRow = {
  id: string;
  purchase_order_id: string;
  production_date: string;
  production_end_date: string;
  production_room: string;
  status: ProductionRunRecord["status"];
  finalized_at: string | null;
  reopened_at: string | null;
  correction_count: number;
  notes: string | null;
};

type ProductionRunLineRow = {
  id: string;
  production_run_id: string;
  purchase_order_line_id: string;
  product_id: string | null;
  ordered_quantity: number;
  quantity_produced: number;
  cases_produced: number;
  lot_number: string;
};

type ProductionRunMaterialRow = {
  id: string;
  production_run_id: string;
  purchase_order_line_id: string | null;
  product_id: string | null;
  master_item_id: string;
  inventory_item_id: string | null;
  material_type: "ingredient" | "packaging";
  theoretical_quantity: number;
  actual_used_quantity: number;
  waste_percent: number;
  lot_number: string | null;
};

type ProductionLogRow = {
  id: string;
  log_id: string;
  purchase_order_id: string;
  production_run_id: string;
  production_date: string;
  production_end_date: string;
  production_room: string;
  completed_at: string | null;
  overall_waste_percent: number;
  line_snapshot_json: string;
  material_snapshot_json: string;
  notes: string | null;
};

type BomRow = {
  product_id: string;
  master_item_id: string;
  quantity_per_unit: number;
  item_type: "raw_material" | "packaging" | "finished_good" | "other";
  inventory_item_id: string | null;
  is_own_brand: number;
};

export class D1ProductionStore implements ProductionStore {
  constructor(private readonly db: D1Database) {}

  async getPurchaseOrder(id: string): Promise<ProductionPurchaseOrder | null> {
    const row = await this.db
      .prepare("SELECT id, po_number, customer_id, status FROM purchase_orders WHERE id = ?")
      .bind(id)
      .first<PurchaseOrderRow>();
    if (!row) return null;
    const lines = await this.db
      .prepare(
        `
          SELECT id, product_id, quantity, description
          FROM purchase_order_lines
          WHERE purchase_order_id = ?
          ORDER BY line_number
        `,
      )
      .bind(id)
      .all<PurchaseOrderLineRow>();
    return {
      id: row.id,
      poNumber: row.po_number,
      customerId: row.customer_id,
      status: row.status,
      lines: (lines.results ?? []).map((line) => ({
        id: line.id,
        productId: line.product_id,
        quantity: line.quantity,
        description: line.description,
      })),
    };
  }

  async getProductionRunByPurchaseOrderId(purchaseOrderId: string): Promise<ProductionRunRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, production_date, production_end_date,
                 production_room, status, finalized_at, reopened_at,
                 correction_count, notes
          FROM production_runs
          WHERE purchase_order_id = ?
        `,
      )
      .bind(purchaseOrderId)
      .first<ProductionRunRow>();
    return row ? this.hydrateRun(row) : null;
  }

  async getProductionRun(id: string): Promise<ProductionRunRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, production_date, production_end_date,
                 production_room, status, finalized_at, reopened_at,
                 correction_count, notes
          FROM production_runs
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ProductionRunRow>();
    return row ? this.hydrateRun(row) : null;
  }

  async upsertProductionRun(input: {
    id: string;
    purchaseOrderId: string;
    productionDate: string;
    productionEndDate: string;
    productionRoom: string;
    status: "scheduled";
    correctionCount: number;
    notes?: string | null;
    actorUserId?: string;
  }): Promise<ProductionRunRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO production_runs (
            id, purchase_order_id, production_date, production_end_date,
            production_room, status, correction_count, notes, created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(purchase_order_id) DO UPDATE SET
            production_date = excluded.production_date,
            production_end_date = excluded.production_end_date,
            production_room = excluded.production_room,
            status = excluded.status,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        input.id,
        input.purchaseOrderId,
        input.productionDate,
        input.productionEndDate,
        input.productionRoom,
        input.status,
        input.correctionCount,
        input.notes ?? null,
        input.actorUserId ?? null,
      )
      .run();
    return (await this.getProductionRunByPurchaseOrderId(input.purchaseOrderId)) as ProductionRunRecord;
  }

  async updatePurchaseOrderStatus(id: string, status: string): Promise<void> {
    await this.db
      .prepare("UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(status, id)
      .run();
  }

  async listProductBomItems(productId: string): Promise<ProductionBomItem[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT pbi.product_id,
                 pbi.master_item_id,
                 pbi.quantity_per_unit,
                 mi.item_type,
                 MIN(inv.id) AS inventory_item_id,
                 p.is_own_brand
          FROM product_bom_items pbi
          JOIN master_items mi ON mi.id = pbi.master_item_id
          JOIN products p ON p.id = pbi.product_id
          LEFT JOIN inventory_items inv ON inv.master_item_id = pbi.master_item_id
          WHERE pbi.product_id = ?
          GROUP BY pbi.product_id, pbi.master_item_id, pbi.quantity_per_unit, mi.item_type, p.is_own_brand
          ORDER BY pbi.master_item_id
        `,
      )
      .bind(productId)
      .all<BomRow>();
    return (rows.results ?? []).map((row) => ({
      productId: row.product_id,
      masterItemId: row.master_item_id,
      quantityPerUnit: row.quantity_per_unit,
      itemType: row.item_type,
      inventoryItemId: row.inventory_item_id,
      productIsOwnBrand: row.is_own_brand === 1,
    }));
  }

  async findFinishedGoodInventoryItem(productId: string): Promise<{ id: string } | null> {
    const row = await this.db
      .prepare(
        `
          SELECT inv.id
          FROM products p
          JOIN master_items mi ON mi.sku = p.sku AND mi.item_type = 'finished_good'
          JOIN inventory_items inv ON inv.master_item_id = mi.id
          WHERE p.id = ?
        `,
      )
      .bind(productId)
      .first<{ id: string }>();
    return row ? { id: row.id } : null;
  }

  async replaceRunLines(runId: string, lines: ProductionRunLineRecord[]): Promise<void> {
    await this.db.prepare("DELETE FROM production_run_lines WHERE production_run_id = ?").bind(runId).run();
    for (const line of lines) {
      await this.db
        .prepare(
          `
            INSERT INTO production_run_lines (
              id, production_run_id, purchase_order_line_id, product_id,
              ordered_quantity, quantity_produced, cases_produced, lot_number
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          line.id,
          line.productionRunId,
          line.purchaseOrderLineId,
          line.productId,
          line.orderedQuantity,
          line.quantityProduced,
          line.casesProduced,
          line.lotNumber,
        )
        .run();
    }
  }

  async replaceRunMaterials(runId: string, materials: ProductionRunMaterialRecord[]): Promise<void> {
    await this.db.prepare("DELETE FROM production_run_materials WHERE production_run_id = ?").bind(runId).run();
    for (const material of materials) {
      await this.db
        .prepare(
          `
            INSERT INTO production_run_materials (
              id, production_run_id, purchase_order_line_id, product_id,
              master_item_id, inventory_item_id, material_type,
              theoretical_quantity, actual_used_quantity, waste_percent, lot_number
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          material.id,
          material.productionRunId,
          material.purchaseOrderLineId,
          material.productId,
          material.masterItemId,
          material.inventoryItemId ?? null,
          material.materialType,
          material.theoreticalQuantity,
          material.actualUsedQuantity,
          material.wastePercent,
          material.lotNumber,
        )
        .run();
    }
  }

  async listInventoryEffects(runId: string): Promise<Array<{ inventoryItemId: string; quantityDelta: number }>> {
    const rows = await this.db
      .prepare("SELECT inventory_item_id, quantity_delta FROM production_inventory_effects WHERE production_run_id = ?")
      .bind(runId)
      .all<{ inventory_item_id: string; quantity_delta: number }>();
    return (rows.results ?? []).map((row) => ({ inventoryItemId: row.inventory_item_id, quantityDelta: row.quantity_delta }));
  }

  async clearInventoryEffects(runId: string): Promise<void> {
    await this.db.prepare("DELETE FROM production_inventory_effects WHERE production_run_id = ?").bind(runId).run();
  }

  async adjustInventory(input: {
    inventoryItemId: string;
    quantityDelta: number;
    referenceType: "production_run";
    referenceId: string;
    actorUserId?: string;
  }): Promise<void> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET on_hand_quantity = on_hand_quantity + ?,
              allocated_quantity = CASE
                WHEN ? < 0 AND allocated_quantity >= ABS(?) THEN allocated_quantity - ABS(?)
                ELSE allocated_quantity
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND on_hand_quantity + ? >= 0
        `,
      )
      .bind(input.quantityDelta, input.quantityDelta, input.quantityDelta, input.quantityDelta, input.inventoryItemId, input.quantityDelta)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new ProductionError("INSUFFICIENT_INVENTORY", "Production inventory adjustment would make stock negative");
    }
    await this.db
      .prepare(
        `
          INSERT INTO inventory_movements (
            id, inventory_item_id, movement_type, quantity_delta,
            reference_type, reference_id, created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `movement_${crypto.randomUUID()}`,
        input.inventoryItemId,
        input.quantityDelta < 0 ? "consumed" : "received",
        input.quantityDelta,
        input.referenceType,
        input.referenceId,
        input.actorUserId ?? null,
      )
      .run();
  }

  async createInventoryEffect(input: {
    id: string;
    productionRunId: string;
    inventoryItemId: string;
    quantityDelta: number;
    effectType: "consume_material" | "produce_finished_good";
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO production_inventory_effects (
            id, production_run_id, inventory_item_id, quantity_delta, effect_type
          )
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(input.id, input.productionRunId, input.inventoryItemId, input.quantityDelta, input.effectType)
      .run();
  }

  async upsertInventoryLot(input: {
    productId: string;
    inventoryItemId: string;
    lotNumber: string;
    purchaseOrderId: string;
    productionRunId: string;
    productionDate: string;
    quantityProduced: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO inventory_lots (
            id, product_id, inventory_item_id, lot_number, purchase_order_id,
            production_run_id, production_date, quantity_produced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id, lot_number) DO UPDATE SET
            inventory_item_id = excluded.inventory_item_id,
            purchase_order_id = excluded.purchase_order_id,
            production_run_id = excluded.production_run_id,
            production_date = excluded.production_date,
            quantity_produced = excluded.quantity_produced,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        `inventory_lot_${crypto.randomUUID()}`,
        input.productId,
        input.inventoryItemId,
        input.lotNumber,
        input.purchaseOrderId,
        input.productionRunId,
        input.productionDate,
        input.quantityProduced,
      )
      .run();
  }

  async finalizeRun(input: { id: string; status: "finalized"; notes?: string | null; actorUserId?: string }): Promise<ProductionRunRecord> {
    await this.db
      .prepare(
        `
          UPDATE production_runs
          SET status = ?,
              finalized_at = CURRENT_TIMESTAMP,
              finalized_by_user_id = ?,
              reopened_at = NULL,
              notes = COALESCE(?, notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.status, input.actorUserId ?? null, input.notes ?? null, input.id)
      .run();
    return (await this.getProductionRun(input.id)) as ProductionRunRecord;
  }

  async reopenRun(input: { id: string; reason: string; actorUserId?: string }): Promise<ProductionRunRecord> {
    await this.db
      .prepare(
        `
          UPDATE production_runs
          SET status = 'reopened',
              reopened_at = CURRENT_TIMESTAMP,
              reopened_by_user_id = ?,
              correction_count = correction_count + 1,
              notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.actorUserId ?? null, input.reason, input.id)
      .run();
    return (await this.getProductionRun(input.id)) as ProductionRunRecord;
  }

  async listProductionRuns(): Promise<ProductionRunRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, purchase_order_id, production_date, production_end_date,
                 production_room, status, finalized_at, reopened_at,
                 correction_count, notes
          FROM production_runs
          ORDER BY production_date DESC, id
        `,
      )
      .all<ProductionRunRow>();
    return Promise.all((rows.results ?? []).map((row) => this.hydrateRun(row)));
  }

  async upsertProductionLog(input: Omit<ProductionLogRecord, "id">): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO production_logs (
            id, log_id, purchase_order_id, production_run_id, production_date,
            production_end_date, production_room, completed_at, overall_waste_percent,
            line_snapshot_json, material_snapshot_json, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(purchase_order_id) DO UPDATE SET
            production_run_id = excluded.production_run_id,
            production_date = excluded.production_date,
            production_end_date = excluded.production_end_date,
            production_room = excluded.production_room,
            completed_at = excluded.completed_at,
            overall_waste_percent = excluded.overall_waste_percent,
            line_snapshot_json = excluded.line_snapshot_json,
            material_snapshot_json = excluded.material_snapshot_json,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        `production_log_${crypto.randomUUID()}`,
        input.logId,
        input.purchaseOrderId,
        input.productionRunId,
        input.productionDate,
        input.productionEndDate,
        input.productionRoom,
        input.completedAt,
        input.overallWastePercent,
        JSON.stringify(input.lineSnapshot),
        JSON.stringify(input.materialSnapshot),
        input.notes,
      )
      .run();
  }

  async listProductionLogs(): Promise<ProductionLogRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, log_id, purchase_order_id, production_run_id,
                 production_date, production_end_date, production_room,
                 completed_at, overall_waste_percent, line_snapshot_json,
                 material_snapshot_json, notes
          FROM production_logs
          ORDER BY completed_at DESC, log_id DESC
        `,
      )
      .all<ProductionLogRow>();
    return (rows.results ?? []).map(mapLogRow);
  }

  async createStatusEvent(input: { purchaseOrderId: string; fromStatus: string | null; toStatus: string; eventType: string; actorUserId?: string; note?: string }): Promise<void> {
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

  async createAuditEvent(input: { actorUserId?: string; entityType: string; entityId: string; action: string; metadata: Record<string, unknown> }): Promise<void> {
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

  private async hydrateRun(row: ProductionRunRow): Promise<ProductionRunRecord> {
    const lines = await this.db
      .prepare(
        `
          SELECT id, production_run_id, purchase_order_line_id, product_id,
                 ordered_quantity, quantity_produced, cases_produced, lot_number
          FROM production_run_lines
          WHERE production_run_id = ?
          ORDER BY created_at, id
        `,
      )
      .bind(row.id)
      .all<ProductionRunLineRow>();
    const materials = await this.db
      .prepare(
        `
          SELECT id, production_run_id, purchase_order_line_id, product_id,
                 master_item_id, inventory_item_id, material_type,
                 theoretical_quantity, actual_used_quantity, waste_percent,
                 lot_number
          FROM production_run_materials
          WHERE production_run_id = ?
          ORDER BY material_type, master_item_id
        `,
      )
      .bind(row.id)
      .all<ProductionRunMaterialRow>();
    return {
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      productionDate: row.production_date,
      productionEndDate: row.production_end_date,
      productionRoom: row.production_room,
      status: row.status,
      finalizedAt: row.finalized_at,
      reopenedAt: row.reopened_at,
      correctionCount: row.correction_count,
      notes: row.notes,
      lines: (lines.results ?? []).map(mapLineRow),
      materials: (materials.results ?? []).map(mapMaterialRow),
    };
  }
}

function mapLineRow(row: ProductionRunLineRow): ProductionRunLineRecord {
  return {
    id: row.id,
    productionRunId: row.production_run_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    productId: row.product_id,
    orderedQuantity: row.ordered_quantity,
    quantityProduced: row.quantity_produced,
    casesProduced: row.cases_produced,
    lotNumber: row.lot_number,
  };
}

function mapMaterialRow(row: ProductionRunMaterialRow): ProductionRunMaterialRecord {
  return {
    id: row.id,
    productionRunId: row.production_run_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    productId: row.product_id,
    masterItemId: row.master_item_id,
    inventoryItemId: row.inventory_item_id,
    materialType: row.material_type,
    theoreticalQuantity: row.theoretical_quantity,
    actualUsedQuantity: row.actual_used_quantity,
    wastePercent: row.waste_percent,
    lotNumber: row.lot_number,
  };
}

function mapLogRow(row: ProductionLogRow): ProductionLogRecord {
  return {
    id: row.id,
    logId: row.log_id,
    purchaseOrderId: row.purchase_order_id,
    productionRunId: row.production_run_id,
    productionDate: row.production_date,
    productionEndDate: row.production_end_date,
    productionRoom: row.production_room,
    completedAt: row.completed_at,
    overallWastePercent: row.overall_waste_percent,
    lineSnapshot: parseJson(row.line_snapshot_json),
    materialSnapshot: parseJson(row.material_snapshot_json),
    notes: row.notes,
  };
}

function parseJson<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
