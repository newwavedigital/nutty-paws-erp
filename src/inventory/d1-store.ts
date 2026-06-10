import type {
  InventoryAuditInput,
  InventoryItemRecord,
  InventoryMovementInput,
  InventoryReservationRecord,
  InventoryStore,
} from "./service";

type InventoryItemRow = {
  id: string;
  on_hand_quantity: number;
  allocated_quantity: number;
  unit_of_measure: string;
};

type ReservationRow = {
  id: string;
  inventory_item_id: string;
  purchase_order_line_id: string;
  quantity: number;
  status: "active";
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
}
