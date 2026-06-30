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

  test("keeps the app shell hidden until role navigation is filtered", () => {
    expect(publicApp).toContain("document.body.classList.remove('auth-pending');");
    expect(publicApp).toContain("document.body.classList.add('auth-gated');");

    const enterAuthenticatedApp = publicApp.slice(
      publicApp.indexOf("function enterAuthenticatedApp"),
      publicApp.indexOf("async function bootstrapAuthGate")
    );
    expect(enterAuthenticatedApp.indexOf("updateSidebarNavigationForRole();")).toBeGreaterThan(-1);
    expect(enterAuthenticatedApp.indexOf("showAppShell();")).toBeGreaterThan(-1);
    expect(enterAuthenticatedApp.indexOf("updateSidebarNavigationForRole();")).toBeLessThan(
      enterAuthenticatedApp.indexOf("showAppShell();")
    );
  });

  test("keeps the approved role map and landing pages aligned", () => {
    expect(publicApp).toContain("const USER_ROLES = ['Admin', 'Sales', 'Supply Chain & Procurement', 'Warehousing', 'Production', 'Customer'];");
    expect(publicApp).toContain("const CUSTOMER_ALLOWED_PAGES = new Set(['customer-portal', 'profile-settings']);");
    expect(publicApp).toContain("Admin: EMPLOYEE_NAV_PAGES");
    expect(publicApp).toContain("Sales: new Set(['dashboard', 'customers', 'purchase-orders', 'products', 'shipping', 'feedback'])");
    expect(publicApp).toContain("Supply Chain & Procurement': new Set(['dashboard', 'supply-chain', 'procurement', 'suppliers', 'inventory', 'rd', 'feedback'])");
    expect(publicApp).toContain("Warehousing: new Set(['dashboard', 'inventory', 'shipping', 'pick-pack', 'quality-assurance', 'production', 'feedback'])");
    expect(publicApp).toContain("Production: new Set(['dashboard', 'production', 'food-safety', 'quality-assurance', 'pick-pack', 'inventory', 'feedback'])");
    expect(publicApp).toContain("Customer: CUSTOMER_ALLOWED_PAGES");
    expect(publicApp).toContain("Customer: 'customer-portal'");
  });

  test("keeps partial-local banner markers on the expected pages", () => {
    expect(publicApp).toContain("const PARTIAL_LOCAL_PAGE_LIMITS = {");
    expect(publicApp).not.toContain("Customer Portal is a protected preview. Some customer-facing records and generated notes are partial local-only");
    for (const marker of [
      "'content-library': 'Content Library has backend file paths, but some folder/file preview records and generated notes are partial local-only.'",
      "slack: 'Team Chat is not fully implemented yet. Channel history and generated local notes are partial local-only.'",
      "'food-safety': 'Food Safety sublogs are not fully implemented yet. Swabs, complaints, sanitation, CCP/HACCP, NCR/CAPA, and mock recall notes may remain partial local-only.'",
      "machinery: 'Machinery maintenance and equipment issue logs are not fully implemented yet. Local generated entries do not represent confirmed backend persistence.'",
      "inventory: 'Inventory has backend-backed core records. Generated local notes may remain partial local-only.'",
      "assignments: 'Assignments are not implemented yet. This placeholder is retained so scope is visible without implying a working workflow.'",
    ]) {
      expect(publicApp).toContain(marker);
    }
    expect(publicApp).not.toContain("receiving-log edits, move-log edits");
  });

  test("keeps the auth-gated login wall and partial-local banner CSS markers", () => {
    for (const marker of [
      "body.auth-pending",
      "body.auth-pending .sidebar",
      "body.auth-pending .main",
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

  test("renders the customer portal inline instead of behind an extra open button", () => {
    expect(publicApp).toContain("function renderSignedInCustomerPortalPage");
    expect(publicApp).toContain("function renderCustomerPortalInline");
    expect(publicApp).toContain("showCloseButton: false");
    expect(publicApp).not.toContain("Open Customer Portal</button>");
  });

  test("keeps the Customer Portal module free of old API status markers", () => {
    const portalModuleStart = publicApp.indexOf("function renderSignedInCustomerPortalPage");
    const portalModuleEnd = publicApp.indexOf("function profileSettingsAccountSummaryHtml", portalModuleStart);
    const portalModule = publicApp.slice(portalModuleStart, portalModuleEnd);
    const customerPortalFileStart = publicApp.indexOf("/* ----- Customer Portal preview ----- */");
    const customerPortalFileEnd = publicApp.indexOf("async function deleteUser", customerPortalFileStart);
    const customerPortalFile = publicApp.slice(customerPortalFileStart, customerPortalFileEnd);
    expect(portalModule).not.toContain("portal-status");
    expect(portalModule).not.toContain("Checking API...");
    expect(portalModule).not.toContain("API check OK");
    expect(portalModule).not.toContain("API check unavailable");
    expect(portalModule).not.toContain("Some portal actions may be unavailable.");
    expect(customerPortalFile).not.toContain("backend session");
    expect(customerPortalFile).not.toContain("backend login");
  });

  test("keeps Customer Portal focused on portal work and moves Account Summary to Profile settings", () => {
    const portalContentStart = publicApp.indexOf("function customerPortalContentHtml");
    const portalContentEnd = publicApp.indexOf("function renderCustomerPortalInline", portalContentStart);
    const portalContent = publicApp.slice(portalContentStart, portalContentEnd);
    expect(portalContent).not.toContain("Account Summary");
    expect(portalContent).not.toContain("customerPortalAccountPanelHtml");
    expect(portalContent).not.toContain("portal-status");
    expect(portalContent).not.toContain("Checking API...");
    expect(portalContent).not.toContain("API check OK");
    expect(portalContent).not.toContain("API check unavailable");
    expect(portalContent).not.toContain("Some portal actions may be unavailable.");
    expect(portalContent).not.toContain("backend session");
    expect(portalContent).not.toContain("backend login");
    expect(publicApp).toContain("profileSettingsAccountSummaryHtml");
    expect(publicApp).not.toContain("Customer profile, products, POs, and files are loading from protected backend records");
  });

  test("keeps customer PO entry product-suggested with custom fallback and hides internal raw/packaging inventory", () => {
    const portalContentStart = publicApp.indexOf("function customerPortalContentHtml");
    const portalContentEnd = publicApp.indexOf("function renderCustomerPortalInline", portalContentStart);
    const portalContent = publicApp.slice(portalContentStart, portalContentEnd);
    const portalFormStart = publicApp.indexOf("function customerPortalPoFormHtml");
    const portalFormEnd = publicApp.indexOf("function customerPortalUploadPanelHtml", portalFormStart);
    const portalForm = publicApp.slice(portalFormStart, portalFormEnd);
    const portalLineStart = publicApp.indexOf("function customerPortalProductOptionsHtml");
    const portalLineEnd = publicApp.indexOf("function removeCustomerPortalPoLine", portalLineStart);
    const portalLine = publicApp.slice(portalLineStart, portalLineEnd);
    expect(portalForm).toContain("customerPortalPoLineHtml(0, customerId)");
    expect(portalLine).toContain("customerPortalProductOptionsHtml");
    expect(portalLine).toContain('aria-label="Product"');
    expect(portalForm).not.toContain("Line description");
    expect(portalForm).not.toContain('aria-label="Line description"');
    expect(portalContent).not.toContain("Packaging Inventory");
    expect(portalContent).not.toContain("Raw Ingredient Inventory");
    expect(portalContent).not.toContain("customerPortalInventoryTableHtml");
    expect(publicApp).not.toContain("Linked inventory");
  });
});
