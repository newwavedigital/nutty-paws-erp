PRAGMA foreign_keys = OFF;

CREATE TABLE purchase_orders_sprint_8 (
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
      'shipping',
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
  qa_released_at TEXT,
  qa_released_by_user_id TEXT,
  qa_release_type TEXT CHECK (qa_release_type IN ('internal_own_brand', 'external_co_pack')),
  qa_notes TEXT,
  qa_skipped_at TEXT,
  qa_skipped_by_user_id TEXT,
  qa_skip_reason TEXT,
  post_shipment_coa_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (qa_released_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (qa_skipped_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (post_shipment_coa_file_id) REFERENCES file_metadata(id) ON DELETE SET NULL
);

INSERT INTO purchase_orders_sprint_8 (
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
  qa_released_at,
  qa_released_by_user_id,
  qa_release_type,
  qa_notes,
  qa_skipped_at,
  qa_skipped_by_user_id,
  qa_skip_reason,
  post_shipment_coa_file_id,
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
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at
FROM purchase_orders;

DROP TABLE purchase_orders;
ALTER TABLE purchase_orders_sprint_8 RENAME TO purchase_orders;

CREATE INDEX idx_purchase_orders_customer_id ON purchase_orders(customer_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_post_shipment_coa_file_id ON purchase_orders(post_shipment_coa_file_id);

PRAGMA foreign_keys = ON;
