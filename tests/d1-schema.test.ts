import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "migrations/0001_phase_2a_baseline.sql",
  "migrations/0002_phase_2b_file_foundation.sql",
  "migrations/0003_phase_2b_sprint_4_supply_chain.sql",
  "migrations/0004_phase_2b_sprint_5_inventory_foundations.sql",
  "migrations/0005_phase_2b_sprint_6_procurement_automation.sql",
  "migrations/0006_phase_2b_sprint_7_production_schedule.sql",
  "migrations/0007_phase_2b_sprint_8_quality_assurance.sql",
  "migrations/0008_phase_2b_sprint_9_shipping_stocking.sql",
  "migrations/0009_phase_2b_sprint_10_pick_pack.sql",
];
const wranglerCliPath = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");

type D1JsonResult = {
  results?: Array<Record<string, unknown>>;
  success: boolean;
};

function d1Execute(persistDir: string, args: string[]) {
  const stdout = execFileSync(
    process.execPath,
    [
      wranglerCliPath,
      "d1",
      "execute",
      "nut-house-portal-db",
      "--local",
      "--persist-to",
      persistDir,
      "--json",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return JSON.parse(stdout) as D1JsonResult[];
}

describe("Phase 2A D1 baseline schema migration", () => {
  it("applies locally and creates the backend foundation tables", () => {
    const persistDir = mkdtempSync(join(tmpdir(), "nut-house-d1-"));

    try {
      for (const migrationPath of migrationPaths) {
        d1Execute(persistDir, ["--file", migrationPath]);
      }

      const tableResult = d1Execute(persistDir, [
        "--command",
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_cf_%'
          ORDER BY name;
        `,
      ]);

      const tableNames = tableResult.flatMap((result) =>
        (result.results ?? []).map((row) => row.name),
      );

      expect(tableNames).toEqual([
        "audit_events",
        "customer_user_access",
        "customers",
        "file_metadata",
        "inventory_items",
        "inventory_lots",
        "inventory_movements",
        "inventory_reservations",
        "master_items",
        "move_entries",
        "pick_pack_order_lines",
        "pick_pack_orders",
        "pick_pack_shipping_details",
        "procurement_order_lines",
        "procurement_orders",
        "procurement_receipt_lines",
        "procurement_receipts",
        "product_bom_items",
        "production_inventory_effects",
        "production_logs",
        "production_run_lines",
        "production_run_materials",
        "production_runs",
        "products",
        "purchase_order_lines",
        "purchase_order_status_events",
        "purchase_orders",
        "rd_request_comments",
        "rd_request_notes",
        "rd_requests",
        "receiving_entries",
        "roles",
        "sessions",
        "shipping_details",
        "shipping_logs",
        "user_roles",
        "users",
      ]);

      const purchaseOrderIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('purchase_orders');",
      ]).flatMap((result) => result.results ?? []);

      expect(purchaseOrderIndexes).toContainEqual(
        expect.objectContaining({ unique: 1, origin: "u" }),
      );

      const inventoryColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('inventory_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(inventoryColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "on_hand_quantity", notnull: 1 }),
          expect.objectContaining({ name: "allocated_quantity", notnull: 1 }),
        ]),
      );

      const fileColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('file_metadata');",
      ]).flatMap((result) => result.results ?? []);

      expect(fileColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "file_category", notnull: 1 }),
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "deleted_at" }),
          expect.objectContaining({ name: "deleted_by_user_id" }),
        ]),
      );

      const fileIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('file_metadata');",
      ]).flatMap((result) => result.results ?? []);

      expect(fileIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_file_metadata_active_owner" }),
          expect.objectContaining({ name: "idx_file_metadata_status" }),
        ]),
      );

      const bomColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('product_bom_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(bomColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "product_id", notnull: 1 }),
          expect.objectContaining({ name: "master_item_id", notnull: 1 }),
          expect.objectContaining({ name: "quantity_per_unit", notnull: 1 }),
          expect.objectContaining({ name: "percent_of_formula" }),
        ]),
      );

      const bomIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('product_bom_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(bomIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_product_bom_items_product_id" }),
          expect.objectContaining({ name: "idx_product_bom_items_master_item_id" }),
        ]),
      );

      const productColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('products');",
      ]).flatMap((result) => result.results ?? []);

      expect(productColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "production_room" }),
          expect.objectContaining({ name: "case_quantity" }),
          expect.objectContaining({ name: "unit_price_cents" }),
          expect.objectContaining({ name: "daily_production_rate" }),
        ]),
      );

      const masterItemColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('master_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(masterItemColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "customer_id", notnull: 1 }),
          expect.objectContaining({ name: "allergens_json", notnull: 1 }),
        ]),
      );

      const receivingColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('receiving_entries');",
      ]).flatMap((result) => result.results ?? []);

      expect(receivingColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "receiving_id", notnull: 1 }),
          expect.objectContaining({ name: "total_quantity", notnull: 1 }),
        ]),
      );

      const moveColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('move_entries');",
      ]).flatMap((result) => result.results ?? []);

      expect(moveColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "move_id", notnull: 1 }),
          expect.objectContaining({ name: "receiving_id", notnull: 1 }),
          expect.objectContaining({ name: "quantity_moved", notnull: 1 }),
        ]),
      );

      const procurementOrderColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('procurement_orders');",
      ]).flatMap((result) => result.results ?? []);

      expect(procurementOrderColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "procurement_order_number", notnull: 1 }),
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "supplier_id" }),
        ]),
      );

      const procurementLineColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('procurement_order_lines');",
      ]).flatMap((result) => result.results ?? []);

      expect(procurementLineColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "quantity_ordered", notnull: 1 }),
          expect.objectContaining({ name: "quantity_received", notnull: 1 }),
          expect.objectContaining({ name: "source_reason", notnull: 1 }),
        ]),
      );

      const productionRunColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('production_runs');",
      ]).flatMap((result) => result.results ?? []);

      expect(productionRunColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "purchase_order_id", notnull: 1 }),
          expect.objectContaining({ name: "production_date", notnull: 1 }),
          expect.objectContaining({ name: "production_end_date", notnull: 1 }),
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "correction_count", notnull: 1 }),
        ]),
      );

      const productionRunIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('production_runs');",
      ]).flatMap((result) => result.results ?? []);

      expect(productionRunIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unique: 1, origin: "u" }),
        ]),
      );

      const productionLogIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('production_logs');",
      ]).flatMap((result) => result.results ?? []);

      expect(productionLogIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unique: 1, origin: "u" }),
        ]),
      );

      const productionStatusInsert = d1Execute(persistDir, [
        "--command",
        `
          INSERT INTO customers (id, name) VALUES ('customer-schema', 'Schema Customer');
          INSERT INTO purchase_orders (id, po_number, customer_id, status)
          VALUES ('po-schema-qa', 'PO-SCHEMA-QA', 'customer-schema', 'qa_review');
          SELECT status FROM purchase_orders WHERE id = 'po-schema-qa';
        `,
      ]);

      expect(productionStatusInsert.at(-1)?.results).toContainEqual(
        expect.objectContaining({ status: "qa_review" }),
      );

      const qaColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('purchase_orders');",
      ]).flatMap((result) => result.results ?? []);

      expect(qaColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "qa_released_at" }),
          expect.objectContaining({ name: "qa_released_by_user_id" }),
          expect.objectContaining({ name: "qa_release_type" }),
          expect.objectContaining({ name: "qa_notes" }),
          expect.objectContaining({ name: "qa_skipped_at" }),
          expect.objectContaining({ name: "qa_skipped_by_user_id" }),
          expect.objectContaining({ name: "qa_skip_reason" }),
          expect.objectContaining({ name: "post_shipment_coa_file_id" }),
          expect.objectContaining({ name: "shipped_at" }),
          expect.objectContaining({ name: "shipped_by_user_id" }),
          expect.objectContaining({ name: "stocked_at" }),
          expect.objectContaining({ name: "stocked_by_user_id" }),
          expect.objectContaining({ name: "shipping_notes" }),
          expect.objectContaining({ name: "shipment_document_file_id" }),
        ]),
      );

      const shippingDetailsColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('shipping_details');",
      ]).flatMap((result) => result.results ?? []);

      expect(shippingDetailsColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "purchase_order_id", notnull: 1 }),
          expect.objectContaining({ name: "bol_number" }),
          expect.objectContaining({ name: "carrier" }),
          expect.objectContaining({ name: "shipment_document_file_id" }),
        ]),
      );

      const shippingLogIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('shipping_logs');",
      ]).flatMap((result) => result.results ?? []);

      expect(shippingLogIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unique: 1, origin: "u" }),
        ]),
      );

      const shippingInsert = d1Execute(persistDir, [
        "--command",
        `
          INSERT INTO purchase_orders (id, po_number, customer_id, status)
          VALUES ('po-schema-shipping', 'PO-SCHEMA-SHIPPING', 'customer-schema', 'shipping');
          SELECT status FROM purchase_orders WHERE id = 'po-schema-shipping';
        `,
      ]);

      expect(shippingInsert.at(-1)?.results).toContainEqual(
        expect.objectContaining({ status: "shipping" }),
      );

      const pickPackOrderColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('pick_pack_orders');",
      ]).flatMap((result) => result.results ?? []);

      expect(pickPackOrderColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "pick_pack_number", notnull: 1 }),
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "picked_at" }),
          expect.objectContaining({ name: "shipped_at" }),
          expect.objectContaining({ name: "short_stock_json", notnull: 1 }),
        ]),
      );

      const pickPackLineColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('pick_pack_order_lines');",
      ]).flatMap((result) => result.results ?? []);

      expect(pickPackLineColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "inventory_item_id", notnull: 1 }),
          expect.objectContaining({ name: "quantity", notnull: 1 }),
          expect.objectContaining({ name: "picked_quantity", notnull: 1 }),
          expect.objectContaining({ name: "short_quantity", notnull: 1 }),
        ]),
      );

      const pickPackShippingColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('pick_pack_shipping_details');",
      ]).flatMap((result) => result.results ?? []);

      expect(pickPackShippingColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "pick_pack_order_id", notnull: 1 }),
          expect.objectContaining({ name: "shipping_mode", notnull: 1 }),
          expect.objectContaining({ name: "dimensions_json", notnull: 1 }),
        ]),
      );

      const pickPackIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('pick_pack_orders');",
      ]).flatMap((result) => result.results ?? []);

      expect(pickPackIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_pick_pack_orders_status" }),
          expect.objectContaining({ name: "idx_pick_pack_orders_customer_id" }),
          expect.objectContaining({ name: "idx_pick_pack_orders_needed" }),
        ]),
      );
    } finally {
      rmSync(persistDir, { force: true, recursive: true });
    }
  }, 45000);
});
