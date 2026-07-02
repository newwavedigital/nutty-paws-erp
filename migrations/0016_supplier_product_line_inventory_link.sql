-- Supplier product lines become inventory-linked domain records.
-- Local migration only until General approves applying it to shared D1 environments.

ALTER TABLE supplier_product_lines ADD COLUMN inventory_item_id TEXT REFERENCES inventory_items(id);

CREATE INDEX idx_supplier_product_lines_inventory_item_id
  ON supplier_product_lines(inventory_item_id);
