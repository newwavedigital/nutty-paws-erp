import type {
  CatalogStore,
  MasterItemInput,
  MasterItemRecord,
  MasterItemType,
  ProductBomInput,
  ProductBomRecord,
  ProductInput,
  ProductRecord,
  ProductStatus,
} from "./service";

type ProductRow = {
  id: string;
  customer_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  production_room?: string | null;
  size?: number | null;
  size_unit?: string | null;
  case_quantity?: number | null;
  case_sticker?: string | null;
  unit_price_cents?: number | null;
  kosher?: number | null;
  allergen?: number | null;
  allergen_details?: string | null;
  daily_production_rate?: number | null;
  notes?: string | null;
};

type MasterItemRow = {
  id: string;
  sku: string;
  name: string;
  item_type: MasterItemType;
  unit_of_measure: string;
  customer_id?: string | null;
  allergens_json?: string | null;
};

type ProductBomRow = {
  id: string;
  product_id: string;
  master_item_id: string;
  quantity_per_unit: number;
  percent_of_formula?: number | null;
};

export class D1CatalogStore implements CatalogStore {
  constructor(private readonly db: D1Database) {}

  async listProducts(): Promise<ProductRecord[]> {
    const result = await this.db
      .prepare(
        `
          SELECT id, customer_id, sku, name, description, status
               , production_room, size, size_unit, case_quantity, case_sticker,
                 unit_price_cents, kosher, allergen, allergen_details,
                 daily_production_rate, notes
          FROM products
          ORDER BY name
        `,
      )
      .all<ProductRow>();

    const products = (result.results ?? []).map(mapProduct);
    return this.withBomItems(products);
  }

  async getProduct(id: string): Promise<ProductRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, customer_id, sku, name, description, status
               , production_room, size, size_unit, case_quantity, case_sticker,
                 unit_price_cents, kosher, allergen, allergen_details,
                 daily_production_rate, notes
          FROM products
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ProductRow>();

