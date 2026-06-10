import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");

describe("frontend purchase-order API wiring", () => {
  test("defines a lightweight API envelope client and backend status banner", () => {
    expect(html).toContain("async function apiRequest");
    expect(html).toContain("function renderBackendStatusBanner");
    expect(html).toContain("Backend connected");
    expect(html).toContain("Local demo mode / backend unavailable");
  });

  test("uses the purchase-order API endpoints for list/create/read/update and workflow commands", () => {
    expect(html).toContain("/api/purchase-orders");
    expect(html).toContain("/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}");
    expect(html).toContain("/submit");
    expect(html).toContain("/supply-chain-review");
    expect(html).toContain("/deposit-status");
    expect(html).toContain("/approve-for-production");
  });

  test("maps backend PO records into the existing prototype shape without requiring a redesign", () => {
    expect(html).toContain("function mergeBackendPurchaseOrders");
    expect(html).toContain("requestedShipDate");
    expect(html).toContain("requestedDate");
    expect(html).toContain("supply_chain_status");
  });
});
