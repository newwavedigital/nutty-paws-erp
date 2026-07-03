import type {
  InventoryAuditInput,
  InventoryAdjustmentInput,
  InventoryAdjustmentRecord,
  InventoryItemInput,
  InventoryItemRecord,
  InventoryItemSetupRecord,
  InventoryMovementInput,
  InventoryReservationRecord,
  InventoryStore,
  MoveEntryInput,
  MoveEntryRecord,
  ReceivingEntryInput,
  ReceivingEntryRecord,
} from "./service";

type InventoryItemRow = {
  id: string;
  master_item_id?: string;
  master_item_name?: string | null;
  item_type?: "raw_material" | "packaging" | "finished_good" | "other";
  category?: "Ingredient" | "Packaging" | "Finished Good";
  supplier_id?: string | null;
  customer_id?: string | null;
  on_hand_quantity: number;
  allocated_quantity: number;
  reorder_point_quantity?: number;
  unit_of_measure: string;
  unit_cost_cents?: number | null;
  lead_time_days?: number | null;
  location?: string | null;
  lot_number?: string | null;
  lots_json?: string | null;
  status?: "active" | "archived";
  archived_at?: string | null;
  archived_by_user_id?: string | null;
};

type ReservationRow = {
  id: string;
  inventory_item_id: string;
  purchase_order_line_id: string;
  quantity: number;
  status: "active";
};

type ReceivingRow = {
  id: string;
  receiving_id: string;
  master_item_id: string;
  inventory_item_id: string | null;
  item_name: string;
  date: string;
  time: string;
  packages: number;
  quantity_per_package: number;
  total_quantity: number;
  unit_of_measure: string;
  lot_number: string | null;
  allergens_json: string | null;
  received_by: string | null;
  carrier: string | null;
  supplier_id: string | null;
  status?: "active" | "archived";
  archived_at?: string | null;
  archived_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  stock_applied_quantity?: number;
  stock_applied_inventory_item_id?: string | null;
};

type MoveRow = {
  id: string;
  move_id: string;
  receiving_id: string;
  master_item_id: string;
  inventory_item_id: string | null;
  item_name: string;
  lot_number: string | null;
  date: string;
  time: string;
  case_count: number;
  quantity_per_case: number;
  quantity_moved: number;
  unit_of_measure: string;
  moved_by: string | null;
  from_location: string | null;
  to_location: string | null;
  status?: "active" | "archived";
  archived_at?: string | null;
  archived_by_user_id?: string | null;
  updated_by_user_id?: string | null;
};

type InventoryAdjustmentRow = {
  id: string;
  inventory_item_id: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  reason: string;
  note: string | null;
  lots_before_json: string | null;
  lots_after_json: string | null;
  adjusted_by_user_id: string | null;
  created_at: string;
};

export class D1InventoryStore implements InventoryStore {
  constructor(private readonly db: D1Database) {}

