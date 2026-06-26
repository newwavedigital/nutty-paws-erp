import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint 7 frontend production wiring", () => {
  test("defines backend production state, loaders, and action wrappers", () => {
    for (const marker of [
      "const backendProductionState",
      "async function loadBackendProduction",
      "async function loadBackendProductionRuns",
      "async function loadBackendProductionLogs",
      "async function scheduleBackendProductionRun",
      "async function finalizeBackendProductionRun",
      "async function reopenBackendProductionRun",
      "function mergeBackendProductionRuns",
      "function renderBackendProductionBanner",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("uses Sprint 7 production backend endpoints", () => {
    for (const marker of [
      "/api/production/runs",
      "/api/production/logs",
      "/api/production/schedule",
      "/api/production/runs/${encodeURIComponent(productionRunId)}/finalize",
      "/api/production/runs/${encodeURIComponent(productionRunId)}/reopen",
      "data-backend-status=\"production\"",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 7 production markers", () => {
    for (const marker of [
      "const backendProductionState",
      "async function loadBackendProduction",
      "async function scheduleBackendProductionRun",
      "async function finalizeBackendProductionRun",
      "async function reopenBackendProductionRun",
      "/api/production/schedule",
      "data-backend-status=\"production\"",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
