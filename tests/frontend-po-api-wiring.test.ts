import { frontendText } from "./frontend-assets";
﻿import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");

describe("frontend purchase-order API wiring", () => {
  test("defines a lightweight API envelope client and backend status banner", () => {
    expect(frontendText).toContain("async function apiRequest");
    expect(frontendText).toContain("function renderBackendStatusBanner");
    expect(frontendText).toContain("Backend connected");
    expect(frontendText).toContain("Offline preview");
  });

  test("uses the purchase-order API endpoints for list/create/read/update and workflow commands", () => {
    expect(frontendText).toContain("/api/purchase-orders");
    expect(frontendText).toContain("/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}");
    expect(frontendText).toContain("/submit");
    expect(frontendText).toContain("/supply-chain-review");
    expect(frontendText).toContain("/deposit-status");
    expect(frontendText).toContain("/approve-for-production");
  });

  test("maps backend PO records into the existing prototype shape without requiring a redesign", () => {
    expect(frontendText).toContain("function mergeBackendPurchaseOrders");
    expect(frontendText).toContain("requestedShipDate");
    expect(frontendText).toContain("requestedDate");
    expect(frontendText).toContain("supply_chain_status");
  });

  test("includes auth and Account Management backend wiring without local-only user creation", () => {
    expect(frontendText).toContain("const AUTH_STORAGE_KEY");
    expect(frontendText).toContain("function authHeaders");
    expect(frontendText).toContain("Authorization");
    expect(frontendText).toContain("Bearer ${backendAuthState.token}");
    expect(frontendText).toContain("/api/auth/setup-status");
    expect(frontendText).toContain("/api/auth/setup");
    expect(frontendText).toContain("/api/auth/login");
    expect(frontendText).toContain("/api/auth/me");
    expect(frontendText).toContain("/api/users");
    expect(frontendText).toContain("function canManageBackendUsers");
    expect(frontendText).toContain("Customer backend session active; admin user list is hidden.");
    expect(frontendText).toContain("data-auth-panel");
    expect(frontendText).toContain("Create the first admin or log in as backend Admin before adding users");
    expect(frontendText).toContain("Backend user save failed. The account was not created");
  });

  test("includes Sprint 2 customer portal and PO file API wiring", () => {
    expect(frontendText).toContain("async function apiFormRequest");
    expect(frontendText).toContain("async function uploadBackendPurchaseOrderFile");
    expect(frontendText).toContain("async function downloadBackendFile");
    expect(frontendText).toContain("async function loadBackendPurchaseOrderFiles");
    expect(frontendText).toContain("/api/files?ownerType=purchase_order");
    expect(frontendText).toContain("Customer Portal");
    expect(frontendText).toContain("Backend connected");
    expect(frontendText).toContain("portal-card-list");
    expect(frontendText).toContain("Customer PO #");
    expect(frontendText).toContain("Line description");
    expect(frontendText).toContain("Unit of measure");
  });
});
