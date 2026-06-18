PRAGMA foreign_keys = ON;

CREATE TABLE procurement_orders (
  id TEXT PRIMARY KEY,
  procurement_order_number TEXT NOT NULL UNIQUE,
  quickbooks_po_number TEXT,
  supplier_id TEXT,
  supplier_name_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'ordered', 'partially_received', 'completed', 'cancelled')
  ),
  date_ordered TEXT,
  expected_date TEXT,
  received_date TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  submitted_by_user_id TEXT,
  ordered_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE procurement_order_lines (
  id TEXT PRIMARY KEY,
  procurement_order_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  master_item_id TEXT NOT NULL,
  inventory_item_id TEXT,
  description TEXT NOT NULL,
  quantity_ordered REAL NOT NULL CHECK (quantity_ordered > 0),
  quantity_received REAL NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_of_measure TEXT NOT NULL,
  unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  suggested_quantity REAL NOT NULL DEFAULT 0 CHECK (suggested_quantity >= 0),
  source_reason TEXT NOT NULL CHECK (
    source_reason IN ('low_stock', 'net_below_reorder', 'supply_chain_shortage')
  ),
  source_purchase_order_line_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (procurement_order_id, line_number),
  FOREIGN KEY (procurement_order_id) REFERENCES procurement_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL,
  FOREIGN KEY (source_purchase_order_line_id) REFERENCES purchase_order_lines(id) ON DELETE SET NULL
);

CREATE TABLE procurement_receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  procurement_order_id TEXT NOT NULL,
  receipt_date TEXT NOT NULL,
  received_by_user_id TEXT,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (procurement_order_id) REFERENCES procurement_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (received_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE procurement_receipt_lines (
  id TEXT PRIMARY KEY,
  procurement_receipt_id TEXT NOT NULL,
  procurement_order_line_id TEXT NOT NULL,
  inventory_item_id TEXT,
  received_quantity REAL NOT NULL CHECK (received_quantity > 0),
  lot_number TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (procurement_receipt_id) REFERENCES procurement_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (procurement_order_line_id) REFERENCES procurement_order_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
);

CREATE INDEX idx_procurement_orders_status ON procurement_orders(status);
CREATE INDEX idx_procurement_orders_supplier_id ON procurement_orders(supplier_id);
CREATE INDEX idx_procurement_order_lines_order_id ON procurement_order_lines(procurement_order_id);
CREATE INDEX idx_procurement_order_lines_inventory_item_id ON procurement_order_lines(inventory_item_id);
CREATE INDEX idx_procurement_receipts_order_id ON procurement_receipts(procurement_order_id);
CREATE INDEX idx_procurement_receipt_lines_receipt_id ON procurement_receipt_lines(procurement_receipt_id);
