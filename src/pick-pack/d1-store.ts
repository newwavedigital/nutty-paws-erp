import type {
  PickPackInventoryItemRecord,
  PickPackOrderLineRecord,
  PickPackOrderRecord,
  PickPackOrderStatus,
  PickPackShippingDetailsRecord,
  PickPackShortage,
  PickPackStore,
  PickPackShippingMode,
  PickPackInventoryAdjustment,
} from "./service";
import { PickPackError } from "./service";

type PickPackOrderRow = {
  id: string;
  pick_pack_number: string;
  customer_id: string;
  customer_po_number: string | null;
  date_submitted: string;
  date_needed_to_ship: string | null;
  status: PickPackOrderStatus;
  po_file_id: string | null;
  notes: string | null;
  picked_at: string | null;
  picked_by_user_id: string | null;
  shipped_at: string | null;
  shipped_by_user_id: string | null;
  short_stock_confirmed: number;
  short_stock_json: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type PickPackOrderLineRow = {
  id: string;
  pick_pack_order_id: string;
  line_number: number;
  inventory_item_id: string;
  quantity: number;
  picked_quantity: number;
  short_quantity: number;
  item_name: string;
  sku: string | null;
  customer_id: string | null;
  on_hand_quantity: number;
};

type PickPackShippingDetailsRow = {
  id: string;
  pick_pack_order_id: string;
  shipping_mode: PickPackShippingMode;
  carrier: string | null;
  tracking_number: string | null;
  bol_number: string | null;
  pallet_count: number | null;
  weight: number | null;
  dimensions_json: string;
  notes: string | null;
  updated_at: string;
};

type InventoryItemRow = {
  id: string;
  item_name: string;
  sku: string | null;
  customer_id: string | null;
  category: string;
  on_hand_quantity: number;
};

export class D1PickPackStore implements PickPackStore {
  constructor(private readonly db: D1Database) {}

  async listOrders(): Promise<PickPackOrderRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, pick_pack_number, customer_id, customer_po_number, date_submitted,
                 date_needed_to_ship, status, po_file_id, notes, picked_at,
                 picked_by_user_id, shipped_at, shipped_by_user_id,
                 short_stock_confirmed, short_stock_json, created_by_user_id,
                 created_at, updated_at
          FROM pick_pack_orders
          WHERE status <> 'cancelled'
          ORDER BY created_at DESC, id DESC
        `,
      )
      .all<PickPackOrderRow>();
    return Promise.all((rows.results ?? []).map((row) => this.hydrateOrder(row)));
  }

  async getOrder(id: string): Promise<PickPackOrderRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, pick_pack_number, customer_id, customer_po_number, date_submitted,
                 date_needed_to_ship, status, po_file_id, notes, picked_at,
                 picked_by_user_id, shipped_at, shipped_by_user_id,
                 short_stock_confirmed, short_stock_json, created_by_user_id,
                 created_at, updated_at
          FROM pick_pack_orders
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<PickPackOrderRow>();
    return row ? this.hydrateOrder(row) : null;
  }

  async customerExists(customerId: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first<{ id: string }>();
    return Boolean(row);
  }

  async getFinishedGoodInventoryItem(inventoryItemId: string): Promise<PickPackInventoryItemRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT inv.id, mi.name AS item_name, mi.sku, inv.customer_id, inv.category, inv.on_hand_quantity
          FROM inventory_items inv
          JOIN master_items mi ON mi.id = inv.master_item_id
          WHERE inv.id = ?
            AND inv.category = 'Finished Good'
        `,
      )
      .bind(inventoryItemId)
      .first<InventoryItemRow>();
    if (!row) return null;
    return {
      id: row.id,
      itemName: row.item_name,
      sku: row.sku,
      customerId: row.customer_id,
      onHandQuantity: row.on_hand_quantity,
    };
  }

  async nextPickPackSequence(): Promise<number> {
    const row = await this.db
      .prepare(
        `
          SELECT MAX(CAST(SUBSTR(pick_pack_number, INSTR(pick_pack_number, '-') + 1) AS INTEGER)) AS max_sequence
          FROM pick_pack_orders
        `,
      )
      .first<{ max_sequence: number | null }>();
    return (row?.max_sequence ?? 1000) + 1;
  }

  async createOrder(input: {
    id: string;
    pickPackNumber: string;
    customerId: string;
    customerPoNumber: string | null;
    dateSubmitted: string;
    dateNeededToShip: string | null;
    poFileId: string | null;
    notes: string | null;
    lines: PickPackOrderLineRecord[];
    actorUserId?: string;
  }): Promise<PickPackOrderRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO pick_pack_orders (
            id, pick_pack_number, customer_id, customer_po_number, date_submitted,
            date_needed_to_ship, status, po_file_id, notes, short_stock_confirmed,
            short_stock_json, created_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, 0, '[]', ?)
        `,
      )
      .bind(
        input.id,
        input.pickPackNumber,
        input.customerId,
        input.customerPoNumber,
        input.dateSubmitted,
        input.dateNeededToShip,
        input.poFileId,
        input.notes,
        input.actorUserId ?? null,
      )
      .run();

    await this.replaceOrderLines(input.id, input.lines);
    const record = await this.getOrder(input.id);
    if (!record) {
      throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
    }
    return record;
  }

  async replaceOrderLines(orderId: string, lines: PickPackOrderLineRecord[]): Promise<void> {
    await this.db.prepare("DELETE FROM pick_pack_order_lines WHERE pick_pack_order_id = ?").bind(orderId).run();
    for (const [index, line] of lines.entries()) {
      await this.db
        .prepare(
          `
            INSERT INTO pick_pack_order_lines (
              id, pick_pack_order_id, line_number, inventory_item_id, quantity,
              picked_quantity, short_quantity
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          line.id,
          orderId,
          index + 1,
          line.inventoryItemId,
          line.quantity,
          line.pickedQuantity,
          line.shortQuantity,
        )
        .run();
    }
  }

  async updateOrder(input: {
    orderId: string;
    customerId: string;
    customerPoNumber: string | null;
    dateSubmitted: string;
    dateNeededToShip: string | null;
    poFileId: string | null;
    notes: string | null;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE pick_pack_orders
          SET customer_id = ?,
              customer_po_number = ?,
              date_submitted = ?,
              date_needed_to_ship = ?,
              po_file_id = ?,
              notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'open'
        `,
      )
      .bind(
        input.customerId,
        input.customerPoNumber,
        input.dateSubmitted,
        input.dateNeededToShip,
        input.poFileId,
        input.notes,
        input.orderId,
      )
      .run();
    return this.getOrder(input.orderId);
  }

  async completePickPackPick(input: {
    orderId: string;
    pickedAt: string;
    pickedByUserId?: string;
    shortStockConfirmed: boolean;
    shortStockJson: string;
    shortStock: PickPackShortage[];
    lines: PickPackOrderLineRecord[];
    inventoryAdjustments: PickPackInventoryAdjustment[];
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null> {
    const inventoryUpdateStatements: D1PreparedStatement[] = [];
    for (const adjustment of input.inventoryAdjustments) {
      inventoryUpdateStatements.push(
        this.db
          .prepare(
            `
              UPDATE inventory_items
              SET on_hand_quantity = on_hand_quantity + ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
                AND category = 'Finished Good'
                AND on_hand_quantity + ? >= 0
            `,
          )
          .bind(adjustment.quantityDelta, adjustment.inventoryItemId, adjustment.quantityDelta),
      );
    }
    if (inventoryUpdateStatements.length > 0) {
      const updateResults = await this.db.batch(inventoryUpdateStatements);
      const failedIndex = updateResults.findIndex((result) => (result.meta?.changes ?? 0) === 0);
      if (failedIndex >= 0) {
        const successfulAdjustments = input.inventoryAdjustments.slice(0, failedIndex);
        if (successfulAdjustments.length > 0) {
          await this.db.batch(
            successfulAdjustments.map((adjustment) =>
              this.db
                .prepare(
                  `
                    UPDATE inventory_items
                    SET on_hand_quantity = on_hand_quantity - ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND category = 'Finished Good'
                  `,
                )
                .bind(adjustment.quantityDelta, adjustment.inventoryItemId),
            ),
          );
        }
        throw new PickPackError(
          "PICK_PACK_INVENTORY_CONFLICT",
          "Finished-good inventory changed before this order could be marked picked. Refresh and try again.",
        );
      }
    }

    const orderUpdate = await this.db
      .prepare(
        `
          UPDATE pick_pack_orders
          SET status = 'picked',
              picked_at = COALESCE(picked_at, ?),
              picked_by_user_id = COALESCE(picked_by_user_id, ?),
              short_stock_confirmed = ?,
              short_stock_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'open'
        `,
      )
      .bind(
        input.pickedAt,
        input.pickedByUserId ?? null,
        input.shortStockConfirmed ? 1 : 0,
        input.shortStockJson,
        input.orderId,
      )
      .run();
    if ((orderUpdate.meta?.changes ?? 0) === 0) {
      const existing = await this.getOrder(input.orderId);
      if (existing) {
        return existing;
      }
      return null;
    }

    const statements: D1PreparedStatement[] = [
      this.db.prepare("DELETE FROM pick_pack_order_lines WHERE pick_pack_order_id = ?").bind(input.orderId),
    ];
    for (const [index, line] of input.lines.entries()) {
      statements.push(
        this.db
          .prepare(
            `
              INSERT INTO pick_pack_order_lines (
                id, pick_pack_order_id, line_number, inventory_item_id, quantity,
                picked_quantity, short_quantity
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            line.id,
            input.orderId,
            index + 1,
            line.inventoryItemId,
            line.quantity,
            line.pickedQuantity,
            line.shortQuantity,
          ),
      );
    }
    for (const adjustment of input.inventoryAdjustments) {
      statements.push(
        this.db
          .prepare(
            `
              INSERT INTO inventory_movements (
                id, inventory_item_id, movement_type, quantity_delta, reference_type,
                reference_id, created_by_user_id
              )
              VALUES (?, ?, 'consumed', ?, ?, ?, ?)
            `,
          )
          .bind(
            `movement_${crypto.randomUUID()}`,
            adjustment.inventoryItemId,
            adjustment.quantityDelta,
            adjustment.referenceType,
            adjustment.referenceId,
            input.actorUserId ?? null,
          ),
      );
    }

    try {
      await this.db.batch(statements);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
        return this.getOrder(input.orderId);
      }
      throw error;
    }
    return this.getOrder(input.orderId);
  }

  async markOrderShipped(input: {
    orderId: string;
    shippedAt: string;
    shippedByUserId?: string;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE pick_pack_orders
          SET status = 'shipped',
              shipped_at = COALESCE(shipped_at, ?),
              shipped_by_user_id = COALESCE(shipped_by_user_id, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(input.shippedAt, input.shippedByUserId ?? null, input.orderId)
      .run();
    return this.getOrder(input.orderId);
  }

  async cancelOrder(input: {
    orderId: string;
    actorUserId?: string;
  }): Promise<PickPackOrderRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE pick_pack_orders
          SET status = 'cancelled',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status <> 'shipped'
        `,
      )
      .bind(input.orderId)
      .run();
    return this.getOrder(input.orderId);
  }

  async upsertShippingDetails(input: {
    orderId: string;
    shippingMode: PickPackShippingMode;
    carrier?: string | null;
    trackingNumber?: string | null;
    bolNumber?: string | null;
    palletCount?: number | null;
    weight?: number | null;
    dimensionsJson?: string | null;
    notes?: string | null;
    actorUserId?: string;
  }): Promise<PickPackShippingDetailsRecord> {
    const existing = await this.getShippingDetails(input.orderId);
    const id = existing?.id ?? `pick_pack_shipping_${crypto.randomUUID()}`;
    await this.db
      .prepare(
        `
          INSERT INTO pick_pack_shipping_details (
            id, pick_pack_order_id, shipping_mode, carrier, tracking_number,
            bol_number, pallet_count, weight, dimensions_json, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(pick_pack_order_id) DO UPDATE SET
            shipping_mode = excluded.shipping_mode,
            carrier = excluded.carrier,
            tracking_number = excluded.tracking_number,
            bol_number = excluded.bol_number,
            pallet_count = excluded.pallet_count,
            weight = excluded.weight,
            dimensions_json = excluded.dimensions_json,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
      .bind(
        id,
        input.orderId,
        input.shippingMode,
        input.carrier ?? null,
        input.trackingNumber ?? null,
        input.bolNumber ?? null,
        input.palletCount ?? null,
        input.weight ?? null,
        input.dimensionsJson ?? "{}",
        input.notes ?? null,
      )
      .run();
    const details = await this.getShippingDetails(input.orderId);
    if (!details) {
      throw new PickPackError("PICK_PACK_ORDER_NOT_FOUND", "Pick & Pack order not found");
    }
    return details;
  }

  async createStatusEvent(input: {
    orderId: string;
    fromStatus: PickPackOrderStatus | null;
    toStatus: PickPackOrderStatus;
    eventType: string;
    actorUserId?: string;
    note?: string;
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
        "pick_pack_order",
        input.orderId,
        input.eventType,
        JSON.stringify({
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          note: input.note ?? null,
          eventType: input.eventType,
        }),
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

  private async getShippingDetails(orderId: string) {
    const row = await this.db
      .prepare(
        `
          SELECT id, pick_pack_order_id, shipping_mode, carrier, tracking_number,
                 bol_number, pallet_count, weight, dimensions_json, notes, updated_at
          FROM pick_pack_shipping_details
          WHERE pick_pack_order_id = ?
        `,
      )
      .bind(orderId)
      .first<PickPackShippingDetailsRow>();
    return row ? mapShippingDetailsRow(row) : null;
  }

  private async hydrateOrder(row: PickPackOrderRow): Promise<PickPackOrderRecord> {
    const [lines, shippingDetails] = await Promise.all([
      this.db
        .prepare(
          `
            SELECT l.id, l.pick_pack_order_id, l.line_number, l.inventory_item_id,
                   l.quantity, l.picked_quantity, l.short_quantity,
                   mi.name AS item_name, mi.sku, inv.customer_id, inv.on_hand_quantity
            FROM pick_pack_order_lines l
            JOIN inventory_items inv ON inv.id = l.inventory_item_id
            JOIN master_items mi ON mi.id = inv.master_item_id
            WHERE l.pick_pack_order_id = ?
            ORDER BY l.line_number ASC
          `,
        )
        .bind(row.id)
        .all<PickPackOrderLineRow>(),
      this.getShippingDetails(row.id),
    ]);

    return {
      id: row.id,
      pickPackNumber: row.pick_pack_number,
      customerId: row.customer_id,
      customerPoNumber: row.customer_po_number,
      dateSubmitted: row.date_submitted,
      dateNeededToShip: row.date_needed_to_ship,
      status: row.status,
      poFileId: row.po_file_id,
      notes: row.notes,
      pickedAt: row.picked_at,
      shippedAt: row.shipped_at,
      shortStockConfirmed: row.short_stock_confirmed === 1,
      shortStock: parseShortStock(row.short_stock_json),
      lines: (lines.results ?? []).map(mapLineRow),
      shippingDetails,
    };
  }
}

function mapLineRow(row: PickPackOrderLineRow): PickPackOrderLineRecord {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    sku: row.sku,
    customerId: row.customer_id,
    quantity: row.quantity,
    onHandQuantity: row.on_hand_quantity,
    pickedQuantity: row.picked_quantity,
    shortQuantity: row.short_quantity,
  };
}

function mapShippingDetailsRow(row: PickPackShippingDetailsRow): PickPackShippingDetailsRecord {
  return {
    id: row.id,
    pickPackOrderId: row.pick_pack_order_id,
    shippingMode: row.shipping_mode,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    bolNumber: row.bol_number,
    palletCount: row.pallet_count,
    weight: row.weight,
    dimensionsJson: row.dimensions_json,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function parseShortStock(value: string): PickPackShortage[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isShortage);
  } catch {
    return [];
  }
}

function isShortage(value: unknown): value is PickPackShortage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as PickPackShortage).inventoryItemId === "string" &&
      typeof (value as PickPackShortage).itemName === "string" &&
      typeof (value as PickPackShortage).requestedQuantity === "number" &&
      typeof (value as PickPackShortage).availableQuantity === "number" &&
      typeof (value as PickPackShortage).shortQuantity === "number",
  );
}
