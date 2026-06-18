import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("frontend customer/product API wiring", () => {
  test("defines Sprint 3 backend data state and loaders", () => {
    expect(rootHtml).toContain("const backendCustomerState");
    expect(rootHtml).toContain("const backendProductState");
    expect(rootHtml).toContain("const backendMasterItemState");
    expect(rootHtml).toContain("async function loadBackendCustomers");
    expect(rootHtml).toContain("async function loadBackendCustomerProfile");
    expect(rootHtml).toContain("async function loadBackendProducts");
    expect(rootHtml).toContain("async function loadBackendMasterItems");
  });

  test("maps and merges backend customers, products, and master items into local state", () => {
    expect(rootHtml).toContain("function backendCustomerToLocalCustomer");
    expect(rootHtml).toContain("function backendProductToLocalProduct");
    expect(rootHtml).toContain("function backendMasterItemToLocalMasterItem");
    expect(rootHtml).toContain("function mergeBackendCustomers");
    expect(rootHtml).toContain("function mergeBackendProducts");
    expect(rootHtml).toContain("function mergeBackendMasterItems");
    expect(rootHtml).toContain("_backendSource");
  });

  test("uses Sprint 3 customer, product, and master-item API endpoints", () => {
    expect(rootHtml).toContain("/api/customers");
    expect(rootHtml).toContain("/api/customers/me");
    expect(rootHtml).toContain("/api/products");
    expect(rootHtml).toContain("/api/master-items");
  });

  test("keeps backend/local fallback messaging for Sprint 3 data views", () => {
    expect(rootHtml).toContain("Customer data is reading from protected backend records when available.");
    expect(rootHtml).toContain("Product data is reading from protected backend records when available.");
    expect(rootHtml).toContain("Master List data is reading from protected backend records when available.");
    expect(rootHtml).toContain("Local customer/product demo data remains visible while backend data is unavailable.");
  });

  test("keeps public entrypoint mirrored for Sprint 3 markers", () => {
    for (const marker of [
      "async function loadBackendCustomers",
      "async function loadBackendCustomerProfile",
      "async function loadBackendProducts",
      "async function loadBackendMasterItems",
      "/api/customers/me",
      "/api/products",
      "/api/master-items",
    ]) {
      expect(publicHtml).toContain(marker);
    }
  });
});
