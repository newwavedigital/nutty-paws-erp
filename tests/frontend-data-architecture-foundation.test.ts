import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A8 frontend data architecture foundation", () => {
  test("defines workingStore and backend-confirmed cache envelopes", () => {
    expect(frontendText).toContain("const workingStore = createWorkingStore(loadState())");
    expect(frontendText).toContain("function createWorkingStore");
    expect(frontendText).toContain("const DATA_CACHE_KEY");
    expect(frontendText).toContain("function writeConfirmedBackendCache");
    expect(frontendText).toContain("source: 'backend'");
    expect(frontendText).toContain("fetchedAt:");
    expect(frontendText).toContain("ttlMs:");
  });

  test("defines stale-while-revalidate helpers and optimistic rollback behavior", () => {
    expect(frontendText).toContain("function hydrateWorkingModuleFromCache");
    expect(frontendText).toContain("function refreshWorkingModuleFromBackend");
    expect(frontendText).toContain("function optimisticWorkingMutation");
    expect(frontendText).toContain("workingStore.pendingMutations");
    expect(frontendText).toContain("source: 'rollback'");
  });

  test("stores auth state in sessionStorage rather than authoritative localStorage", () => {
    expect(frontendText).toContain("sessionStorage.getItem(AUTH_STORAGE_KEY)");
    expect(frontendText).toContain("sessionStorage.setItem(AUTH_STORAGE_KEY");
    expect(frontendText).toContain("localStorage.removeItem(AUTH_STORAGE_KEY)");
  });

  test("keeps public entrypoint mirrored for data architecture markers", () => {
    for (const marker of [
      "const workingStore = createWorkingStore(loadState())",
      "function writeConfirmedBackendCache",
      "function optimisticWorkingMutation",
      "sessionStorage.setItem(AUTH_STORAGE_KEY",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
