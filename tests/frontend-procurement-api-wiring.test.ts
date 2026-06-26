import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint 6 frontend procurement wiring", () => {
  test("defines backend procurement state, loaders, and action wrappers", () => {
    for (const marker of [
      "const backendProcurementState",
      "async function loadBackendProcurement",
      "async function loadBackendProcurementNeedToOrder",
      "async function loadBackendProcurementOrders",
      "async function saveBackendProcurementOrder",
      "async function submitBackendProcurementOrder",
      "async function receiveBackendProcurementOrder",
      "function mergeBackendProcurementOrders",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("uses Sprint 6 procurement backend endpoints", () => {
    for (const marker of [
      "/api/procurement/need-to-order",
      "/api/procurement/orders",
      "/api/procurement/orders/${encodeURIComponent(id)}/submit",
      "/api/procurement/orders/${encodeURIComponent(id)}/receive",
      "data-backend-status=\"procurement\"",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 6 procurement markers", () => {
    for (const marker of [
      "const backendProcurementState",
      "async function loadBackendProcurement",
      "async function saveBackendProcurementOrder",
      "async function receiveBackendProcurementOrder",
      "/api/procurement/need-to-order",
      "data-backend-status=\"procurement\"",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
