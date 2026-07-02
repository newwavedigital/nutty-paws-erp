import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");
const supplierModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "suppliers", "index.js"), "utf8");

describe("Sprint A10 frontend authority cleanup", () => {
  test("keeps source and deployed frontend shells aligned to the split assets", () => {
    expect(rootHtml).toMatch(/href="public\/dist\/styles\.[a-f0-9]{12}\.css"/);
    expect(rootHtml).toMatch(/<script src="public\/dist\/app\.[a-f0-9]{12}\.js"><\/script>/);
    expect(publicHtml).toMatch(/href="dist\/styles\.[a-f0-9]{12}\.css"/);
    expect(publicHtml).toMatch(/<script src="dist\/app\.[a-f0-9]{12}\.js"><\/script>/);
    expect(publicApp).toContain("function createEmptyAppState");
  });

  test("boots from an empty backend-ready state instead of browser-seeded sample data", () => {
    expect(publicApp).toContain("function createEmptyAppState");
    expect(publicApp).toContain("const fresh = createEmptyAppState()");
    expect(publicApp).not.toContain("const fresh = JSON.parse(JSON.stringify(SAMPLE_DATA))");
    expect(publicApp).not.toContain("SAMPLE_DATA.ingredients");
    expect(publicApp).not.toContain("SAMPLE_DATA[k]");
  });

  test("uses backend snapshots instead of preserving local-only rows during backend refresh", () => {
    expect(publicApp).toContain("function mapBackendSnapshot");
    expect(publicApp).not.toContain("function mergeByBackendId");
    expect(publicApp).not.toContain("...localRows.filter(row => !row._backendId");
  });

  test("defines data-record API helpers for the six A8 modules", () => {
    for (const marker of [
      "const A10_DATA_RECORD_MODULES",
      "async function refreshA10DataRecordModule",
      "async function saveA10DataRecord",
      "async function archiveA10DataRecord",
      "hydrateA10DataRecordCaches",
    ]) {
      expect(publicApp).toContain(marker);
    }

    for (const path of [
      "/api/suppliers",
      "/api/content-library",
      "/api/team-chat",
      "/api/food-safety",
      "/api/machinery",
      "/api/feedback",
    ]) {
      expect(publicApp).toContain(path);
    }
  });

  test("converted A10 module writes use backend-confirmed record helpers", () => {
    for (const marker of [
      "saveA10DataRecord('suppliers'",
      "archiveA10DataRecord('suppliers'",
      "saveA10DataRecord('feedback'",
      "archiveA10DataRecord('feedback'",
      "saveA10DataRecord('contentLibrary'",
      "archiveA10DataRecord('contentLibrary'",
      "saveA10DataRecord('teamChat'",
      "archiveA10DataRecord('teamChat'",
      "saveA10DataRecord('foodSafety'",
      "archiveA10DataRecord('foodSafety'",
      "saveA10DataRecord('machinery'",
      "archiveA10DataRecord('machinery'",
    ]) {
      expect(publicApp).toContain(marker);
    }
  });

  test("allows supplier product pricing to four decimal places", () => {
    expect(publicApp).toContain("function formatSupplierPricePerLb");
    expect(publicApp).toContain("Number(value || 0).toFixed(4)");
    expect(publicApp).toContain("formatSupplierPricePerLb(pl.pricePerLb)");
    expect(publicApp).toContain('step="0.0001"');
    expect(publicApp).toContain('placeholder="0.0000"');
    expect(publicApp).toContain("supplierProductChange(${i},'pricePerLb',this.value)");
  });

  test("supplier pricing assigns raw materials from existing inventory instead of free-text products", () => {
    expect(publicApp).toContain("Raw Materials / Pricing");
    expect(publicApp).toContain("+ Add Raw Material");
    expect(publicApp).toContain("<div>Raw Material</div><div>Type</div><div>Price / lb</div><div></div>");
    expect(publicApp).toContain("supplierEligibleInventoryItems()");
    expect(publicApp).toContain("state.ingredients.filter");
    expect(publicApp).toContain("item.category !== 'Finished Good'");
    expect(publicApp).toContain("item.category === 'Packaging'");
    expect(publicApp).toContain("inventoryItemId");
    expect(publicApp).toContain("supplierInventoryItemSelected(${i},this.value)");
    expect(supplierModule).not.toContain("Product name");
    expect(supplierModule).not.toContain("+ Add Product");
    expect(supplierModule).not.toContain("Products / Pricing");
  });

  test("supplier module exposes inventory and backend failures instead of dead-click fallbacks", () => {
    expect(supplierModule).toContain("function supplierInventoryUnavailableMessage");
    expect(supplierModule).toContain("backendInventoryState.status === 'error'");
    expect(supplierModule).toContain("Suppliers could not be loaded from the backend.");
    expect(supplierModule).toContain("disabled title=\"Add Ingredient or Packaging inventory first\"");
    expect(supplierModule).toContain("Missing inventory:");
    expect(supplierModule).toContain("Legacy unlinked item:");
    expect(supplierModule).toContain("Legacy unlinked");
    expect(supplierModule).toContain("Choose an existing raw material or packaging inventory item for each supplier line.");
    expect(supplierModule).not.toContain(".catch(() => {})");
    expect(supplierModule).not.toContain("f?.dataUrl || '#'");
  });

  test("supplier document links do not render inert hash downloads for pending files", () => {
    expect(supplierModule).toContain("function supplierDocumentLinkHtml");
    expect(supplierModule).toContain("Pending upload");
    expect(supplierModule).toContain("/api/files/${encodeURIComponent(file.fileId)}/download");
    expect(supplierModule).not.toContain("href=\"#\"");
  });
});
