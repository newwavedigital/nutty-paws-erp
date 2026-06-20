PRAGMA foreign_keys = OFF;

CREATE TABLE rd_requests_new (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'queue' CHECK (status IN ('queue', 'completed', 'archived')),
  packaging_type TEXT,
  units_requested REAL CHECK (units_requested IS NULL OR units_requested > 0),
  product_description TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO rd_requests_new (
  id, customer_id, status, packaging_type, units_requested, product_description,
  submitted_at, completed_at, archived_at, archived_by_user_id,
  created_by_user_id, updated_by_user_id, created_at, updated_at
)
SELECT
  id, customer_id, status, packaging_type, units_requested, product_description,
  submitted_at, completed_at, NULL, NULL,
  created_by_user_id, updated_by_user_id, created_at, updated_at
FROM rd_requests;

DROP TABLE rd_requests;
ALTER TABLE rd_requests_new RENAME TO rd_requests;

CREATE INDEX idx_rd_requests_customer_id ON rd_requests(customer_id);
CREATE INDEX idx_rd_requests_status ON rd_requests(status);

PRAGMA foreign_keys = ON;
