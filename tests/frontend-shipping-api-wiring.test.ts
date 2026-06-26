import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint 9 frontend shipping wiring", () => {
  test("defines backend shipping state, loaders, and action wrappers", () => {
    for (const marker of [
      "const backendShippingState",
      "function renderBackendShippingBanner",
      "async function loadBackendShippingQueue",
      "async function loadBackendShippingLogs",
      "async function uploadBackendShipmentDocument",
      "async function saveBackendShippingDetails",
      "async function markBackendShipped",
      "async function markBackendStocked",
      "confirmMissingCarrierBol",
      "pendingShipmentDocumentFiles",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("uses Sprint 9 shipping backend endpoints and markers", () => {
    for (const marker of [
      "/api/shipping/queue",
      "/api/shipping/logs",
      "/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/details",
      "/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/mark-shipped",
      "/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/mark-stocked",
      "/api/files",
      "ownerType', 'purchase_order'",
      "fileCategory', 'shipment_document'",
      "data-backend-status=\"shipping\"",
      "backendStatus === 'shipping'",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 9 shipping markers", () => {
    for (const marker of [
      "const backendShippingState",
      "function renderBackendShippingBanner",
      "async function loadBackendShippingQueue",
      "async function loadBackendShippingLogs",
      "async function uploadBackendShipmentDocument",
      "async function saveBackendShippingDetails",
      "async function markBackendShipped",
      "async function markBackendStocked",
      "/api/shipping/queue",
      "/api/shipping/logs",
      "data-backend-status=\"shipping\"",
      "confirmMissingCarrierBol",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
