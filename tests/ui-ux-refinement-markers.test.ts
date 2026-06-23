import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");
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
      expect(rootHtml).toContain(marker);
    }
  });

  test("groups sidebar navigation around operational workflow areas", () => {
    for (const marker of [
      "nav-section-label",
      "Orders",
      "Inventory",
      "Production",
      "Records",
      "Admin / Support",
    ]) {
      expect(rootHtml).toContain(marker);
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
      expect(rootHtml).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for UI/UX refinement markers", () => {
    for (const marker of [
      "function renderDataStateBanner",
      "function openConfirmModal",
      "nav-section-label",
      "erp-confirm-modal",
      "data-confirm-action",
    ]) {
      expect(publicHtml).toContain(marker);
    }
  });

  test("labels the app as pre-release and does not expose demo reset controls", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(html).toContain("Phase 2B Alpha");
      expect(html).not.toContain("<span>v1.0</span>");
      expect(html).not.toContain("resetAllData()");
      expect(html).not.toContain("Reset Demo");
      expect(html).not.toContain("Reset Data");
    }
    expect(packageJson.version).toBe("0.5.0-alpha.0");
    expect(packageLockJson.version).toBe("0.5.0-alpha.0");
    expect(packageLockJson.packages[""].version).toBe("0.5.0-alpha.0");
  });

  test("adds keyboard and role contracts to sidebar navigation", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain('role="button"');
      expect(html, entrypoint).toContain('tabindex="0"');
      expect(html, entrypoint).toContain("handleSidebarNavKeydown");
      expect(html, entrypoint).toContain("activateSidebarNavLink");
    }
  });

  test("defines visible focus styles for primary interactive controls", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain(":focus-visible");
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
        expect(html, `${entrypoint} missing ${selector}`).toContain(selector);
      }
    }
  });

  test("keeps hamburger expanded state synchronized for responsive sidebar states", () => {
    for (const [entrypoint, html] of htmlEntrypoints) {
      expect(html, entrypoint).toContain('id="hamburger" aria-label="Toggle menu" aria-expanded="true"');
      expect(html, entrypoint).toContain("function setHamburgerExpanded");
      expect(html, entrypoint).toContain("function syncHamburgerExpandedState");
      expect(html, entrypoint).toContain("visualViewport");
      expect(html, entrypoint).toContain("setHamburgerExpanded(");
    }
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
        expect(html, `${entrypoint} missing ${marker}`).toContain(marker);
      }
    }
  });
});