  async getInventoryItem(id: string): Promise<InventoryItemRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, on_hand_quantity, allocated_quantity, unit_of_measure
          FROM inventory_items
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<InventoryItemRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      onHandQuantity: row.on_hand_quantity,
      allocatedQuantity: row.allocated_quantity,
      unitOfMeasure: row.unit_of_measure,
    };
  }

  async allocateInventoryItem(id: string, quantity: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET allocated_quantity = allocated_quantity + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND allocated_quantity + ? <= on_hand_quantity
        `,
      )
      .bind(quantity, id, quantity)
      .run();

    return (result.meta.changes ?? 0) > 0;
  }

  async createReservation(input: {
    id: string;
    inventoryItemId: string;
    purchaseOrderLineId: string;
    quantity: number;
    actorUserId?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO inventory_reservations (
            id,
            inventory_item_id,
            purchase_order_line_id,
            quantity,
            status,
            reserved_by_user_id
          )
          VALUES (?, ?, ?, ?, 'active', ?)
        `,
      )
      .bind(
        input.id,
        input.inventoryItemId,
        input.purchaseOrderLineId,
        input.quantity,
        input.actorUserId ?? null,
      )
      .run();
  }

  async createMovement(input: InventoryMovementInput): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO inventory_movements (
            id,
            inventory_item_id,
            movement_type,
            quantity_delta,
            reference_type,
            reference_id,
            created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `movement_${crypto.randomUUID()}`,
        input.inventoryItemId,
        input.movementType,
        input.quantityDelta,
        input.referenceType,
        input.referenceId,
        input.actorUserId ?? null,
      )
      .run();
  }

  async createAuditEvent(input: InventoryAuditInput): Promise<void> {
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

  async getActiveReservation(id: string): Promise<InventoryReservationRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, inventory_item_id, purchase_order_line_id, quantity, status
          FROM inventory_reservations
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(id)
      .first<ReservationRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      inventoryItemId: row.inventory_item_id,
      purchaseOrderLineId: row.purchase_order_line_id,
      quantity: row.quantity,
      status: row.status,
    };
  }

  async releaseReservationRecord(id: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_reservations
          SET status = 'released',
              released_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async releaseInventoryItemAllocation(id: string, quantity: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET allocated_quantity = allocated_quantity - ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND allocated_quantity >= ?
        `,
      )
      .bind(quantity, id, quantity)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async listInventoryItems(): Promise<InventoryItemSetupRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT inv.id,
                 inv.master_item_id,
                 mi.name AS master_item_name,
                 mi.item_type,
                 inv.category,
                 inv.supplier_id,
                 inv.customer_id,
                 inv.on_hand_quantity,
                 inv.allocated_quantity,
                 inv.reorder_point_quantity,
                 inv.unit_of_measure,
                 inv.unit_cost_cents,
                 inv.lead_time_days,
                 inv.location,
                 inv.lot_number,
                 inv.lots_json,
                 inv.status,
                 inv.archived_at,
                 inv.archived_by_user_id
          FROM inventory_items inv
          JOIN master_items mi ON mi.id = inv.master_item_id
          WHERE inv.status = 'active'
          ORDER BY mi.name
        `,
      )
      .all<InventoryItemRow>();

    return (rows.results ?? []).map(mapInventorySetupRow);
  }

  async createInventoryItem(input: InventoryItemInput): Promise<InventoryItemSetupRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO inventory_items (
            id, master_item_id, category, supplier_id, customer_id,
            on_hand_quantity, allocated_quantity, reorder_point_quantity,
            unit_of_measure, unit_cost_cents, lead_time_days, location,
            lot_number, lots_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.masterItemId,
        input.category,
        input.supplierId,
        input.customerId,
        input.onHandQuantity,
        input.allocatedQuantity ?? 0,
        input.reorderPointQuantity,
        input.unitOfMeasure,
        input.unitCostCents,
        input.leadTimeDays,
        input.location,
        input.lotNumber,
        input.lotsJson,
      )
      .run();
    return (await this.listInventoryItems()).find((item) => item.id === input.id) as InventoryItemSetupRecord;
  }

  async updateInventoryItem(id: string, input: InventoryItemInput): Promise<InventoryItemSetupRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET master_item_id = ?,
              category = ?,
              supplier_id = ?,
              customer_id = ?,
              on_hand_quantity = ?,
              allocated_quantity = ?,
              reorder_point_quantity = ?,
              unit_of_measure = ?,
              unit_cost_cents = ?,
              lead_time_days = ?,
              location = ?,
              lot_number = ?,
              lots_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(
        input.masterItemId,
        input.category,
        input.supplierId,
        input.customerId,
        input.onHandQuantity,
        input.allocatedQuantity ?? 0,
        input.reorderPointQuantity,
        input.unitOfMeasure,
        input.unitCostCents,
        input.leadTimeDays,
        input.location,
        input.lotNumber,
        input.lotsJson,
        id,
      )
      .run();
    return (await this.listInventoryItems()).find((item) => item.id === id) ?? null;
  }

  async archiveInventoryItem(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<InventoryItemSetupRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET status = 'archived',
              archived_at = ?,
              archived_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(input.archivedAt, input.actorUserId ?? null, id)
      .run();
    const row = await this.db
      .prepare(
        `
          SELECT inv.id,
                 inv.master_item_id,
                 mi.name AS master_item_name,
                 mi.item_type,
                 inv.category,
                 inv.supplier_id,
                 inv.customer_id,
                 inv.on_hand_quantity,
                 inv.allocated_quantity,
                 inv.reorder_point_quantity,
                 inv.unit_of_measure,
                 inv.unit_cost_cents,
                 inv.lead_time_days,
                 inv.location,
                 inv.lot_number,
                 inv.lots_json,
                 inv.status,
                 inv.archived_at,
                 inv.archived_by_user_id
          FROM inventory_items inv
          JOIN master_items mi ON mi.id = inv.master_item_id
          WHERE inv.id = ?
        `,
      )
      .bind(id)
      .first<InventoryItemRow>();
    return row ? mapInventorySetupRow(row) : null;
  }

  async countActiveReservationsForInventoryItem(id: string): Promise<number> {
    const row = await this.db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM inventory_reservations
          WHERE inventory_item_id = ?
            AND status = 'active'
        `,
      )
      .bind(id)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async createInventoryAdjustment(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO inventory_adjustments (
            id,
            inventory_item_id,
            quantity_before,
            quantity_after,
            quantity_delta,
            reason,
            note,
            lots_before_json,
            lots_after_json,
            adjusted_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.inventoryItemId,
        input.quantityBefore,
        input.quantityAfter,
        input.quantityDelta,
        input.reason,
        input.note,
        input.lotsBeforeJson,
        input.lotsAfterJson,
        input.adjustedByUserId ?? null,
      )
      .run();
    const row = await this.db.prepare("SELECT * FROM inventory_adjustments WHERE id = ?").bind(input.id).first<InventoryAdjustmentRow>();
    return mapInventoryAdjustmentRow(row as InventoryAdjustmentRow);
  }

  async adjustInventoryOnHand(input: { inventoryItemId: string; quantityDelta: number }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          UPDATE inventory_items
          SET on_hand_quantity = on_hand_quantity + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND on_hand_quantity + ? >= allocated_quantity
            AND on_hand_quantity + ? >= 0
        `,
      )
      .bind(input.quantityDelta, input.inventoryItemId, input.quantityDelta, input.quantityDelta)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async masterItemExists(masterItemId: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT id FROM master_items WHERE id = ?").bind(masterItemId).first<{ id: string }>();
    return Boolean(row);
  }

  async listReceivingEntries(): Promise<ReceivingEntryRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, receiving_id, master_item_id, inventory_item_id, item_name,
                 date, time, packages, quantity_per_package, total_quantity,
                 unit_of_measure, lot_number, allergens_json, received_by,
                 carrier, supplier_id, status, archived_at,
                 archived_by_user_id, updated_by_user_id,
                 stock_applied_quantity, stock_applied_inventory_item_id
          FROM receiving_entries
          WHERE status = 'active'
          ORDER BY date DESC, time DESC, receiving_id DESC
        `,
      )
      .all<ReceivingRow>();
    return (rows.results ?? []).map(mapReceivingRow);
  }

  async nextReceivingSequence(): Promise<number> {
    return this.nextSequence("receiving_entries", "receiving_id", 1000);
  }

  async createReceivingEntry(input: ReceivingEntryInput): Promise<ReceivingEntryRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO receiving_entries (
            id, receiving_id, master_item_id, inventory_item_id, item_name,
            date, time, packages, quantity_per_package, total_quantity,
            unit_of_measure, lot_number, allergens_json, received_by, carrier,
            supplier_id, status, updated_by_user_id, stock_applied_quantity,
            stock_applied_inventory_item_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.receivingId,
        input.masterItemId,
        input.inventoryItemId,
        input.itemName,
        input.date,
        input.time,
        input.packages,
        input.quantityPerPackage,
        input.totalQuantity,
        input.unitOfMeasure,
        input.lotNumber,
        JSON.stringify(input.allergens),
        input.receivedBy,
        input.carrier,
        input.supplierId,
        input.status ?? "active",
        input.updatedByUserId ?? null,
        input.stockAppliedQuantity ?? 0,
        input.stockAppliedInventoryItemId ?? null,
      )
      .run();
    return (await this.getReceivingEntryByBusinessId(input.receivingId)) as ReceivingEntryRecord;
  }

  async getReceivingEntry(id: string): Promise<ReceivingEntryRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, receiving_id, master_item_id, inventory_item_id, item_name,
                 date, time, packages, quantity_per_package, total_quantity,
                 unit_of_measure, lot_number, allergens_json, received_by,
                 carrier, supplier_id, status, archived_at,
                 archived_by_user_id, updated_by_user_id,
                 stock_applied_quantity, stock_applied_inventory_item_id
          FROM receiving_entries
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ReceivingRow>();
    return row ? mapReceivingRow(row) : null;
  }

  async getReceivingEntryByBusinessId(receivingId: string): Promise<ReceivingEntryRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, receiving_id, master_item_id, inventory_item_id, item_name,
                 date, time, packages, quantity_per_package, total_quantity,
                 unit_of_measure, lot_number, allergens_json, received_by,
                 carrier, supplier_id, status, archived_at,
                 archived_by_user_id, updated_by_user_id,
                 stock_applied_quantity, stock_applied_inventory_item_id
          FROM receiving_entries
          WHERE receiving_id = ?
            AND status = 'active'
        `,
      )
      .bind(receivingId)
      .first<ReceivingRow>();
    return row ? mapReceivingRow(row) : null;
  }

  async updateReceivingEntry(id: string, input: ReceivingEntryInput): Promise<ReceivingEntryRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE receiving_entries
          SET master_item_id = ?,
              inventory_item_id = ?,
              item_name = ?,
              date = ?,
              time = ?,
              packages = ?,
              quantity_per_package = ?,
              total_quantity = ?,
              unit_of_measure = ?,
              lot_number = ?,
              allergens_json = ?,
              received_by = ?,
              carrier = ?,
              supplier_id = ?,
              status = 'active',
              updated_by_user_id = ?,
              stock_applied_quantity = ?,
              stock_applied_inventory_item_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(
        input.masterItemId,
        input.inventoryItemId,
        input.itemName,
        input.date,
        input.time,
        input.packages,
        input.quantityPerPackage,
        input.totalQuantity,
        input.unitOfMeasure,
        input.lotNumber,
        JSON.stringify(input.allergens),
        input.receivedBy,
        input.carrier,
        input.supplierId,
        input.updatedByUserId,
        input.stockAppliedQuantity,
        input.stockAppliedInventoryItemId,
        id,
      )
      .run();
    return this.getReceivingEntry(id);
  }

  async archiveReceivingEntry(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<ReceivingEntryRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE receiving_entries
          SET status = 'archived',
              archived_at = ?,
              archived_by_user_id = ?,
              updated_by_user_id = ?,
              stock_applied_quantity = 0,
              stock_applied_inventory_item_id = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(input.archivedAt, input.actorUserId ?? null, input.actorUserId ?? null, id)
      .run();
    return this.getReceivingEntry(id);
  }

  async listMoveEntries(): Promise<MoveEntryRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, move_id, receiving_id, master_item_id, inventory_item_id,
                 item_name, lot_number, date, time, case_count,
                 quantity_per_case, quantity_moved, unit_of_measure, moved_by,
                 from_location, to_location, status, archived_at,
                 archived_by_user_id, updated_by_user_id
          FROM move_entries
          WHERE status = 'active'
          ORDER BY date DESC, time DESC, move_id DESC
        `,
      )
      .all<MoveRow>();
    return (rows.results ?? []).map(mapMoveRow);
  }

  async nextMoveSequence(): Promise<number> {
    return this.nextSequence("move_entries", "move_id", 1000);
  }

  async createMoveEntry(input: MoveEntryInput): Promise<MoveEntryRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO move_entries (
            id, move_id, receiving_id, master_item_id, inventory_item_id,
            item_name, lot_number, date, time, case_count, quantity_per_case,
            quantity_moved, unit_of_measure, moved_by, from_location, to_location,
            status, updated_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.moveId,
        input.receivingId,
        input.masterItemId,
        input.inventoryItemId,
        input.itemName,
        input.lotNumber,
        input.date,
        input.time,
        input.caseCount,
        input.quantityPerCase,
        input.quantityMoved,
        input.unitOfMeasure,
        input.movedBy,
        input.fromLocation,
        input.toLocation,
        input.status ?? "active",
        input.updatedByUserId ?? null,
      )
      .run();
    return (await this.listMoveEntries()).find((entry) => entry.id === input.id) as MoveEntryRecord;
  }

  async getMoveEntry(id: string): Promise<MoveEntryRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, move_id, receiving_id, master_item_id, inventory_item_id,
                 item_name, lot_number, date, time, case_count,
                 quantity_per_case, quantity_moved, unit_of_measure, moved_by,
                 from_location, to_location, status, archived_at,
                 archived_by_user_id, updated_by_user_id
          FROM move_entries
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<MoveRow>();
    return row ? mapMoveRow(row) : null;
  }

  async updateMoveEntry(id: string, input: MoveEntryInput): Promise<MoveEntryRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE move_entries
          SET receiving_id = ?,
              master_item_id = ?,
              inventory_item_id = ?,
              item_name = ?,
              lot_number = ?,
              date = ?,
              time = ?,
              case_count = ?,
              quantity_per_case = ?,
              quantity_moved = ?,
              unit_of_measure = ?,
              moved_by = ?,
              from_location = ?,
              to_location = ?,
              status = 'active',
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(
        input.receivingId,
        input.masterItemId,
        input.inventoryItemId,
        input.itemName,
        input.lotNumber,
        input.date,
        input.time,
        input.caseCount,
        input.quantityPerCase,
        input.quantityMoved,
        input.unitOfMeasure,
        input.movedBy,
        input.fromLocation,
        input.toLocation,
        input.updatedByUserId,
        id,
      )
      .run();
    return this.getMoveEntry(id);
  }

  async archiveMoveEntry(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<MoveEntryRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE move_entries
          SET status = 'archived',
              archived_at = ?,
              archived_by_user_id = ?,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'active'
        `,
      )
      .bind(input.archivedAt, input.actorUserId ?? null, input.actorUserId ?? null, id)
      .run();
    return this.getMoveEntry(id);
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

