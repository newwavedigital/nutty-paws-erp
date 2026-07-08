import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

const repoRoot = resolve(__dirname, "..");
const procurementModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "procurement", "index.js"), "utf8");
const purchaseOrdersModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "purchase-orders", "index.js"), "utf8");
const pickPackModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "pick-pack", "index.js"), "utf8");
const productionModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "production", "index.js"), "utf8");
const foodSafetyModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "food-safety", "index.js"), "utf8");
const shippingRoutes = readFileSync(resolve(repoRoot, "src", "shipping", "routes.ts"), "utf8");
const qualityRoutes = readFileSync(resolve(repoRoot, "src", "quality", "routes.ts"), "utf8");
const pickPackRoutes = readFileSync(resolve(repoRoot, "src", "pick-pack", "routes.ts"), "utf8");
const productionRoutes = readFileSync(resolve(repoRoot, "src", "production", "routes.ts"), "utf8");

describe("Stage 4 locked actions and role/page access", () => {
  test("keeps Sales away from backend routes guarded to Production/Warehousing", () => {
    for (const routeSource of [shippingRoutes, qualityRoutes, pickPackRoutes, productionRoutes]) {
      expect(routeSource).toContain('requireAnyRole(auth, ["Production", "Warehousing"])');
    }

    expect(publicApp).toContain("Sales: new Set(['dashboard', 'customers', 'purchase-orders', 'products', 'feedback'])");
    expect(publicApp).not.toContain("Sales: new Set(['dashboard', 'customers', 'purchase-orders', 'products', 'shipping', 'feedback'])");
    expect(publicApp).toContain("Warehousing: new Set(['dashboard', 'inventory', 'shipping', 'pick-pack', 'quality-assurance', 'production', 'feedback'])");
    expect(publicApp).toContain("Production: new Set(['dashboard', 'production', 'food-safety', 'quality-assurance', 'pick-pack', 'inventory', 'feedback'])");
  });

  test("drops stale local purchase-order and pick-pack rows from signed-in backend sessions", () => {
    expect(publicApp).toContain("function backendBackedRowsOnly");
    expect(publicApp).toContain("return backendAuthSessionActive() ? rows.filter(row => row._backendId) : rows;");
    expect(publicApp).toContain("function removeLocalOnlyPurchaseOrdersForBackendSession");
    expect(publicApp).toContain("function removeLocalOnlyPickPackOrdersForBackendSession");
    expect(purchaseOrdersModule).not.toContain("_localOnlyBackendStale");
    expect(purchaseOrdersModule).not.toContain("Local draft");
    expect(purchaseOrdersModule).not.toContain("Backend session active; local-only rows cannot be edited or cancelled");
    expect(purchaseOrdersModule).toContain("Purchase order cancellation requires backend confirmation. Nothing was saved locally.");

    expect(pickPackModule).not.toContain("_localOnlyBackendStale");
    expect(pickPackModule).not.toContain("Local draft");
    expect(pickPackModule).not.toContain("Backend session active; local-only rows cannot be edited, picked, or cancelled");
    expect(pickPackModule).toContain("Pick & Pack PO cancellation requires backend confirmation. Nothing was saved locally.");
  });

  test("keeps received procurement rows and backend production/food-safety records locked", () => {
    expect(procurementModule).toContain("Received procurement POs are locked from cancellation");
    expect(procurementModule).not.toContain("onclick=\"deleteProc('${p.id}')\">Delete</button>\n              </td>");
    expect(procurementModule).toContain("Procurement PO cancellation requires backend confirmation. Nothing was saved locally.");

    expect(productionModule).toContain("Production Log entries are backend-immutable after finalization.");
    expect(productionModule).toContain("Production log delete requires backend archive support. Nothing was saved locally.");
    expect(productionModule).toContain("Production value edits require backend correction support. Nothing was saved locally.");
    expect(foodSafetyModule).toContain("Lot Tracking is read-only for signed-in sessions.");
    expect(foodSafetyModule).toContain("create, edit, and delete controls are disabled until that exists.");
  });
});
