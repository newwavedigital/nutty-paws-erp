import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A9 account menu and auth-on staging markers", () => {
  test("adds the top-right signed-in account menu contract", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(html).toContain('id="topbarAccount"');
      expect(html).toContain("function renderTopbarAccount");
      expect(html).toContain("function updateTopbarAccount");
      expect(html).toContain("function toggleTopbarAccountMenu");
      expect(html).toContain("function closeTopbarAccountMenu");
      expect(html).toContain("topbar-account-avatar");
      expect(html).toContain("topbar-account-name");
      expect(html).toContain("topbar-account-role");
      expect(html).toContain("Refresh profile");
      expect(html).toContain("Profile settings");
      expect(html).toContain("logoutBackendAuth()");
    }
  });

  test("removes legacy visible demo/auth-needed status labels", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(html).toContain("Offline preview");
      expect(html).toContain("Sign in required");
      expect(html).not.toContain("Demo Data Active");
      expect(html).not.toContain("Demo data active");
      expect(html).not.toContain("Auth Needed");
      expect(html).not.toContain("Auth required");
      expect(html).not.toContain("Showing local demo data");
      expect(html).not.toContain("Optional for Phase 2A review");
    }
  });

  test("keeps Account Management linked customer display readable", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(html).toContain("function customerDisplayNameForUser");
      expect(html).toContain("function linkedCustomerCellHtml");
      expect(html).toContain("Customer Demo 1");
      expect(html).toContain('<span style="color:var(--brown-light);font-size:12px">-</span>');
      expect(html).toContain('<span style="color:var(--danger);font-size:12px">Not linked</span>');
    }
  });
});
