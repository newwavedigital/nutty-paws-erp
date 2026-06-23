-- Sprint A8: missing browser-only modules become D1-backed.
-- Additive only; no existing tables are dropped or rewritten.

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'supplier',
  kind TEXT NOT NULL DEFAULT 'supplier',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE supplier_product_lines (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT,
  price_per_unit_cents INTEGER,
  unit_of_measure TEXT,
  moq TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE content_library_entries (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'content_library',
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'file')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE team_chat_entries (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'team_chat',
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'message')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE food_safety_records (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'food_safety',
  kind TEXT NOT NULL CHECK (kind IN ('complaint', 'sanitation', 'swab', 'ccp', 'ncr', 'recall')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE machinery_records (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'machinery',
  kind TEXT NOT NULL CHECK (kind IN ('maintenance', 'issue')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE feedback_items (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'feedback',
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'feature', 'general')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  file_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_suppliers_status ON suppliers(status, updated_at);
CREATE INDEX idx_suppliers_kind_status ON suppliers(kind, status);
CREATE INDEX idx_supplier_product_lines_supplier_id ON supplier_product_lines(supplier_id);

CREATE INDEX idx_content_library_entries_kind_status ON content_library_entries(kind, status);
CREATE INDEX idx_content_library_entries_status ON content_library_entries(status, updated_at);

CREATE INDEX idx_team_chat_entries_kind_status ON team_chat_entries(kind, status);
CREATE INDEX idx_team_chat_entries_status ON team_chat_entries(status, updated_at);

CREATE INDEX idx_food_safety_records_kind_status ON food_safety_records(kind, status);
CREATE INDEX idx_food_safety_records_status ON food_safety_records(status, updated_at);

CREATE INDEX idx_machinery_records_kind_status ON machinery_records(kind, status);
CREATE INDEX idx_machinery_records_status ON machinery_records(status, updated_at);

CREATE INDEX idx_feedback_items_kind_status ON feedback_items(kind, status);
CREATE INDEX idx_feedback_items_status ON feedback_items(status, updated_at);
