import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const wrangler = JSON.parse(readFileSync(resolve(repoRoot, "wrangler.jsonc"), "utf8").replace(/^\uFEFF/, ""));
const rootIndex = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const publicIndex = readFileSync(resolve(repoRoot, "public", "index.html"), "utf8");

describe("Worker staging frontend assets", () => {
  test("serves the prototype through Workers static assets while API routes run through the Worker", () => {
    expect(wrangler.assets).toMatchObject({
      directory: "./public",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    });
  });

  test("keeps the deployed static prototype in sync with the source prototype", () => {
    expect(publicIndex).toBe(rootIndex);
    expect(publicIndex).toContain("Purchase Orders");
    expect(publicIndex).toContain("Backend connected");
  });
});
