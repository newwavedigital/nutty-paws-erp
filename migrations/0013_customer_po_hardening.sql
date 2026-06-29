PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS purchase_order_change_requests (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('change', 'cancel')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  requested_by_user_id TEXT,
  resolved_by_user_id TEXT,
  resolution_note TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_po_change_requests_po ON purchase_order_change_requests(purchase_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_po_change_requests_status ON purchase_order_change_requests(status, created_at);
