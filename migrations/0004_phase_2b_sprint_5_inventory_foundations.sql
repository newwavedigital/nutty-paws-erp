PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN production_room TEXT;
ALTER TABLE products ADD COLUMN size REAL;
ALTER TABLE products ADD COLUMN size_unit TEXT;
ALTER TABLE products ADD COLUMN case_quantity REAL;
ALTER TABLE products ADD COLUMN case_sticker TEXT;
ALTER TABLE products ADD COLUMN unit_price_cents INTEGER;
ALTER TABLE products ADD COLUMN kosher INTEGER NOT NULL DEFAULT 0 CHECK (kosher IN (0, 1));
ALTER TABLE products ADD COLUMN allergen INTEGER NOT NULL DEFAULT 0 CHECK (allergen IN (0, 1));
ALTER TABLE products ADD COLUMN allergen_details TEXT;
ALTER TABLE products ADD COLUMN daily_production_rate REAL;
ALTER TABLE products ADD COLUMN notes TEXT;

ALTER TABLE master_items ADD COLUMN customer_id TEXT NOT NULL DEFAULT 'general';
ALTER TABLE master_items ADD COLUMN allergens_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE product_bom_items ADD COLUMN percent_of_formula REAL;

ALTER TABLE inventory_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Ingredient';
ALTER TABLE inventory_items ADD COLUMN supplier_id TEXT;
ALTER TABLE inventory_items ADD COLUMN customer_id TEXT NOT NULL DEFAULT 'general';
ALTER TABLE inventory_items ADD COLUMN unit_cost_cents INTEGER;
ALTER TABLE inventory_items ADD COLUMN lead_time_days INTEGER;
ALTER TABLE inventory_items ADD COLUMN lot_number TEXT;
ALTER TABLE inventory_items ADD COLUMN lots_json TEXT;

CREATE TABLE receiving_entries (
  id TEXT PRIMARY KEY,
  receiving_id TEXT NOT NULL UNIQUE,
  master_item_id TEXT NOT NULL,
  inventory_item_id TEXT,
  item_name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  packages REAL NOT NULL DEFAULT 0 CHECK (packages >= 0),
  quantity_per_package REAL NOT NULL DEFAULT 0 CHECK (quantity_per_package >= 0),
  total_quantity REAL NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  unit_of_measure TEXT NOT NULL,
  lot_number TEXT,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  received_by TEXT,
  carrier TEXT,
  supplier_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
);

CREATE TABLE move_entries (
  id TEXT PRIMARY KEY,
  move_id TEXT NOT NULL UNIQUE,
  receiving_id TEXT NOT NULL,
  master_item_id TEXT NOT NULL,
  inventory_item_id TEXT,
  item_name TEXT NOT NULL,
  lot_number TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  case_count REAL NOT NULL DEFAULT 0 CHECK (case_count >= 0),
  quantity_per_case REAL NOT NULL DEFAULT 0 CHECK (quantity_per_case >= 0),
  quantity_moved REAL NOT NULL DEFAULT 0 CHECK (quantity_moved >= 0),
  unit_of_measure TEXT NOT NULL,
  moved_by TEXT,
  from_location TEXT,
  to_location TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receiving_id) REFERENCES receiving_entries(receiving_id) ON DELETE CASCADE,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_items_customer_id ON inventory_items(customer_id);
CREATE INDEX idx_receiving_entries_master_item_id ON receiving_entries(master_item_id);
CREATE INDEX idx_receiving_entries_receiving_id ON receiving_entries(receiving_id);
CREATE INDEX idx_move_entries_receiving_id ON move_entries(receiving_id);
CREATE INDEX idx_move_entries_master_item_id ON move_entries(master_item_id);

CREATE TABLE file_metadata_sprint_5 (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (
    owner_type IN (
      'purchase_order',
      'purchase_order_line',
      'rd_request',
      'customer',
      'product',
      'inventory_item'
    )
  ),
  owner_id TEXT NOT NULL,
  file_category TEXT NOT NULL DEFAULT 'po_file' CHECK (
    file_category IN (
      'po_file',
      'coa',
      'shipment_document',
      'customer_spec_sheet',
      'co_packing_agreement',
      'product_image',
      'nutrition_facts',
      'inventory_coa'
    )
  ),
  storage_provider TEXT NOT NULL DEFAULT 'r2_pending' CHECK (storage_provider IN ('r2_pending', 'r2')),
  storage_key TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO file_metadata_sprint_5 (
  id,
  owner_type,
  owner_id,
  file_category,
  storage_provider,
  storage_key,
  file_name,
  content_type,
  size_bytes,
  uploaded_by_user_id,
  status,
  deleted_at,
  deleted_by_user_id,
  created_at
)
SELECT
  id,
  owner_type,
  owner_id,
  file_category,
  storage_provider,
  storage_key,
  file_name,
  content_type,
  size_bytes,
  uploaded_by_user_id,
  status,
  deleted_at,
  deleted_by_user_id,
  created_at
FROM file_metadata;

DROP TABLE file_metadata;
ALTER TABLE file_metadata_sprint_5 RENAME TO file_metadata;

CREATE INDEX idx_file_metadata_owner ON file_metadata(owner_type, owner_id);
CREATE INDEX idx_file_metadata_active_owner ON file_metadata(owner_type, owner_id, status, created_at);
CREATE INDEX idx_file_metadata_status ON file_metadata(status, deleted_at);
