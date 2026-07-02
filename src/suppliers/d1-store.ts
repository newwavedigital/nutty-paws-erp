import { D1DataRecordStore } from "../records/d1-store";
import type { SupplierProductLineInput, SupplierProductLineRecord, SupplierProductType, SupplierStore } from "./service";

type SupplierProductLineRow = {
  id: string;
  supplier_id: string;
  inventory_item_id?: string | null;
  product_name: string;
  product_type: string | null;
  price_per_unit_cents: number | null;
  unit_of_measure: string | null;
  moq: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export class D1SupplierStore extends D1DataRecordStore implements SupplierStore {
  constructor(db: D1Database) {
    super(db, "suppliers", "supplier");
  }

  async listSupplierProductLines(supplierId: string): Promise<SupplierProductLineRecord[]> {
    const rows = await this.db
      .prepare(
        `
          SELECT id, supplier_id, inventory_item_id, product_name, product_type,
                 price_per_unit_cents, unit_of_measure, moq, notes, created_at, updated_at
          FROM supplier_product_lines
          WHERE supplier_id = ?
          ORDER BY product_name ASC, created_at ASC
        `,
      )
      .bind(supplierId)
      .all<SupplierProductLineRow>();

    return (rows.results ?? []).map(mapSupplierProductLine);
  }

  async replaceSupplierProductLines(supplierId: string, lines: SupplierProductLineInput[], actorUserId?: string | null): Promise<SupplierProductLineRecord[]> {
    const now = new Date().toISOString();
    const batch = [
      this.db.prepare("DELETE FROM supplier_product_lines WHERE supplier_id = ?").bind(supplierId),
      ...lines.map((line) => this.db
        .prepare(
          `
            INSERT INTO supplier_product_lines (
              id, supplier_id, inventory_item_id, product_name, product_type,
              price_per_unit_cents, unit_of_measure, moq, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          line.id || `supplier_line_${crypto.randomUUID()}`,
          supplierId,
          line.inventoryItemId,
          line.productName,
          line.productType,
          line.pricePerUnitCents ?? null,
          line.unitOfMeasure ?? null,
          line.moq ?? null,
          line.notes ?? null,
          now,
          now,
        )),
    ];

    await this.db.batch(batch);
    await this.createAuditEvent({
      actorUserId: actorUserId ?? null,
      entityType: "supplier",
      entityId: supplierId,
      action: "supplier.product_lines.replaced",
      metadata: { lineCount: lines.length },
    });
    return this.listSupplierProductLines(supplierId);
  }

  async isSupplierInventoryItem(inventoryItemId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `
          SELECT id
          FROM inventory_items
          WHERE id = ?
            AND category IN ('Ingredient', 'Packaging')
          LIMIT 1
        `,
      )
      .bind(inventoryItemId)
      .first<{ id: string }>();
    return Boolean(row);
  }
}

function mapSupplierProductLine(row: SupplierProductLineRow): SupplierProductLineRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    inventoryItemId: row.inventory_item_id ?? null,
    productName: row.product_name,
    productType: (row.product_type === "Packaging" ? "Packaging" : "Ingredient") as SupplierProductType,
    pricePerUnitCents: row.price_per_unit_cents,
    unitOfMeasure: row.unit_of_measure,
    moq: row.moq,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
