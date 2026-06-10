PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('employee', 'customer')),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_user_access (
  customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'viewer' CHECK (access_level IN ('viewer', 'manager')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, user_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE master_items (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('raw_material', 'packaging', 'finished_good', 'other')),
  unit_of_measure TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_orders (
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

CREATE TABLE purchase_order_lines (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  product_id TEXT,
  master_item_id TEXT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_of_measure TEXT NOT NULL,
  unit_price_cents INTEGER CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),
  supply_chain_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    supply_chain_status IN ('pending', 'available', 'needs_ordering', 'blocked')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (purchase_order_id, line_number),
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE SET NULL
);

CREATE TABLE purchase_order_status_events (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  master_item_id TEXT NOT NULL UNIQUE,
  on_hand_quantity REAL NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  allocated_quantity REAL NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  reorder_point_quantity REAL NOT NULL DEFAULT 0 CHECK (reorder_point_quantity >= 0),
  unit_of_measure TEXT NOT NULL,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (allocated_quantity <= on_hand_quantity),
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE
);

CREATE TABLE inventory_reservations (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL,
  purchase_order_line_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'cancelled', 'consumed')),
  reserved_by_user_id TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (inventory_item_id, purchase_order_line_id),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (reserved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('received', 'adjusted', 'reserved', 'released', 'consumed')
  ),
  quantity_delta REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE rd_requests (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'queue' CHECK (status IN ('queue', 'completed')),
  packaging_type TEXT,
  units_requested REAL CHECK (units_requested IS NULL OR units_requested > 0),
  product_description TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE rd_request_notes (
  id TEXT PRIMARY KEY,
  rd_request_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rd_request_id) REFERENCES rd_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE rd_request_comments (
  id TEXT PRIMARY KEY,
  rd_request_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rd_request_id) REFERENCES rd_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE file_metadata (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (
    owner_type IN ('purchase_order', 'purchase_order_line', 'rd_request', 'customer', 'product')
  ),
  owner_id TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'r2_pending' CHECK (storage_provider IN ('r2_pending', 'r2')),
  storage_key TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_customer_user_access_user_id ON customer_user_access(user_id);
CREATE INDEX idx_products_customer_id ON products(customer_id);
CREATE INDEX idx_purchase_orders_customer_id ON purchase_orders(customer_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_order_lines_purchase_order_id ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_purchase_order_status_events_purchase_order_id ON purchase_order_status_events(purchase_order_id);
CREATE INDEX idx_inventory_reservations_inventory_item_id ON inventory_reservations(inventory_item_id);
CREATE INDEX idx_inventory_reservations_purchase_order_line_id ON inventory_reservations(purchase_order_line_id);
CREATE INDEX idx_inventory_movements_inventory_item_id ON inventory_movements(inventory_item_id);
CREATE INDEX idx_rd_requests_customer_id ON rd_requests(customer_id);
CREATE INDEX idx_rd_request_notes_request_id ON rd_request_notes(rd_request_id);
CREATE INDEX idx_rd_request_comments_request_id ON rd_request_comments(rd_request_id);
CREATE INDEX idx_file_metadata_owner ON file_metadata(owner_type, owner_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
