PRAGMA foreign_keys = ON;

ALTER TABLE receiving_entries
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

ALTER TABLE receiving_entries
  ADD COLUMN archived_at TEXT;

ALTER TABLE receiving_entries
  ADD COLUMN archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE receiving_entries
  ADD COLUMN updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE receiving_entries
  ADD COLUMN stock_applied_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_applied_quantity >= 0);

ALTER TABLE receiving_entries
  ADD COLUMN stock_applied_inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL;

ALTER TABLE move_entries
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

ALTER TABLE move_entries
  ADD COLUMN archived_at TEXT;

ALTER TABLE move_entries
  ADD COLUMN archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE move_entries
  ADD COLUMN updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_receiving_entries_status ON receiving_entries(status, date, time);
CREATE INDEX idx_move_entries_status ON move_entries(status, date, time);
