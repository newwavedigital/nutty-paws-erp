import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A10 frontend authority cleanup", () => {
  test("keeps the mirrored frontend files byte-for-byte aligned", () => {
    expect(createHash("sha256").update(publicHtml).digest("hex")).toBe(
      createHash("sha256").update(rootHtml).digest("hex"),
    );
  });

  test("boots from an empty backend-ready state instead of browser-seeded sample data", () => {
    expect(rootHtml).toContain("function createEmptyAppState");
    expect(rootHtml).toContain("const fresh = createEmptyAppState()");
    expect(rootHtml).not.toContain("const fresh = JSON.parse(JSON.stringify(SAMPLE_DATA))");
    expect(rootHtml).not.toContain("SAMPLE_DATA.ingredients");
    expect(rootHtml).not.toContain("SAMPLE_DATA[k]");
  });

  test("uses backend snapshots instead of preserving local-only rows during backend refresh", () => {
    expect(rootHtml).toContain("function mapBackendSnapshot");
    expect(rootHtml).not.toContain("function mergeByBackendId");
    expect(rootHtml).not.toContain("...localRows.filter(row => !row._backendId");
  });

  test("defines data-record API helpers for the six A8 modules", () => {
    for (const marker of [
      "const A10_DATA_RECORD_MODULES",
      "async function refreshA10DataRecordModule",
      "async function saveA10DataRecord",
      "async function archiveA10DataRecord",
      "hydrateA10DataRecordCaches",
    ]) {
      expect(rootHtml).toContain(marker);
    }

    for (const path of [
      "/api/suppliers",
      "/api/content-library",
      "/api/team-chat",
      "/api/food-safety",
      "/api/machinery",
      "/api/feedback",
    ]) {
      expect(rootHtml).toContain(path);
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
      expect(rootHtml).toContain(marker);
    }
  });
});
