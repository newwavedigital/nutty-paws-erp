import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A9 account menu and auth-on staging markers", () => {
  test("adds the top-right signed-in account menu contract", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(frontendText).toContain('id="topbarAccount"');
      expect(frontendText).toContain("function renderTopbarAccount");
      expect(frontendText).toContain("function updateTopbarAccount");
      expect(frontendText).toContain("function toggleTopbarAccountMenu");
      expect(frontendText).toContain("function closeTopbarAccountMenu");
      expect(frontendText).toContain("topbar-account-avatar");
      expect(frontendText).toContain("topbar-account-name");
      expect(frontendText).toContain("topbar-account-role");
      expect(frontendText).toContain("Refresh profile");
      expect(frontendText).toContain("Profile settings");
      expect(frontendText).toContain("logoutBackendAuth()");
    }
  });

  test("removes legacy visible demo/auth-needed status labels", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(frontendText).toContain("Offline preview");
      expect(frontendText).toContain("Sign in required");
      expect(frontendText).not.toContain("Demo Data Active");
      expect(frontendText).not.toContain("Demo data active");
      expect(frontendText).not.toContain("Auth Needed");
      expect(frontendText).not.toContain("Auth required");
      expect(frontendText).not.toContain("Showing local demo data");
      expect(frontendText).not.toContain("Optional for Phase 2A review");
    }
  });

  test("keeps Account Management linked customer display readable", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(frontendText).toContain("function customerDisplayNameForUser");
      expect(frontendText).toContain("function linkedCustomerCellHtml");
      expect(frontendText).toContain("Customer Demo 1");
      expect(frontendText).toContain('<span style="color:var(--brown-light);font-size:12px">-</span>');
      expect(frontendText).toContain('<span style="color:var(--danger);font-size:12px">Not linked</span>');
    }
  });

  test("keeps Account Management from creating login-looking local-only users", () => {
    for (const html of [rootHtml, publicHtml]) {
      expect(frontendText).toContain("Log in as backend Admin before adding users. Browser-preview users cannot log in.");
      expect(frontendText).toContain('disabled title="Log in as backend Admin before adding users"');
      expect(frontendText).toContain("Backend user save failed. The account was not created; log in as backend Admin and try again.");
      expect(frontendText).toContain("return;\n    }\n  }\n\n  if (isNew) {");
    }
  });
});
