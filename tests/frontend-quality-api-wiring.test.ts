import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint 8 frontend quality wiring", () => {
  test("defines backend quality state, loaders, and action wrappers", () => {
    for (const marker of [
      "const backendQualityState",
      "async function loadBackendQualityQueue",
      "async function uploadBackendQualityCoa",
      "async function releaseBackendQualityPo",
      "function qualityCoaFileId",
      "coaFileId",
      "async function skipBackendQualityPo",
      "async function attachBackendPostShipmentCoa",
      "function renderBackendQualityBanner",
    ]) {
      expect(rootHtml).toContain(marker);
    }
  });

  test("uses Sprint 8 quality backend endpoints and markers", () => {
    for (const marker of [
      "/api/quality/queue",
      "/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/release",
      "/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/skip",
      "/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/post-shipment-coa",
      "/api/files",
      "data-backend-status=\"quality\"",
    ]) {
      expect(rootHtml).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 8 quality markers", () => {
    for (const marker of [
      "const backendQualityState",
      "async function loadBackendQualityQueue",
      "async function uploadBackendQualityCoa",
      "async function releaseBackendQualityPo",
      "function qualityCoaFileId",
      "coaFileId",
      "async function skipBackendQualityPo",
      "async function attachBackendPostShipmentCoa",
      "/api/quality/queue",
      "data-backend-status=\"quality\"",
    ]) {
      expect(publicHtml).toContain(marker);
    }
  });
});
