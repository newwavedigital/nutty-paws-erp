import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  "migrations/0010_phase_2b_sprint_11_research_workflow.sql",
  "migrations/0011_phase_2b_data_architecture_missing_modules.sql",
  "migrations/0012_phase_2b_a10_file_metadata_scope.sql",
  "migrations/0013_customer_po_hardening.sql",
  "migrations/0014_inventory_receiving_move_corrections.sql",
  "migrations/0015_inventory_archive_adjustment_hardening.sql",
  "migrations/0016_supplier_product_line_inventory_link.sql",
  "migrations/0017_supplier_import_title_guard.sql",
];
const wranglerCliPath = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
const stagingDatabaseName = "nut-house-portal-staging-db";

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
      stagingDatabaseName,
      "--env",
      "staging",
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
      const combinedMigrationPath = join(persistDir, "ordered-migrations.sql");
      writeFileSync(
        combinedMigrationPath,
        migrationPaths.map((migrationPath) => readFileSync(join(process.cwd(), migrationPath), "utf8")).join("\n\n"),
        "utf8",
      );
      d1Execute(persistDir, ["--file", combinedMigrationPath]);

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
        "content_library_entries",
        "customer_user_access",
        "customers",
        "feedback_items",
        "file_metadata",
        "food_safety_records",
        "inventory_adjustments",
        "inventory_items",
        "inventory_lots",
        "inventory_movements",
        "inventory_reservations",
        "machinery_records",
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
        "purchase_order_change_requests",
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
        "supplier_product_lines",
        "suppliers",
        "team_chat_entries",
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
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "archived_at" }),
          expect.objectContaining({ name: "archived_by_user_id" }),
        ]),
      );

      const masterItemArchiveColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('master_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(masterItemArchiveColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "archived_at" }),
          expect.objectContaining({ name: "archived_by_user_id" }),
        ]),
      );

      const inventoryAdjustmentColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('inventory_adjustments');",
      ]).flatMap((result) => result.results ?? []);

      expect(inventoryAdjustmentColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "inventory_item_id", notnull: 1 }),
          expect.objectContaining({ name: "quantity_before", notnull: 1 }),
          expect.objectContaining({ name: "quantity_after", notnull: 1 }),
          expect.objectContaining({ name: "quantity_delta", notnull: 1 }),
          expect.objectContaining({ name: "reason", notnull: 1 }),
          expect.objectContaining({ name: "lots_before_json" }),
          expect.objectContaining({ name: "lots_after_json" }),
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

      const a10FileScopeInsert = d1Execute(persistDir, [
        "--command",
        `
          INSERT INTO file_metadata (
            id,
            owner_type,
            owner_id,
            file_category,
            storage_provider,
            storage_key,
            file_name,
            content_type,
            size_bytes,
            status
          )
          VALUES (
            'file-schema-a10-supplier',
            'supplier',
            'supplier-schema',
            'supplier_document',
            'r2',
            'files/supplier/supplier-schema/supplier_document/schema.txt',
            'schema.txt',
            'text/plain',
            1,
            'active'
          );
          SELECT owner_type, file_category
          FROM file_metadata
          WHERE id = 'file-schema-a10-supplier';
        `,
      ]);

      expect(a10FileScopeInsert.at(-1)?.results).toContainEqual(
        expect.objectContaining({ owner_type: "supplier", file_category: "supplier_document" }),
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
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "archived_at" }),
          expect.objectContaining({ name: "archived_by_user_id" }),
          expect.objectContaining({ name: "updated_by_user_id" }),
          expect.objectContaining({ name: "stock_applied_quantity", notnull: 1 }),
          expect.objectContaining({ name: "stock_applied_inventory_item_id" }),
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
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "archived_at" }),
          expect.objectContaining({ name: "archived_by_user_id" }),
          expect.objectContaining({ name: "updated_by_user_id" }),
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

      const researchColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('rd_requests');",
      ]).flatMap((result) => result.results ?? []);

      expect(researchColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "customer_id" }),
          expect.objectContaining({ name: "status", notnull: 1 }),
          expect.objectContaining({ name: "packaging_type" }),
          expect.objectContaining({ name: "units_requested" }),
          expect.objectContaining({ name: "product_description", notnull: 1 }),
          expect.objectContaining({ name: "submitted_at" }),
          expect.objectContaining({ name: "completed_at" }),
          expect.objectContaining({ name: "archived_at" }),
          expect.objectContaining({ name: "archived_by_user_id" }),
        ]),
      );

      const researchIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('rd_requests');",
      ]).flatMap((result) => result.results ?? []);

      expect(researchIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_rd_requests_customer_id" }),
          expect.objectContaining({ name: "idx_rd_requests_status" }),
        ]),
      );

      const sprintA8Tables = [
        "suppliers",
        "content_library_entries",
        "team_chat_entries",
        "food_safety_records",
        "machinery_records",
        "feedback_items",
      ];

      for (const table of sprintA8Tables) {
        const columns = d1Execute(persistDir, [
          "--command",
          `PRAGMA table_info('${table}');`,
        ]).flatMap((result) => result.results ?? []);

        expect(columns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "module", notnull: 1 }),
            expect.objectContaining({ name: "kind", notnull: 1 }),
            expect.objectContaining({ name: "title", notnull: 1 }),
            expect.objectContaining({ name: "status", notnull: 1 }),
            expect.objectContaining({ name: "payload_json", notnull: 1 }),
            expect.objectContaining({ name: "file_ids_json", notnull: 1 }),
          ]),
        );
      }

      const supplierLineColumns = d1Execute(persistDir, [
        "--command",
        "PRAGMA table_info('supplier_product_lines');",
      ]).flatMap((result) => result.results ?? []);

      expect(supplierLineColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "supplier_id", notnull: 1 }),
          expect.objectContaining({ name: "inventory_item_id" }),
          expect.objectContaining({ name: "product_name", notnull: 1 }),
        ]),
      );

      const supplierLineIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('supplier_product_lines');",
      ]).flatMap((result) => result.results ?? []);

      expect(supplierLineIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_supplier_product_lines_inventory_item_id" }),
        ]),
      );

      const supplierIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('suppliers');",
      ]).flatMap((result) => result.results ?? []);

      expect(supplierIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_suppliers_title_trim_lower_unique", unique: 1, partial: 1 }),
        ]),
      );

      d1Execute(persistDir, [
        "--command",
        "INSERT INTO suppliers (id, title, status) VALUES ('supplier-archived-1', ' Acme Inc ', 'archived');",
      ]);
      d1Execute(persistDir, [
        "--command",
        "INSERT INTO suppliers (id, title, status) VALUES ('supplier-archived-2', 'acme inc', 'archived');",
      ]);
      d1Execute(persistDir, [
        "--command",
        "INSERT INTO suppliers (id, title, status) VALUES ('supplier-normalized-1', ' ACME INC ', 'active');",
      ]);
      expect(() =>
        d1Execute(persistDir, [
          "--command",
          "INSERT INTO suppliers (id, title, status) VALUES ('supplier-normalized-2', 'acme inc', 'active');",
        ]),
      ).toThrow();
      expect(() =>
        d1Execute(persistDir, [
          "--command",
          "UPDATE suppliers SET status = 'active' WHERE id = 'supplier-archived-1';",
        ]),
      ).toThrow();
      d1Execute(persistDir, [
        "--command",
        "UPDATE suppliers SET status = 'archived' WHERE id = 'supplier-normalized-1';",
      ]);
      d1Execute(persistDir, [
        "--command",
        "UPDATE suppliers SET status = 'active' WHERE id = 'supplier-archived-1';",
      ]);
      d1Execute(persistDir, [
        "--command",
        "INSERT INTO suppliers (id, title) VALUES ('supplier-punctuation-distinct', 'Acme Inc.');",
      ]);

      const feedbackIndexes = d1Execute(persistDir, [
        "--command",
        "PRAGMA index_list('feedback_items');",
      ]).flatMap((result) => result.results ?? []);

      expect(feedbackIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "idx_feedback_items_kind_status" }),
          expect.objectContaining({ name: "idx_feedback_items_status" }),
        ]),
      );
    } finally {
      rmSync(persistDir, { force: true, recursive: true });
    }
  }, 120000);
});
