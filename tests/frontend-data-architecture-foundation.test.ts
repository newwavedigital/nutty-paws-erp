import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint A8 frontend data architecture foundation", () => {
  test("defines workingStore and backend-confirmed cache envelopes", () => {
    expect(rootHtml).toContain("const workingStore = createWorkingStore(loadState())");
    expect(rootHtml).toContain("function createWorkingStore");
    expect(rootHtml).toContain("const DATA_CACHE_KEY");
    expect(rootHtml).toContain("function writeConfirmedBackendCache");
    expect(rootHtml).toContain("source: 'backend'");
    expect(rootHtml).toContain("fetchedAt:");
    expect(rootHtml).toContain("ttlMs:");
  });

  test("defines stale-while-revalidate helpers and optimistic rollback behavior", () => {
    expect(rootHtml).toContain("function hydrateWorkingModuleFromCache");
    expect(rootHtml).toContain("function refreshWorkingModuleFromBackend");
    expect(rootHtml).toContain("function optimisticWorkingMutation");
    expect(rootHtml).toContain("workingStore.pendingMutations");
    expect(rootHtml).toContain("source: 'rollback'");
  });

  test("stores auth state in sessionStorage rather than authoritative localStorage", () => {
    expect(rootHtml).toContain("sessionStorage.getItem(AUTH_STORAGE_KEY)");
    expect(rootHtml).toContain("sessionStorage.setItem(AUTH_STORAGE_KEY");
    expect(rootHtml).toContain("localStorage.removeItem(AUTH_STORAGE_KEY)");
  });

  test("keeps public entrypoint mirrored for data architecture markers", () => {
    for (const marker of [
      "const workingStore = createWorkingStore(loadState())",
      "function writeConfirmedBackendCache",
      "function optimisticWorkingMutation",
      "sessionStorage.setItem(AUTH_STORAGE_KEY",
    ]) {
      expect(publicHtml).toContain(marker);
    }
  });
});