function mapInventorySetupRow(row: InventoryItemRow): InventoryItemSetupRecord {
  const allocatedQuantity = row.allocated_quantity;
  const onHandQuantity = row.on_hand_quantity;
  return {
    id: row.id,
    masterItemId: row.master_item_id ?? "",
    masterItemName: row.master_item_name ?? null,
    itemType: row.item_type ?? "other",
    category: row.category ?? categoryForItemType(row.item_type),
    supplierId: row.supplier_id ?? null,
    customerId: row.customer_id ?? "general",
    onHandQuantity,
    allocatedQuantity,
    netAvailableQuantity: onHandQuantity - allocatedQuantity,
    reorderPointQuantity: row.reorder_point_quantity ?? 0,
    unitOfMeasure: row.unit_of_measure,
    unitCostCents: row.unit_cost_cents ?? null,
    leadTimeDays: row.lead_time_days ?? null,
    location: row.location ?? null,
    lotNumber: row.lot_number ?? null,
    lotsJson: row.lots_json ?? null,
    status: row.status ?? "active",
    archivedAt: row.archived_at ?? null,
    archivedByUserId: row.archived_by_user_id ?? null,
  };
}

function mapInventoryAdjustmentRow(row: InventoryAdjustmentRow): InventoryAdjustmentRecord {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    quantityBefore: row.quantity_before,
    quantityAfter: row.quantity_after,
    quantityDelta: row.quantity_delta,
    reason: row.reason,
    note: row.note ?? null,
    lotsBeforeJson: row.lots_before_json ?? null,
    lotsAfterJson: row.lots_after_json ?? null,
    adjustedByUserId: row.adjusted_by_user_id ?? null,
    createdAt: row.created_at,
  };
}

