import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

const requiredMarkers = [
  "const backendPickPackState",
  "function renderBackendPickPackBanner",
  "async function loadBackendPickPackOrders",
  "async function createBackendPickPackOrder",
  "async function updateBackendPickPackOrder",
  "async function markBackendPickPackPicked",
  "async function saveBackendPickPackShippingDetails",
  "async function markBackendPickPackShipped",
  "/api/pick-pack/orders",
  "/api/pick-pack/orders/${encodeURIComponent(orderId)}/mark-picked",
  "/api/pick-pack/orders/${encodeURIComponent(orderId)}/shipping",
  "/api/pick-pack/orders/${encodeURIComponent(orderId)}/mark-shipped",
  "data-backend-status=\"pick-pack\"",
  "confirmShortStock",
];

describe("Sprint 10 frontend pick pack wiring", () => {
  test("defines backend Pick & Pack state, banner, loaders, and action wrappers", () => {
    for (const marker of requiredMarkers) {
      expect(rootHtml).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 10 pick pack markers", () => {
    for (const marker of requiredMarkers) {
      expect(publicHtml).toContain(marker);
    }
  });
});
