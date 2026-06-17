PRAGMA foreign_keys = ON;

ALTER TABLE file_metadata
ADD COLUMN file_category TEXT NOT NULL DEFAULT 'po_file' CHECK (
  file_category IN (
    'po_file',
    'coa',
    'shipment_document',
    'customer_spec_sheet',
    'co_packing_agreement'
  )
);

ALTER TABLE file_metadata
ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'));

ALTER TABLE file_metadata
ADD COLUMN deleted_at TEXT;

ALTER TABLE file_metadata
ADD COLUMN deleted_by_user_id TEXT;

CREATE INDEX idx_file_metadata_active_owner
  ON file_metadata(owner_type, owner_id, status, created_at);

CREATE INDEX idx_file_metadata_status
  ON file_metadata(status, deleted_at);