function categoryForItemType(itemType: InventoryItemRow["item_type"]): InventoryItemSetupRecord["category"] {
  if (itemType === "packaging") return "Packaging";
  if (itemType === "finished_good") return "Finished Good";
  return "Ingredient";
}

function mapReceivingRow(row: ReceivingRow): ReceivingEntryRecord {
  return {
    id: row.id,
    receivingId: row.receiving_id,
    masterItemId: row.master_item_id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    date: row.date,
    time: row.time,
    packages: row.packages,
    quantityPerPackage: row.quantity_per_package,
    totalQuantity: row.total_quantity,
    unitOfMeasure: row.unit_of_measure,
    lotNumber: row.lot_number,
    allergens: parseJsonArray(row.allergens_json),
    receivedBy: row.received_by,
    carrier: row.carrier,
    supplierId: row.supplier_id,
    status: row.status ?? "active",
    archivedAt: row.archived_at ?? null,
    archivedByUserId: row.archived_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    stockAppliedQuantity: row.stock_applied_quantity ?? 0,
    stockAppliedInventoryItemId: row.stock_applied_inventory_item_id ?? null,
  };
}

function mapMoveRow(row: MoveRow): MoveEntryRecord {
  return {
    id: row.id,
    moveId: row.move_id,
    receivingId: row.receiving_id,
    masterItemId: row.master_item_id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    lotNumber: row.lot_number,
    date: row.date,
    time: row.time,
    caseCount: row.case_count,
    quantityPerCase: row.quantity_per_case,
    quantityMoved: row.quantity_moved,
    unitOfMeasure: row.unit_of_measure,
    movedBy: row.moved_by,
    fromLocation: row.from_location,
    toLocation: row.to_location,
    status: row.status ?? "active",
    archivedAt: row.archived_at ?? null,
    archivedByUserId: row.archived_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
  };
}

function parseJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
