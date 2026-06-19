PRAGMA foreign_keys = OFF;

CREATE TABLE purchase_orders_sprint_7 (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'submitted',
      'supply_chain_review',
      'awaiting_deposit',
      'approved_for_production',
      'in_production',
      'qa_review',
      'completed',
      'cancelled'
    )
  ),
  deposit_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
    deposit_status IN ('not_required', 'required', 'requested', 'received', 'waived')
  ),
  requested_ship_date TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  submitted_at TEXT,
  approved_for_production_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO purchase_orders_sprint_7 (
  id,
  po_number,
  customer_id,
  status,
  deposit_status,
  requested_ship_date,
  notes,
  created_by_user_id,
  submitted_at,
  approved_for_production_at,
  cancelled_at,
  created_at,
  updated_at
)
SELECT
  id,
  po_number,
  customer_id,
  status,
  deposit_status,
  requested_ship_date,
  notes,
  created_by_user_id,
  submitted_at,
  approved_for_production_at,
  cancelled_at,
  created_at,
  updated_at
FROM purchase_orders;

DROP TABLE purchase_orders;
ALTER TABLE purchase_orders_sprint_7 RENAME TO purchase_orders;

CREATE INDEX idx_purchase_orders_customer_id ON purchase_orders(customer_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN is_own_brand INTEGER NOT NULL DEFAULT 0 CHECK (is_own_brand IN (0, 1));

CREATE TABLE production_runs (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL UNIQUE,
  production_date TEXT NOT NULL,
  production_end_date TEXT NOT NULL,
  production_room TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'finalized', 'reopened')),
  finalized_at TEXT,
  reopened_at TEXT,
  correction_count INTEGER NOT NULL DEFAULT 0 CHECK (correction_count >= 0),
  notes TEXT,
  created_by_user_id TEXT,
  finalized_by_user_id TEXT,
  reopened_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reopened_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE production_run_lines (
  id TEXT PRIMARY KEY,
  production_run_id TEXT NOT NULL,
  purchase_order_line_id TEXT NOT NULL,
  product_id TEXT,
  ordered_quantity REAL NOT NULL DEFAULT 0 CHECK (ordered_quantity >= 0),
  quantity_produced REAL NOT NULL DEFAULT 0 CHECK (quantity_produced >= 0),
  cases_produced REAL NOT NULL DEFAULT 0 CHECK (cases_produced >= 0),
  lot_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE production_run_materials (
  id TEXT PRIMARY KEY,
  production_run_id TEXT NOT NULL,
  purchase_order_line_id TEXT,
  product_id TEXT,
  master_item_id TEXT NOT NULL,
  inventory_item_id TEXT,
  material_type TEXT NOT NULL CHECK (material_type IN ('ingredient', 'packaging')),
  theoretical_quantity REAL NOT NULL DEFAULT 0 CHECK (theoretical_quantity >= 0),
  actual_used_quantity REAL NOT NULL DEFAULT 0 CHECK (actual_used_quantity >= 0),
  waste_percent REAL NOT NULL DEFAULT 0,
  lot_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
);

CREATE TABLE production_inventory_effects (
  id TEXT PRIMARY KEY,
  production_run_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  effect_type TEXT NOT NULL CHECK (effect_type IN ('consume_material', 'produce_finished_good')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE TABLE production_logs (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL UNIQUE,
  purchase_order_id TEXT NOT NULL UNIQUE,
  production_run_id TEXT NOT NULL,
  production_date TEXT NOT NULL,
  production_end_date TEXT NOT NULL,
  production_room TEXT NOT NULL,
  completed_at TEXT,
  overall_waste_percent REAL NOT NULL DEFAULT 0,
  line_snapshot_json TEXT NOT NULL DEFAULT '[]',
  material_snapshot_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE
);

CREATE TABLE inventory_lots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  production_run_id TEXT NOT NULL,
  production_date TEXT NOT NULL,
  quantity_produced REAL NOT NULL DEFAULT 0 CHECK (quantity_produced >= 0),
  status TEXT NOT NULL DEFAULT 'qa_review' CHECK (status IN ('qa_review', 'released', 'hold')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, lot_number),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_production_runs_status ON production_runs(status);
CREATE INDEX idx_production_run_lines_run_id ON production_run_lines(production_run_id);
CREATE INDEX idx_production_run_materials_run_id ON production_run_materials(production_run_id);
CREATE INDEX idx_production_inventory_effects_run_id ON production_inventory_effects(production_run_id);
CREATE INDEX idx_production_logs_completed_at ON production_logs(completed_at);
CREATE INDEX idx_inventory_lots_product_id ON inventory_lots(product_id);
CREATE INDEX idx_inventory_lots_lot_number ON inventory_lots(lot_number);
