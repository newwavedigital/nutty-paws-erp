import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicApp, publicStyles } from "./frontend-assets";

const repoRoot = resolve(__dirname, "..");
const wrangler = JSON.parse(stripJsonComments(readFileSync(resolve(repoRoot, "wrangler.jsonc"), "utf8")));
const rootIndex = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const publicIndex = readFileSync(resolve(repoRoot, "public", "index.html"), "utf8");
const publicFaviconIco = readFileSync(resolve(repoRoot, "public", "favicon.ico"));
const publicFaviconSvg = readFileSync(resolve(repoRoot, "public", "favicon.svg"), "utf8");

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

  test("serves a split frontend shell with static CSS and JavaScript assets", () => {
    expect(rootIndex).toContain('href="public/styles.css"');
    expect(rootIndex).toContain('src="public/app.js"');
    expect(publicIndex).toContain('href="styles.css"');
    expect(publicIndex).toContain('src="app.js"');
    expect(rootIndex).toContain('<body class="auth-pending">');
    expect(publicIndex).toContain('<body class="auth-pending">');
    expect(rootIndex).not.toContain("<style>");
    expect(publicIndex).not.toContain("<style>");
    expect(rootIndex).not.toContain("<script>");
    expect(publicIndex).not.toContain("<script>");
    expect(publicStyles).toContain(".sidebar");
    expect(publicApp).toContain("function router");

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
      "Customer Portal",
      "Feedback",
      "Account Management",
    ]) {
      expect(publicIndex + publicApp).toContain(marker);
    }
    expect(publicApp).toContain("Assignments will be implemented in a future scope.");
    expect(publicApp).not.toContain("portal-status");
    expect(publicApp).not.toContain("Checking API...");
    expect(publicApp).not.toContain("API check OK");
    expect(publicApp).not.toContain("API check unavailable");
    expect(publicApp).not.toContain("Some portal actions may be unavailable.");
    expect(publicStyles).not.toContain(".portal-status");
    expect(publicStyles).not.toContain("portal-status");
  });

  test("serves Nut House favicon assets for browser and preview fallback paths", () => {
    expect(rootIndex).toContain('href="public/favicon.ico"');
    expect(rootIndex).toContain('href="public/favicon.svg"');
    expect(publicIndex).toContain('href="favicon.ico"');
    expect(publicIndex).toContain('href="favicon.svg"');
    expect(publicFaviconIco.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(publicFaviconSvg).toContain(">NH<");
  });

  test("removes old Customer Portal status markers from static frontend assets", () => {
    expect(publicStyles).not.toContain(".portal-status");
    expect(publicStyles).not.toContain("portal-status");
    expect(publicApp).not.toContain("portal-status");
    expect(publicApp).not.toContain("Checking API...");
    expect(publicApp).not.toContain("API check OK");
    expect(publicApp).not.toContain("API check unavailable");
    expect(publicApp).not.toContain("Some portal actions may be unavailable.");
  });

  test("defines customer RBAC navigation and restricted-route fallback markers", () => {
    expect(publicApp).toContain("const CUSTOMER_ALLOWED_PAGES");
    expect(publicApp).toContain("const EMPLOYEE_NAV_PAGES");
    expect(publicApp).toContain("function isCustomerSession");
    expect(publicApp).toContain("function isPageAllowedForCurrentUser");
    expect(publicApp).toContain("function updateSidebarNavigationForRole");
    expect(publicApp).toContain("function renderRestrictedPage");
    expect(publicApp).toContain("This area is for employee and admin workflows.");
  });

  test("keeps staging demo credentials gated to staging and local hosts", () => {
    expect(publicApp).toContain("function shouldShowStagingDemoCredentials");
    expect(publicApp).toContain("data-staging-demo-credentials");
    expect(publicApp).toContain("host.includes('staging')");
    expect(publicApp).toContain("DemoAdmin123!");
    expect(publicStyles).toContain(".auth-demo-access");
  });
});
