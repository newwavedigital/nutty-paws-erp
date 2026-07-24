import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { chromium } from "@playwright/test";
import { generateSampleAccountSql } from "./sample-accounts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const wranglerBin = resolve(repoRoot, "node_modules/wrangler/bin/wrangler.js");
// Keep the local persistence path short: Miniflare appends long internal D1 paths on Windows.
const persistTo = ".tmp/bicr-v1";
const persistDirectory = resolve(repoRoot, persistTo);
const databaseName = "nut-house-portal-staging-db";
const adminEmail = "admin_demo_1@staging.nuthouse.local";
const adminPassword = "DemoAdmin123!";
const fixtureDirectory = resolve(repoRoot, "../../../outputs/bulk-import-conflict-review-2026-07-22");
const scenarioData = JSON.parse(readFileSync(resolve(fixtureDirectory, "scenario-data.json"), "utf8"));
const smoke = process.argv.includes("--smoke");

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} failed.\n${result.stdout || ""}${result.stderr || ""}`.trim());
}

function wrangler(args, label) {
  const result = spawnSync("npx", ["wrangler", ...args], { cwd: repoRoot, encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${label} failed.\n${result.stdout || ""}${result.stderr || ""}`.trim());
}

function wranglerSql(sql, label) {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "nut-house-conflict-review-"));
  const sqlFile = resolve(temporaryDirectory, "review.sql");
  try {
    writeFileSync(sqlFile, sql, { encoding: "utf8", mode: 0o600 });
    wrangler(["d1", "execute", databaseName, "--env", "staging", "--local", "--persist-to", persistTo, "--file", sqlFile], label);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function availablePort(start = 8814) {
  for (let port = start; port < start + 20; port += 1) {
    const free = await new Promise(resolveFree => {
      const server = createServer();
      server.once("error", () => resolveFree(false));
      server.once("listening", () => server.close(() => resolveFree(true)));
      server.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error("No free local review port was found between 8814 and 8833.");
}

async function waitForServer(url, worker) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error("The local review Worker stopped before becoming ready.");
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  throw new Error(`The local review Worker did not become ready at ${url}.`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function api(url, options = {}) {
  const { response, body } = await requestJson(url, options);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function schema(baseUrl, token, moduleName) {
  return api(`${baseUrl}/api/imports/${moduleName}/schema`, { headers: { authorization: `Bearer ${token}` } });
}

function importPayload(importSchema, rows) {
  return {
    headers: importSchema.columns.map(column => column.key),
    rows,
    rowNumbers: rows.map((_, index) => index + 2),
    sourceFileBytes: 10_000,
  };
}

async function importCall(baseUrl, token, moduleName, action, rows) {
  const importSchema = await schema(baseUrl, token, moduleName);
  return requestJson(`${baseUrl}/api/imports/${moduleName}/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(importPayload(importSchema, rows)),
  });
}

async function seedModule(baseUrl, token, moduleName, rows) {
  const { response, body } = await importCall(baseUrl, token, moduleName, "commit", rows);
  if (!response.ok || body.data?.creates !== rows.length) {
    throw new Error(`Could not seed ${rows.length} ${moduleName}: ${response.status} ${JSON.stringify(body)}`);
  }
}

function comparableRows(rows, moduleName) {
  if (!Array.isArray(rows)) throw new Error(`${moduleName} API did not return an array.`);
  return rows
    .filter(row => moduleName === "customers" ? String(row.name || "").startsWith("QA Customer") : String(row.masterItemName || "").startsWith("Original seeded inventory"))
    .sort((left, right) => String(moduleName === "customers" ? left.name : left.masterItemName).localeCompare(String(moduleName === "customers" ? right.name : right.masterItemName)));
}

async function verifyBackendScenarios(baseUrl, token) {
  const endpoints = { customers: "/api/customers", inventory: "/api/inventory" };
  const headers = { authorization: `Bearer ${token}` };
  const before = {};
  for (const [moduleName, endpoint] of Object.entries(endpoints)) {
    before[moduleName] = comparableRows(await api(`${baseUrl}${endpoint}`, { headers }), moduleName);
  }

  const results = [];
  for (const [fileName, scenario] of Object.entries(scenarioData.scenarios)) {
    const expectedIssues = fileName.includes("02-mixed") ? 5 : fileName.includes("03-all") ? 10 : 0;
    const preview = await importCall(baseUrl, token, scenario.module, "preview", scenario.rows);
    if (!preview.response.ok) throw new Error(`${fileName} preview request failed: ${JSON.stringify(preview.body)}`);
    const data = preview.body.data;
    if (expectedIssues === 0) {
      if (!data.valid || data.creates !== 10 || data.errors.length !== 0) throw new Error(`${fileName} was not a valid 10-create preview: ${JSON.stringify(data)}`);
    } else {
      if (data.valid || data.creates !== 0 || data.records.length !== 0 || data.errors.filter(error => error.code === "IMPORT_RECORD_EXISTS").length !== expectedIssues) {
        throw new Error(`${fileName} did not block atomically with ${expectedIssues} existing-record errors: ${JSON.stringify(data)}`);
      }
      const commit = await importCall(baseUrl, token, scenario.module, "commit", scenario.rows);
      const blockedPreview = commit.body.error?.details?.preview;
      if (commit.response.status !== 400 || blockedPreview?.valid !== false || blockedPreview?.creates !== 0) {
        throw new Error(`${fileName} commit was not rejected atomically: ${commit.response.status} ${JSON.stringify(commit.body)}`);
      }
    }
    results.push({ fileName, module: scenario.module, valid: data.valid, creates: data.creates, issues: data.errors.length, commit: expectedIssues ? "rejected" : "not run (preview only)" });
  }

  for (const [moduleName, endpoint] of Object.entries(endpoints)) {
    const after = comparableRows(await api(`${baseUrl}${endpoint}`, { headers }), moduleName);
    if (JSON.stringify(after) !== JSON.stringify(before[moduleName])) throw new Error(`${moduleName} changed during preview/rejected-commit checks.`);
  }

  const originalCustomer = before.customers.find(row => row.name === "QA Customer Existing 001");
  const originalInventory = before.inventory.find(row => row.masterItemName === "Original seeded inventory 001");
  if (originalCustomer?.contactName !== "Original seeded contact" || Number(originalInventory?.onHandQuantity) !== 25) {
    throw new Error(`Seeded conflict targets were unexpectedly modified: ${JSON.stringify({ originalCustomer, originalInventory })}`);
  }
  return results;
}

async function openModuleImport(page, moduleLabel) {
  await page.getByRole("button", { name: new RegExp(`${moduleLabel}$`) }).click();
  await page.getByRole("button", { name: "Import CSV / Excel" }).click();
}

async function uploadFixture(page, fileName, expectation) {
  await page.locator('.import-drop input[type="file"]').setInputFiles(resolve(fixtureDirectory, fileName));
  await page.locator("#importPreviewSummary").waitFor();
  const summary = await page.locator("#importPreviewSummary").innerText();
  if (expectation === "valid") {
    if (!summary.includes("Ready to import")) {
      const parserFixture = readFileSync(resolve(fixtureDirectory, fileName)).toString("base64");
      const parserError = await page.evaluate(async ({ base64, name }) => {
        if (typeof window.readXlsxFile !== "function") return "Raw parser diagnostic unavailable.";
        const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        const selectedFile = new File([bytes], name);
        try {
          await window.readXlsxFile(selectedFile, { sheets: [1] });
          return "Raw parser accepted the file; failure occurred in importer post-processing.";
        } catch (error) {
          return error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error);
        }
      }, { base64: parserFixture, name: fileName });
      throw new Error(`${fileName} did not produce a valid preview.\n${await page.locator(".modal").innerText()}\nRaw parser: ${parserError}`);
    }
    await page.getByText("New records (10)", { exact: true }).waitFor();
    if (await page.getByRole("button", { name: "Import all rows" }).isDisabled()) throw new Error(`${fileName} unexpectedly disabled import.`);
    return;
  }
  if (!summary.includes("Nothing has been imported")) {
    throw new Error(`${fileName} did not produce a blocked preview.\n${await page.locator(".modal").innerText()}`);
  }
  await page.getByText("Existing records block this import", { exact: true }).waitFor();
  await page.getByText(expectation === "mixed" ? "View existing records (5)" : "View existing records (10)", { exact: true }).waitFor();
  if (!(await page.getByRole("button", { name: "Import all rows" }).isDisabled())) throw new Error(`${fileName} did not disable import.`);
}

async function closeImport(page) {
  await page.getByRole("button", { name: "Cancel" }).click();
}

async function verifyUiScenarios(page) {
  const cases = [
    ["Customers", "customers-01-no-conflicts.xlsx", "valid"],
    ["Customers", "customers-02-mixed-5-conflicts-5-new.xlsx", "mixed"],
    ["Customers", "customers-03-all-10-conflicts.xlsx", "all"],
    ["Inventory", "inventory-01-no-conflicts.xlsx", "valid"],
    ["Inventory", "inventory-02-mixed-5-conflicts-5-new.xlsx", "mixed"],
    ["Inventory", "inventory-03-all-10-conflicts.xlsx", "all"],
  ];
  for (const [moduleLabel, fileName, expectation] of cases) {
    await openModuleImport(page, moduleLabel);
    await uploadFixture(page, fileName, expectation);
    await closeImport(page);
  }
}

let worker;
let browser;

async function cleanup() {
  if (browser?.isConnected()) await browser.close().catch(() => {});
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
}

async function main() {
  console.log("Preparing Customer and Inventory conflict-review environment...");
  mkdirSync(persistDirectory, { recursive: true });
  runNode([resolve(repoRoot, "scripts/build-frontend-assets.mjs")], "Frontend build");
  wrangler(["d1", "migrations", "apply", databaseName, "--env", "staging", "--local", "--persist-to", persistTo], "Local migrations");
  wranglerSql(generateSampleAccountSql(adminPassword).replace(/^--.*$/gm, "").trim(), "Local demo-account seed");
  wranglerSql(`
    DELETE FROM inventory_items WHERE master_item_id IN (SELECT id FROM master_items WHERE sku LIKE 'QA-INV-%');
    DELETE FROM master_items WHERE sku LIKE 'QA-INV-%';
    DELETE FROM customers WHERE name LIKE 'QA Customer%';
  `, "Conflict-review cleanup");

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [wranglerBin, "dev", "--local", "--port", String(port), "--persist-to", persistTo, "--env", "staging"], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(baseUrl, worker);
  const auth = await api(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  await seedModule(baseUrl, auth.token, "customers", scenarioData.seed.customers);
  await seedModule(baseUrl, auth.token, "inventory", scenarioData.seed.inventory);
  const verification = await verifyBackendScenarios(baseUrl, auth.token);

  browser = await chromium.launch({ headless: smoke, args: smoke ? [] : ["--start-maximized"] });
  const context = await browser.newContext(smoke ? { viewport: { width: 1920, height: 1080 } } : { viewport: null });
  await context.addInitScript(value => sessionStorage.setItem("nuttypaws_erp_v1_auth", JSON.stringify(value)), auth);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", message => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => browserErrors.push(`page: ${error.message}`));
  await page.goto(baseUrl);
  await verifyUiScenarios(page);

  await openModuleImport(page, "Inventory");
  await uploadFixture(page, "inventory-02-mixed-5-conflicts-5-new.xlsx", "mixed");
  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join("\n")}`);

  writeFileSync(resolve(fixtureDirectory, "verification-results.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    seeded: { customers: 30, inventory: 30 },
    scenarios: verification,
    databaseUnchangedAfterBlockedChecks: true,
    openScenario: "inventory-02-mixed-5-conflicts-5-new.xlsx",
  }, null, 2));

  console.log(`Conflict review ready: ${baseUrl}`);
  console.log(`Seeded: 30 Customers and 30 Inventory items`);
  console.log(`Open state: Inventory mixed file (5 existing SKUs + 5 new SKUs), whole import blocked`);
  console.log(`Fixtures: ${fixtureDirectory}`);
  if (smoke) return;
  await new Promise(resolveClosed => browser.once("disconnected", resolveClosed));
}

process.once("SIGINT", () => { cleanup().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { cleanup().finally(() => process.exit(0)); });

try {
  await main();
} finally {
  if (smoke) await cleanup();
}
