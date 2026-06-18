import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("UI/UX refinement markers", () => {
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
});
