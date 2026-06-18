import type { CatalogStore, MasterItemRecord, MasterItemType, ProductRecord, ProductStatus } from "./service";

type ProductRow = {
  id: string;
  customer_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
};

type MasterItemRow = {
  id: string;
  sku: string;
  name: string;
  item_type: MasterItemType;
  unit_of_measure: string;
};

export class D1CatalogStore implements CatalogStore {
  constructor(private readonly db: D1Database) {}

  async listProducts(): Promise<ProductRecord[]> {
    const result = await this.db
      .prepare(
        `
          SELECT id, customer_id, sku, name, description, status
          FROM products
          ORDER BY name
        `,
      )
      .all<ProductRow>();

    return (result.results ?? []).map(mapProduct);
  }

  async getProduct(id: string): Promise<ProductRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, customer_id, sku, name, description, status
          FROM products
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ProductRow>();

    return row ? mapProduct(row) : null;
  }

  async listMasterItems(): Promise<MasterItemRecord[]> {
    const result = await this.db
      .prepare(
        `
          SELECT id, sku, name, item_type, unit_of_measure
          FROM master_items
          ORDER BY name
        `,
      )
      .all<MasterItemRow>();

    return (result.results ?? []).map(mapMasterItem);
  }

  async getMasterItem(id: string): Promise<MasterItemRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, sku, name, item_type, unit_of_measure
          FROM master_items
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<MasterItemRow>();

    return row ? mapMasterItem(row) : null;
  }
}

function mapProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    status: row.status,
  };
}

function mapMasterItem(row: MasterItemRow): MasterItemRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    itemType: row.item_type,
    unitOfMeasure: row.unit_of_measure,
  };
}