    if (!row) return null;
    return (await this.withBomItems([mapProduct(row)]))[0] ?? null;
  }

  async createProduct(input: ProductInput): Promise<ProductRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO products (
            id, customer_id, sku, name, description, status, production_room,
            size, size_unit, case_quantity, case_sticker, unit_price_cents,
            kosher, allergen, allergen_details, daily_production_rate, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.customerId,
        input.sku,
        input.name,
        input.description,
        input.status,
        input.productionRoom,
        input.size,
        input.sizeUnit,
        input.caseQuantity,
        input.caseSticker,
        input.unitPriceCents,
        input.kosher ? 1 : 0,
        input.allergen ? 1 : 0,
        input.allergenDetails,
        input.dailyProductionRate,
        input.notes,
      )
      .run();
    await this.replaceProductBomItems(input.id, input.bomItems);
    return (await this.getProduct(input.id)) as ProductRecord;
  }

  async updateProduct(id: string, input: ProductInput): Promise<ProductRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE products
          SET customer_id = ?,
              sku = ?,
              name = ?,
              description = ?,
              status = ?,
              production_room = ?,
              size = ?,
              size_unit = ?,
              case_quantity = ?,
              case_sticker = ?,
              unit_price_cents = ?,
              kosher = ?,
              allergen = ?,
              allergen_details = ?,
              daily_production_rate = ?,
              notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.customerId,
        input.sku,
        input.name,
        input.description,
        input.status,
        input.productionRoom,
        input.size,
        input.sizeUnit,
        input.caseQuantity,
        input.caseSticker,
        input.unitPriceCents,
        input.kosher ? 1 : 0,
        input.allergen ? 1 : 0,
        input.allergenDetails,
        input.dailyProductionRate,
        input.notes,
        id,
      )
      .run();
    await this.replaceProductBomItems(id, input.bomItems);
    return this.getProduct(id);
  }

  async replaceProductBomItems(productId: string, bomItems: ProductBomInput[]): Promise<ProductRecord | null> {
    await this.db.prepare("DELETE FROM product_bom_items WHERE product_id = ?").bind(productId).run();
    for (const item of bomItems) {
      await this.db
        .prepare(
          `
            INSERT INTO product_bom_items (
              id, product_id, master_item_id, quantity_per_unit, percent_of_formula
            )
            VALUES (?, ?, ?, ?, ?)
          `,
        )
        .bind(
          `bom_${crypto.randomUUID()}`,
          productId,
          item.masterItemId,
          item.quantityPerUnit,
          item.percentOfFormula ?? null,
        )
        .run();
    }
    return this.getProduct(productId);
  }

  async listMasterItems(): Promise<MasterItemRecord[]> {
    const result = await this.db
      .prepare(
        `
          SELECT id, sku, name, item_type, unit_of_measure, customer_id, allergens_json
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
          SELECT id, sku, name, item_type, unit_of_measure, customer_id, allergens_json
          FROM master_items
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<MasterItemRow>();

    return row ? mapMasterItem(row) : null;
  }

  async createMasterItem(input: MasterItemInput): Promise<MasterItemRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO master_items (
            id, sku, name, item_type, unit_of_measure, customer_id, allergens_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.sku,
        input.name,
        input.itemType,
        input.unitOfMeasure,
        input.customerId,
        JSON.stringify(input.allergens),
      )
      .run();
    return (await this.getMasterItem(input.id)) as MasterItemRecord;
  }

  async updateMasterItem(id: string, input: MasterItemInput): Promise<MasterItemRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE master_items
          SET sku = ?,
              name = ?,
              item_type = ?,
              unit_of_measure = ?,
              customer_id = ?,
              allergens_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.sku,
        input.name,
        input.itemType,
        input.unitOfMeasure,
        input.customerId,
        JSON.stringify(input.allergens),
        id,
      )
      .run();
    return this.getMasterItem(id);
  }

  private async withBomItems(products: ProductRecord[]) {
    if (products.length === 0) return products;
    const productIds = new Set(products.map((product) => product.id));
    const rows = await this.db
      .prepare(
        `
          SELECT id, product_id, master_item_id, quantity_per_unit, percent_of_formula
          FROM product_bom_items
          ORDER BY created_at
        `,
      )
      .all<ProductBomRow>();
    const bomByProduct = new Map<string, ProductBomRecord[]>();
    for (const row of rows.results ?? []) {
      if (!productIds.has(row.product_id)) continue;
      const items = bomByProduct.get(row.product_id) ?? [];
      items.push(mapProductBom(row));
      bomByProduct.set(row.product_id, items);
    }
    return products.map((product) => ({ ...product, bomItems: bomByProduct.get(product.id) ?? [] }));
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
    productionRoom: row.production_room ?? null,
    size: row.size ?? null,
    sizeUnit: row.size_unit ?? null,
    caseQuantity: row.case_quantity ?? null,
    caseSticker: row.case_sticker ?? null,
    unitPriceCents: row.unit_price_cents ?? null,
    kosher: row.kosher === 1,
    allergen: row.allergen === 1,
    allergenDetails: row.allergen_details ?? null,
    dailyProductionRate: row.daily_production_rate ?? null,
    notes: row.notes ?? row.description ?? null,
    bomItems: [],
  };
}

function mapMasterItem(row: MasterItemRow): MasterItemRecord {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    itemType: row.item_type,
    unitOfMeasure: row.unit_of_measure,
    customerId: row.customer_id ?? "general",
    allergens: parseJsonArray(row.allergens_json),
  };
}

function mapProductBom(row: ProductBomRow): ProductBomRecord {
  return {
    id: row.id,
    productId: row.product_id,
    masterItemId: row.master_item_id,
    quantityPerUnit: row.quantity_per_unit,
    percentOfFormula: row.percent_of_formula ?? null,
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
