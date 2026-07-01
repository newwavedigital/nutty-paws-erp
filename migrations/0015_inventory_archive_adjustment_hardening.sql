-- Inventory archive and adjustment hardening.
-- Keep production history intact by soft-archiving setup rows and recording
-- manual stock adjustment reasons with before/after quantities.

ALTER TABLE master_items
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

ALTER TABLE master_items
  ADD COLUMN archived_at TEXT;

ALTER TABLE master_items
  ADD COLUMN archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE inventory_items
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

ALTER TABLE inventory_items
  ADD COLUMN archived_at TEXT;

ALTER TABLE inventory_items
  ADD COLUMN archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE inventory_adjustments (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  quantity_delta REAL NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  lots_before_json TEXT,
  lots_after_json TEXT,
  adjusted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_master_items_status ON master_items(status, name);
CREATE INDEX idx_inventory_items_status ON inventory_items(status, updated_at);
CREATE INDEX idx_inventory_adjustments_inventory_item ON inventory_adjustments(inventory_item_id, created_at);
