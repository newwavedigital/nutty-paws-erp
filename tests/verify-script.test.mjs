import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const verifyScript = readFileSync(resolve(import.meta.dirname, "..", "scripts", "verify.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"));

describe("verification script", () => {
  it("runs browser certification and explicit staging/production dry-runs", () => {
    expect(packageJson.scripts["test:e2e"]).toBe("playwright test");
    expect(verifyScript).toContain("npm run test:e2e");
    expect(verifyScript).toContain('"--env", "staging"');
    expect(verifyScript).toContain('"--env", "production"');
    expect(verifyScript).not.toContain('"wrangler", "deploy", "--dry-run"');
  });
});
