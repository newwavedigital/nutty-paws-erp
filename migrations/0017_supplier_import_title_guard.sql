-- Bulk imports are create-only. SQLite can atomically enforce the portion of
-- the importer matching rule it understands: outside whitespace and ASCII
-- case. (The application continues to enforce Unicode NFKC matching.)
--
-- Only active Suppliers participate in importer matching. Archived duplicates
-- remain valid history, and an active Supplier may reuse an archived name.
-- Applying this migration deliberately fails only if multiple active Suppliers
-- already collide under this rule.
CREATE UNIQUE INDEX idx_suppliers_title_trim_lower_unique
  ON suppliers (lower(trim(title)))
  WHERE status = 'active';
