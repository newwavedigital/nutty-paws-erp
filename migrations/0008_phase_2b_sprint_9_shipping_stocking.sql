PRAGMA foreign_keys = ON;

ALTER TABLE purchase_orders ADD COLUMN shipped_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN shipped_by_user_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN stocked_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN stocked_by_user_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN shipping_notes TEXT;
ALTER TABLE purchase_orders ADD COLUMN shipment_document_file_id TEXT;

CREATE TABLE shipping_details (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL UNIQUE,
  bol_number TEXT,
  pro_number TEXT,
  carrier TEXT,
  freight_class TEXT,
  notes TEXT,
  pallet_list_json TEXT,
  shipment_document_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (shipment_document_file_id) REFERENCES file_metadata(id) ON DELETE SET NULL
);

CREATE TABLE shipping_logs (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL UNIQUE,
  shipping_log_number TEXT NOT NULL UNIQUE,
  shipped_at TEXT,
  stocked_at TEXT,
  carrier TEXT,
  bol_number TEXT,
  pro_number TEXT,
  pallet_list_json TEXT,
  weight REAL CHECK (weight IS NULL OR weight >= 0),
  items_snapshot_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_purchase_orders_shipped_at ON purchase_orders(shipped_at);
CREATE INDEX idx_purchase_orders_stocked_at ON purchase_orders(stocked_at);
CREATE INDEX idx_purchase_orders_shipment_document_file_id ON purchase_orders(shipment_document_file_id);
CREATE INDEX idx_shipping_details_purchase_order_id ON shipping_details(purchase_order_id);
CREATE INDEX idx_shipping_details_shipment_document_file_id ON shipping_details(shipment_document_file_id);
CREATE INDEX idx_shipping_logs_purchase_order_id ON shipping_logs(purchase_order_id);
CREATE INDEX idx_shipping_logs_shipped_at ON shipping_logs(shipped_at);
