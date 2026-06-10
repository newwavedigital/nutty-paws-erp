import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "migrations/0001_phase_2a_baseline.sql";
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
      d1Execute(persistDir, ["--file", migrationPath]);

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
        "inventory_movements",
        "inventory_reservations",
        "master_items",
        "products",
        "purchase_order_lines",
        "purchase_order_status_events",
        "purchase_orders",
        "rd_request_comments",
        "rd_request_notes",
        "rd_requests",
        "roles",
        "sessions",
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
    } finally {
      rmSync(persistDir, { force: true, recursive: true });
    }
  });
});
