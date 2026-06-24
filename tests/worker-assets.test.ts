import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const wrangler = JSON.parse(stripJsonComments(readFileSync(resolve(repoRoot, "wrangler.jsonc"), "utf8")));
const rootIndex = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const publicIndex = readFileSync(resolve(repoRoot, "public", "index.html"), "utf8");

function stripJsonComments(input: string) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

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
    for (const marker of [
      "Production",
      "Warehousing",
      "Operations",
      "Records",
      "Support",
      "Purchase Orders",
      "Supply Chain",
      "Production Schedule",
      "Quality Assurance",
      "Research & Development",
      "Shipping",
      "Inventory",
      "Pick & Pack",
      "Products",
      "Suppliers",
      "Customers",
      "Procurement",
      "Food Safety",
      "Machinery",
      "Content Library",
      "Team Chat",
      "Assignments",
      "Feedback",
      "Account Management",
    ]) {
      expect(publicIndex).toContain(marker);
    }
    expect(publicIndex).toContain("Assignments will be implemented in a future scope.");
    expect(publicIndex).toContain("Backend connected");
  });
});
