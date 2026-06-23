PRAGMA foreign_keys = ON;

CREATE TABLE file_metadata_a10 (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (
    owner_type IN (
      'purchase_order',
      'purchase_order_line',
      'rd_request',
      'customer',
      'product',
      'inventory_item',
      'supplier',
      'content_library',
      'team_chat',
      'food_safety',
      'machinery',
      'feedback'
    )
  ),
  owner_id TEXT NOT NULL,
  file_category TEXT NOT NULL DEFAULT 'po_file' CHECK (
    file_category IN (
      'po_file',
      'coa',
      'shipment_document',
      'customer_spec_sheet',
      'co_packing_agreement',
      'product_image',
      'nutrition_facts',
      'inventory_coa',
      'supplier_document',
      'content_library_file',
      'chat_attachment',
      'food_safety_document',
      'machinery_document',
      'feedback_attachment'
    )
  ),
  storage_provider TEXT NOT NULL DEFAULT 'r2_pending' CHECK (storage_provider IN ('r2_pending', 'r2')),
  storage_key TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO file_metadata_a10 (
  id,
  owner_type,
  owner_id,
  file_category,
  storage_provider,
  storage_key,
  file_name,
  content_type,
  size_bytes,
  uploaded_by_user_id,
  status,
  deleted_at,
  deleted_by_user_id,
  created_at
)
SELECT
  id,
  owner_type,
  owner_id,
  file_category,
  storage_provider,
  storage_key,
  file_name,
  content_type,
  size_bytes,
  uploaded_by_user_id,
  status,
  deleted_at,
  deleted_by_user_id,
  created_at
FROM file_metadata;

DROP TABLE file_metadata;
ALTER TABLE file_metadata_a10 RENAME TO file_metadata;

CREATE INDEX idx_file_metadata_owner ON file_metadata(owner_type, owner_id);
CREATE INDEX idx_file_metadata_active_owner ON file_metadata(owner_type, owner_id, status, created_at);
CREATE INDEX idx_file_metadata_status ON file_metadata(status, deleted_at);
