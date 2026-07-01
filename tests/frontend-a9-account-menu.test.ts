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
      expect(frontendText).toContain("router('profile-settings')");
      expect(frontendText).not.toContain("onclick=\"router('users')\">Profile settings</button>");
      expect(frontendText).toContain("logoutBackendAuth()");
    }
  });

  test("routes Profile settings to account summary and password management instead of Account Management", () => {
    expect(frontendText).toContain("'profile-settings': 'Profile Settings'");
    expect(frontendText).toContain("function renderProfileSettings");
    expect(frontendText).toContain("function profileSettingsAccountSummaryHtml");
    expect(frontendText).toContain("profile-settings-layout");
    expect(frontendText).toContain("profile-settings-summary");
    expect(frontendText).toContain("profile-settings-metric-row");
    expect(frontendText).toContain("profile-settings-metric");
    expect(frontendText).toContain("profile-settings-password");
    expect(frontendText).toContain("profile-password-feedback");
    expect(frontendText).toContain("function submitProfilePasswordChange");
    expect(frontendText).toContain("/api/auth/change-password");
    expect(frontendText).toContain("Current password");
    expect(frontendText).toContain("New password");
    expect(frontendText).toContain("Confirm new password");
    expect(frontendText).toContain('<form class="profile-password-form" novalidate');
    expect(frontendText).toContain('id="profile_current_password"');
    expect(frontendText).toContain('id="profile_new_password"');
    expect(frontendText).toContain('id="profile_confirm_password"');
    expect(frontendText).toContain('autocomplete="current-password"');
    expect(frontendText).toContain('autocomplete="new-password"');
    expect(frontendText).toContain("function toggleProfilePasswordVisibility");
    expect(frontendText).toContain("aria-pressed");
  });

  test("removes legacy visible demo/auth-needed status labels", () => {
    for (const html of [rootHtml, publicHtml]) {
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
      expect(frontendText).toContain("Log in as backend Admin before saving users. Nothing was saved locally.");
      expect(frontendText).toContain('disabled title="Log in as backend Admin before adding users"');
      expect(frontendText).toContain("Backend user save failed. The account was not created; log in as backend Admin and try again.");
      expect(frontendText).toContain("requireBackendWriteSession(backendUserState");
      expect(frontendText).toContain("failBackendRequiredWrite(err, backendUserState");
      expect(frontendText).not.toContain("toast('User saved locally.')");
    }
  });

  test("keeps Account Management fields aligned with backend user truth", () => {
    expect(frontendText).toContain("addedAt: (user.createdAt || '').slice(0, 10)");
    expect(frontendText).not.toContain("addedAt: new Date().toISOString().slice(0,10)");
    expect(frontendText).toContain("Added Date");
    expect(frontendText).toContain("readonly");
    expect(frontendText).toContain("temporaryPassword");
    expect(frontendText).toContain("email: data.email");
    expect(frontendText).toContain("clearProtectedBackendRows('account-management');");
    expect(frontendText).toContain("Inventory, Shipping, Pick & Pack, Quality, and Production Schedule workflows.");
    expect(frontendText).not.toContain("Inventory, Shipping. View Production Schedule.");
  });
});
