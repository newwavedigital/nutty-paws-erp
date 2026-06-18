PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_bom_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  master_item_id TEXT NOT NULL,
  quantity_per_unit REAL NOT NULL CHECK (quantity_per_unit > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, master_item_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_bom_items_product_id ON product_bom_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_bom_items_master_item_id ON product_bom_items(master_item_id);
