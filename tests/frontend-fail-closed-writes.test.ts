import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

describe("frontend fail-closed backend writes", () => {
  test("does not advertise local-only success after backend write failures", () => {
    const forbiddenFallbacks = [
      "saved PO locally instead",
      "saved editable fields locally",
      "deposit status saved locally",
      "stayed local/demo only",
      "local demo fallback remains visible",
      "Saved locally only",
      "User saved locally.",
    ];

    for (const marker of forbiddenFallbacks) {
      expect(publicApp).not.toContain(marker);
    }
  });

  test("defines a shared guard for backend-required write failures", () => {
    expect(publicApp).toContain("function failBackendRequiredWrite");
    expect(publicApp).toContain("function requireBackendWriteSession");
    expect(publicApp).toContain("Backend save failed. Nothing was saved locally.");
    expect(publicApp).toContain("Sign in before saving. Nothing was saved locally.");
  });

  test("keeps Account Management delete from falling through to local delete after backend failure", () => {
    const deleteUserStart = publicApp.indexOf("async function deleteUser");
    expect(deleteUserStart).toBeGreaterThan(0);
    const deleteUserBody = publicApp.slice(deleteUserStart, publicApp.indexOf("/* ----- Customer Portal preview -----", deleteUserStart));

    expect(deleteUserBody).toContain("failBackendRequiredWrite");
    expect(deleteUserBody).not.toContain("Account Management could not reach the backend user API; keeping browser-preview users active.");
  });
});
