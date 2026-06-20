PRAGMA foreign_keys = ON;

CREATE TABLE pick_pack_orders (
  id TEXT PRIMARY KEY,
  pick_pack_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  customer_po_number TEXT,
  date_submitted TEXT NOT NULL,
  date_needed_to_ship TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picked', 'shipped', 'cancelled')),
  po_file_id TEXT,
  notes TEXT,
  picked_at TEXT,
  picked_by_user_id TEXT,
  shipped_at TEXT,
  shipped_by_user_id TEXT,
  short_stock_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (short_stock_confirmed IN (0, 1)),
  short_stock_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (po_file_id) REFERENCES file_metadata(id) ON DELETE SET NULL,
  FOREIGN KEY (picked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (shipped_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE pick_pack_order_lines (
  id TEXT PRIMARY KEY,
  pick_pack_order_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  inventory_item_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  picked_quantity REAL NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  short_quantity REAL NOT NULL DEFAULT 0 CHECK (short_quantity >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pick_pack_order_id, line_number),
  FOREIGN KEY (pick_pack_order_id) REFERENCES pick_pack_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE TABLE pick_pack_shipping_details (
  id TEXT PRIMARY KEY,
  pick_pack_order_id TEXT NOT NULL UNIQUE,
  shipping_mode TEXT NOT NULL DEFAULT 'pallet' CHECK (shipping_mode IN ('pallet', 'parcel')),
  carrier TEXT,
  tracking_number TEXT,
  bol_number TEXT,
  pallet_count REAL CHECK (pallet_count IS NULL OR pallet_count >= 0),
  weight REAL CHECK (weight IS NULL OR weight >= 0),
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pick_pack_order_id) REFERENCES pick_pack_orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_pick_pack_orders_status ON pick_pack_orders(status);
CREATE INDEX idx_pick_pack_orders_customer_id ON pick_pack_orders(customer_id);
CREATE INDEX idx_pick_pack_orders_needed ON pick_pack_orders(date_needed_to_ship);
CREATE INDEX idx_pick_pack_lines_order_id ON pick_pack_order_lines(pick_pack_order_id);
CREATE INDEX idx_pick_pack_lines_inventory_item_id ON pick_pack_order_lines(inventory_item_id);
CREATE INDEX idx_pick_pack_shipping_order_id ON pick_pack_shipping_details(pick_pack_order_id);
CREATE UNIQUE INDEX idx_inventory_movements_pick_pack_order_item
  ON inventory_movements(reference_type, reference_id, inventory_item_id)
  WHERE reference_type = 'pick_pack_order';
