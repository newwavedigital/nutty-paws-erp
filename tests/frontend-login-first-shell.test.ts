import { describe, expect, test } from "vitest";
import { publicApp, publicStyles } from "./frontend-assets";

describe("Login-first ERP shell and role access cleanup", () => {
  test("boots through the auth gate before any direct dashboard startup routing", () => {
    expect(publicApp).toContain("function bootstrapAuthGate()");
    expect(publicApp).toContain("/api/auth/setup-status");
    expect(publicApp).toContain("/api/auth/me");

    const startupTail = publicApp.slice(publicApp.lastIndexOf("bootstrapAuthGate();"));
    expect(startupTail).toContain("bootstrapAuthGate();");
    expect(startupTail).not.toContain("router('dashboard')");
    expect(startupTail).not.toContain('router("dashboard")');
  });

  test("keeps the approved role map and landing pages aligned", () => {
    expect(publicApp).toContain("const USER_ROLES = ['Admin', 'Sales', 'Supply Chain & Procurement', 'Warehousing', 'Production', 'Customer'];");
    expect(publicApp).toContain("const CUSTOMER_ALLOWED_PAGES = new Set(['customer-portal', 'purchase-orders', 'products', 'feedback']);");
    expect(publicApp).toContain("Admin: new Set(ALL_NAV_PAGES)");
    expect(publicApp).toContain("Sales: new Set(['dashboard', 'customers', 'purchase-orders', 'products', 'shipping', 'feedback'])");
    expect(publicApp).toContain("Supply Chain & Procurement': new Set(['dashboard', 'supply-chain', 'procurement', 'suppliers', 'inventory', 'rd', 'feedback'])");
    expect(publicApp).toContain("Warehousing: new Set(['dashboard', 'inventory', 'shipping', 'pick-pack', 'quality-assurance', 'production', 'feedback'])");
    expect(publicApp).toContain("Production: new Set(['dashboard', 'production', 'food-safety', 'quality-assurance', 'pick-pack', 'inventory', 'feedback'])");
    expect(publicApp).toContain("Customer: CUSTOMER_ALLOWED_PAGES");
    expect(publicApp).toContain("Customer: 'customer-portal'");
  });

  test("keeps partial-local banner markers on the expected pages", () => {
    expect(publicApp).toContain("const PARTIAL_LOCAL_PAGE_LIMITS = {");
    for (const marker of [
      "'customer-portal': 'Customer Portal is a protected preview. Some customer-facing records and generated notes are partial local-only until the next approved customer portal sprint.'",
      "'content-library': 'Content Library has backend file paths, but some folder/file preview records and generated notes are partial local-only.'",
      "slack: 'Team Chat is not fully implemented yet. Channel history and generated local notes are partial local-only.'",
      "'food-safety': 'Food Safety sublogs are not fully implemented yet. Swabs, complaints, sanitation, CCP/HACCP, NCR/CAPA, and mock recall notes may remain partial local-only.'",
      "machinery: 'Machinery maintenance and equipment issue logs are not fully implemented yet. Local generated entries do not represent confirmed backend persistence.'",
      "inventory: 'Inventory has backend-backed core records, but receiving-log edits, move-log edits, and generated local notes are partial local-only.'",
      "assignments: 'Assignments are not implemented yet. This placeholder is retained so scope is visible without implying a working workflow.'",
    ]) {
      expect(publicApp).toContain(marker);
    }
  });

  test("keeps the auth-gated login wall and partial-local banner CSS markers", () => {
    for (const marker of [
      "body.auth-gated",
      "body.auth-gated .sidebar",
      "body.auth-gated .main",
      ".auth-gate",
      ".auth-gate-panel",
      ".auth-gate-brand",
      ".auth-gate-form",
      ".auth-gate-actions",
      ".sidebar nav a[hidden]",
      ".sidebar nav .nav-section-label[hidden]",
      ".partial-local-banner",
      ".partial-local-banner strong",
      ".partial-local-banner span",
    ]) {
      expect(publicStyles).toContain(marker);
    }
  });
});
