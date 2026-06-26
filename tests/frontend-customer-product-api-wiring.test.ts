import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { frontendText } from "./frontend-assets";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("frontend customer/product API wiring", () => {
  test("defines backend customer/product data state and loaders", () => {
    expect(frontendText).toContain("const backendCustomerState");
    expect(frontendText).toContain("const backendProductState");
    expect(frontendText).toContain("const backendMasterItemState");
    expect(frontendText).toContain("async function loadBackendCustomers");
    expect(frontendText).toContain("async function loadBackendCustomerProfile");
    expect(frontendText).toContain("async function loadBackendProducts");
    expect(frontendText).toContain("async function loadBackendMasterItems");
  });

  test("maps and merges backend customers, products, and master items into local state", () => {
    expect(frontendText).toContain("function backendCustomerToLocalCustomer");
    expect(frontendText).toContain("function backendProductToLocalProduct");
    expect(frontendText).toContain("function backendMasterItemToLocalMasterItem");
    expect(frontendText).toContain("function mergeBackendCustomers");
    expect(frontendText).toContain("function mergeBackendProducts");
    expect(frontendText).toContain("function mergeBackendMasterItems");
    expect(frontendText).toContain("_backendSource");
  });

  test("uses customer, product, and master-item API endpoints", () => {
    expect(frontendText).toContain("/api/customers");
    expect(frontendText).toContain("/api/customers/me");
    expect(frontendText).toContain("/api/products");
    expect(frontendText).toContain("/api/master-items");
  });

  test("keeps backend/local fallback messaging for customer/product data views", () => {
    expect(frontendText).toContain("Customer data is reading from protected backend records when available.");
    expect(frontendText).toContain("Product data is reading from protected backend records when available.");
    expect(frontendText).toContain("Master List data is reading from protected backend records when available.");
    expect(frontendText).toContain("Local customer/product demo data remains visible while backend data is unavailable.");
  });

  test("keeps public entrypoint mirrored for customer/product data markers", () => {
    for (const marker of [
      "async function loadBackendCustomers",
      "async function loadBackendCustomerProfile",
      "async function loadBackendProducts",
      "async function loadBackendMasterItems",
      "/api/customers/me",
      "/api/products",
      "/api/master-items",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
