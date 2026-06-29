import { describe, expect, it } from "vitest";
import {
  DEFAULT_DATABASE,
  DEMO_CATALOG_PREFIX,
  buildExecutionCommand,
  demoCatalogSummary,
  generateDemoCatalogSql,
  parseArgs,
} from "../scripts/sample-demo-catalog.mjs";

describe("staging demo catalog seed generator", () => {
  it("summarizes a rich namespaced demo catalog", () => {
    const summary = demoCatalogSummary();

    expect(summary.prefix).toBe(DEMO_CATALOG_PREFIX);
    expect(summary.database).toBe(DEFAULT_DATABASE);
    expect(summary.counts).toMatchObject({
      suppliers: 12,
      supplierProductLines: 18,
      products: 20,
      masterItems: 16,
      inventoryItems: 16,
      productBomItems: 40,
    });
    expect(summary.edgeCases).toEqual(
      expect.arrayContaining([
        "low_stock",
        "zero_stock",
        "fully_allocated",
        "healthy_stock",
        "long_lead_time_supplier",
        "archived_supplier",
        "inactive_product",
      ]),
    );
  });

  it("generates additive SQL for every seeded staging table", () => {
    const sql = generateDemoCatalogSql();

    expect(sql).toContain("-- Staging demo catalog seed.");
    expect(sql).toContain("INSERT OR IGNORE INTO customers");
    expect(sql).toContain("INSERT OR IGNORE INTO suppliers");
    expect(sql).toContain("INSERT OR IGNORE INTO supplier_product_lines");
    expect(sql).toContain("INSERT OR IGNORE INTO master_items");
    expect(sql).toContain("INSERT OR IGNORE INTO inventory_items");
    expect(sql).toContain("INSERT OR IGNORE INTO products");
    expect(sql).toContain("INSERT OR IGNORE INTO product_bom_items");
    expect(sql).toContain("'demo_catalog_supplier_preferred_peanuts'");
    expect(sql).toContain("'demo_catalog_product_low_stock_crunch'");
    expect(sql).toContain("'demo_catalog_inventory_zero_stock_labels'");
    expect(sql).toContain("'Demo Catalog - Low Stock Crunch'");
    expect(sql).not.toContain("DELETE FROM");
    expect(sql).not.toContain("DROP TABLE");
  });

  it("keeps dry-run as the default and requires explicit remote execution", () => {
    expect(parseArgs([])).toMatchObject({
      database: DEFAULT_DATABASE,
      execute: false,
      remote: false,
      local: false,
    });
    expect(parseArgs(["--execute", "--remote", "--database", DEFAULT_DATABASE])).toMatchObject({
      execute: true,
      remote: true,
      database: DEFAULT_DATABASE,
    });
    expect(() => parseArgs(["--execute"])).toThrow("Use --execute with --remote or --local.");
    expect(() => parseArgs(["--remote"])).toThrow("Use --remote only with --execute.");
  });

  it("refuses production or non-staging remote database targets", () => {
    expect(() => parseArgs(["--execute", "--remote", "--database", "nut-house-portal-db"])).toThrow(
      "Remote demo catalog seeding is limited to nut-house-portal-staging-db.",
    );
    expect(() => parseArgs(["--execute", "--remote", "--database", "production"])).toThrow(
      "Remote demo catalog seeding is limited to nut-house-portal-staging-db.",
    );
  });

  it("builds the expected wrangler command without executing it", () => {
    const command = buildExecutionCommand({
      database: DEFAULT_DATABASE,
      execute: true,
      remote: true,
      local: false,
    });

    expect(command).toEqual(["wrangler", "d1", "execute", DEFAULT_DATABASE, "--file", expect.any(String), "--remote"]);
  });
});
