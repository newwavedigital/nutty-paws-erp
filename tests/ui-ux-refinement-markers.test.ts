import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { frontendText, publicApp, publicStyles } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");
const productionModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "production", "index.js"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf8")) as { version: string };
const packageLockJson = JSON.parse(readFileSync(resolve(__dirname, "..", "package-lock.json"), "utf8")) as {
  version: string;
  packages: Record<string, { version?: string }>;
};

describe("UI/UX refinement markers", () => {
  const htmlEntrypoints = [
    ["root", rootHtml],
    ["public", publicHtml],
  ] as const;

  test("defines shared operational UI helpers for the single-file frontend", () => {
    for (const marker of [
      "function renderPageShellHeader",
      "function renderDataStateBanner",
      "function renderOpsPanel",
      "function renderOpsToolbar",
      "function renderEmptyState",
      "function renderStatusBadge",
      "function renderActionButtons",
      "function openConfirmModal",
      "function setButtonLoading",
      "function renderInlineFieldError",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("groups sidebar navigation around the requested operational areas in order", () => {
    const expectedOrder = [
      "Production",
      "Purchase Orders",
      "Supply Chain",
      "Production Schedule",
      "Quality Assurance",
      "Research &amp; Development",
      "Warehousing",
      "Shipping",
      "Inventory",
      "Pick &amp; Pack",
      "Operations",
      "Products",
      "Suppliers",
      "Customers",
      "Procurement",
      "Records",
      "Food Safety",
      "Machinery",
      "Content Library",
      "Team Chat",
      "Assignments",
      '<div class="nav-section-label">Customer</div>',
      'data-page="customer-portal"',
      "Support",
      "Feedback",
      "Account Management",
    ];

    for (const html of [rootHtml, publicHtml]) {
      const navStart = html.indexOf('<nav id="nav">');
      const navEnd = html.indexOf('</nav>', navStart);
      const navHtml = html.slice(navStart, navEnd);
      let lastIndex = -1;
      for (const marker of expectedOrder) {
        const index = navHtml.indexOf(marker);
        expect(index, marker).toBeGreaterThan(lastIndex);
        lastIndex = index;
      }
    }
  });

  test("uses ERP confirmation modal and action hierarchy markers for risky actions", () => {
    for (const marker of [
      "erp-confirm-modal",
      "data-confirm-action",
      "Confirm action",
      "btn-workflow",
      "btn-danger",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps split frontend assets wired for UI/UX refinement markers", () => {
    for (const marker of [
      "function renderDataStateBanner",
      "function openConfirmModal",
      "nav-section-label",
      "erp-confirm-modal",
      "data-confirm-action",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps Production Schedule room assignment without the toolbar room legend", () => {
    expect(productionModule).not.toContain("room-legend");
    expect(productionModule).toContain("const ROOMS = ['Squeeze Pack', 'Bnutty', 'Main', 'Dog House'];");
    expect(productionModule).toContain('<label>Production Room</label>');
    expect(productionModule).toContain("id=\"sched_room\"");
    expect(productionModule).toContain("id=\"ev_room\"");
  });

  test("keeps sidebar spacing compact enough for the full navigation set", () => {
    expect(publicStyles).toContain(".sidebar-header {\n    padding: 12px 18px;");
    expect(publicStyles).toContain(".sidebar nav { flex: 1; padding: 6px 0; overflow-y: auto; }");
    expect(publicStyles).toContain("padding: 7px 18px 3px;");
    expect(publicStyles).toContain("padding: 5px 18px;");
  });

  test("labels the app as pre-release and does not expose demo reset controls", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(html).toContain("Phase 2B Alpha");
      expect(html).not.toContain("<span>v1.0</span>");
      expect(html).not.toContain("resetAllData()");
      expect(html).not.toContain("Reset Demo");
      expect(html).not.toContain("Reset Data");
    }
    expect(packageJson.version).toBe("1.0.0");
    expect(packageLockJson.version).toBe("1.0.0");
    expect(packageLockJson.packages[""].version).toBe("1.0.0");
  });

  test("adds keyboard and role contracts to sidebar navigation", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain('role="button"');
      expect(html, entrypoint).toContain('tabindex="0"');
    }
    expect(publicApp).toContain("handleSidebarNavKeydown");
    expect(publicApp).toContain("activateSidebarNavLink");
  });

  test("defines visible focus styles for primary interactive controls", () => {
    expect(publicStyles).toContain(":focus-visible");
    for (const selector of [
      ".sidebar nav a:focus-visible",
      ".hamburger:focus-visible",
      ".modal-close:focus-visible",
      ".topbar-account:focus-visible",
      ".tab:focus-visible",
      ".btn:focus-visible",
      "input:focus-visible",
      "select:focus-visible",
      "textarea:focus-visible",
    ]) {
      expect(publicStyles, `missing ${selector}`).toContain(selector);
    }
  });

  test("keeps hamburger expanded state synchronized for responsive sidebar states", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain('id="hamburger" aria-label="Toggle menu" aria-expanded="true"');
    }
    expect(publicApp).toContain("function setHamburgerExpanded");
    expect(publicApp).toContain("function syncHamburgerExpandedState");
    expect(publicApp).toContain("visualViewport");
    expect(publicApp).toContain("setHamburgerExpanded(");
  });

  test("adds modal dialog semantics and focus-management helpers", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain('id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"');
      for (const marker of [
        "lastModalTrigger",
        "function getModalFocusableElements",
        "function focusFirstModalElement",
        "function trapModalFocus",
        "lastModalTrigger.focus",
        "function captureModalFieldState",
        "function restoreModalFieldState",
        "fieldState: captureModalFieldState",
        "restoreModalFieldState",
      ]) {
        expect(frontendText, `${entrypoint} missing ${marker}`).toContain(marker);
      }
    }
  });

  test("does not ship mojibake punctuation artifacts in mirrored frontend files", () => {
    const forbiddenArtifacts = [
      "Ã",
      "Â",
      "â‚¬",
      "â€",
      "â€¦",
      "â€”",
      "�",
    ];

    for (const [entrypoint, html] of [["frontend", frontendText]] as const) {
      for (const artifact of forbiddenArtifacts) {
        expect(html, `${entrypoint} contains mojibake artifact ${artifact}`).not.toContain(artifact);
      }
    }
  });
});
