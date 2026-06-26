import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A10 frontend authority cleanup", () => {
  test("keeps source and deployed frontend shells aligned to the split assets", () => {
    expect(rootHtml).toContain('href="public/styles.css"');
    expect(rootHtml).toContain('src="public/app.js"');
    expect(publicHtml).toContain('href="styles.css"');
    expect(publicHtml).toContain('src="app.js"');
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
});
