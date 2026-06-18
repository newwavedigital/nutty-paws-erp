import type {
  InventoryAuditInput,
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

  async releaseReservationRecord(id: string): Promise<void> {
    await this.db
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
  }

  async releaseInventoryItemAllocation(id: string, quantity: number): Promise<void> {
    await this.db
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
                 inv.lots_json
          FROM inventory_items inv
          JOIN master_items mi ON mi.id = inv.master_item_id
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
                 carrier, supplier_id
          FROM receiving_entries
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
            supplier_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      )
      .run();
    return (await this.getReceivingEntryByBusinessId(input.receivingId)) as ReceivingEntryRecord;
  }

  async getReceivingEntryByBusinessId(receivingId: string): Promise<ReceivingEntryRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, receiving_id, master_item_id, inventory_item_id, item_name,
                 date, time, packages, quantity_per_package, total_quantity,
                 unit_of_measure, lot_number, allergens_json, received_by,
                 carrier, supplier_id
          FROM receiving_entries
          WHERE receiving_id = ?
        `,
      )
      .bind(receivingId)
      .first<ReceivingRow>();
    return row ? mapReceivingRow(row) : null;
  }

  async listMoveEntries(): Promise<MoveEntryRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, move_id, receiving_id, master_item_id, inventory_item_id,
                 item_name, lot_number, date, time, case_count,
                 quantity_per_case, quantity_moved, unit_of_measure, moved_by,
                 from_location, to_location
          FROM move_entries
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
            quantity_moved, unit_of_measure, moved_by, from_location, to_location
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      )
      .run();
    return (await this.listMoveEntries()).find((entry) => entry.id === input.id) as MoveEntryRecord;
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
