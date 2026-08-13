-- Active Inventory category is authoritative for the item_type of linked
-- Master List rows. Archived Inventory rows are historical only and must not
-- classify or overwrite a Master List item.
--
-- Only an unambiguous, supported active category is eligible. The COUNT(*)
-- guard excludes NULL categories, and COUNT(DISTINCT category) excludes
-- conflicting active categories if legacy/corrupt data ever bypasses the
-- one-inventory-row constraint. Unlinked and archived-only master_items are
-- intentionally left untouched. The final comparison also makes reruns a
-- no-op once the mapped type is already present.
WITH active_inventory_categories AS (
  SELECT inv.master_item_id,
         MIN(inv.category) AS category
  FROM inventory_items inv
  WHERE inv.status = 'active'
  GROUP BY inv.master_item_id
  HAVING COUNT(*) = COUNT(inv.category)
     AND COUNT(DISTINCT inv.category) = 1
     AND MIN(inv.category) IN ('Ingredient', 'Packaging', 'Finished Good')
), mapped_master_item_types AS (
  SELECT master_item_id,
         CASE category
           WHEN 'Ingredient' THEN 'raw_material'
           WHEN 'Packaging' THEN 'packaging'
           WHEN 'Finished Good' THEN 'finished_good'
         END AS item_type
  FROM active_inventory_categories
)
UPDATE master_items
SET item_type = (
      SELECT mapped.item_type
      FROM mapped_master_item_types mapped
      WHERE mapped.master_item_id = master_items.id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT master_item_id FROM mapped_master_item_types)
  AND item_type IS NOT (
    SELECT mapped.item_type
    FROM mapped_master_item_types mapped
    WHERE mapped.master_item_id = master_items.id
  );
