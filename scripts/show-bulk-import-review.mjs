import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { chromium } from "@playwright/test";
import { generateSampleAccountSql } from "./sample-accounts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const wranglerBin = resolve(repoRoot, "node_modules/wrangler/bin/wrangler.js");
const persistTo = ".tmp/bulk-import-review-v4";
const persistDirectory = resolve(repoRoot, persistTo);
const databaseName = "nut-house-portal-staging-db";
const adminEmail = "admin_demo_1@staging.nuthouse.local";
const adminPassword = "DemoAdmin123!";
const smoke = process.argv.includes("--smoke");
const visibleFixes = process.argv.includes("--visible-fixes");
const screenshotsDirectory = visibleFixes
  ? resolve(repoRoot, "../../../bulk-import/ui-ux-visible-fixes-2026-07-22/screenshots")
  : resolve(repoRoot, "../../../bulk-import/ui-ux-review-2026-07-22-create-only/screenshots");
const productHeaders = "sku,name,customer_name,status,production_room,size,size_unit,case_quantity,case_sticker,unit_price,kosher,allergen,allergen_details,daily_production_rate,notes";
const customerHeaders = "name,contact_name,contact_email,phone,status";

function productRow(sku, name) {
  return `${sku},${name},General,active,Room A,6,oz,10,Standard label,5.25,Yes,Yes,Tree nuts,240,Create-only review`;
}

function csv(...rows) {
  return `${productHeaders}\n${rows.join("\n")}\n`;
}

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} failed.\n${result.stdout || ""}${result.stderr || ""}`.trim());
}

function wrangler(args, label) {
  const result = spawnSync("npx", ["wrangler", ...args], { cwd: repoRoot, encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${label} failed.\n${result.stdout || ""}${result.stderr || ""}`.trim());
}

function wranglerSql(sql, label) {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "nut-house-bulk-review-"));
  const sqlFile = resolve(temporaryDirectory, "review.sql");
  try {
    writeFileSync(sqlFile, sql, { encoding: "utf8", mode: 0o600 });
    wrangler(["d1", "execute", databaseName, "--env", "staging", "--local", "--persist-to", persistTo, "--file", sqlFile], label);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function availablePort(start = 8794) {
  for (let port = start; port < start + 20; port += 1) {
    const free = await new Promise(resolveFree => {
      const server = createServer();
      server.once("error", () => resolveFree(false));
      server.once("listening", () => server.close(() => resolveFree(true)));
      server.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error("No free local review port was found between 8794 and 8813.");
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

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function importCommit(baseUrl, token, moduleName, rows) {
  const schema = await api(`${baseUrl}/api/imports/${moduleName}/schema`, { headers: { authorization: `Bearer ${token}` } });
  return api(`${baseUrl}/api/imports/${moduleName}/commit`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ headers: schema.columns.map(column => column.key), rows, rowNumbers: rows.map((_, index) => index + 2), sourceFileBytes: 100 }),
  });
}

async function seedReviewData(baseUrl) {
  const login = await api(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const existingRows = [
    { sku: "REVIEW-EXISTING-001", name: "Existing Review Product 1", customer_name: "General", status: "active", production_room: "Room A", size: "6", size_unit: "oz", case_quantity: "10", case_sticker: "Standard label", unit_price: "5.25", kosher: "Yes", allergen: "Yes", allergen_details: "Tree nuts", daily_production_rate: "240", notes: "Existing record" },
    { sku: "REVIEW-EXISTING-002", name: "Existing Review Product 2", customer_name: "General", status: "active", production_room: "Room A", size: "6", size_unit: "oz", case_quantity: "10", case_sticker: "Standard label", unit_price: "5.25", kosher: "Yes", allergen: "Yes", allergen_details: "Tree nuts", daily_production_rate: "240", notes: "Existing record" },
    ...Array.from({ length: 100 }, (_, index) => ({ sku: `REVIEW-CONFLICT-${String(index + 1).padStart(3, "0")}`, name: `Existing Conflict ${index + 1}`, customer_name: "General", status: "active", production_room: "Room A", size: "6", size_unit: "oz", case_quantity: "10", case_sticker: "Standard label", unit_price: "5.25", kosher: "Yes", allergen: "Yes", allergen_details: "Tree nuts", daily_production_rate: "240", notes: "Existing record" })),
  ];
  await importCommit(baseUrl, login.token, "products", existingRows);
  return login;
}

async function chooseFile(page, name, content) {
  await page.locator('.import-drop input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
}

async function openProductImport(page) {
  await page.getByRole("button", { name: /Products$/ }).click();
  await page.getByRole("button", { name: "Import CSV / Excel" }).click();
}

async function openCustomerImport(page) {
  await page.evaluate(() => openBulkImport("customers"));
}

async function closeImport(page) {
  await page.getByRole("button", { name: "Cancel" }).click();
}

async function screenshot(page, name) {
  if (!smoke) return;
  mkdirSync(screenshotsDirectory, { recursive: true });
  await page.screenshot({ path: resolve(screenshotsDirectory, name), fullPage: false });
}

async function assertFooterAndScroller(page) {
  const proof = await page.locator(".modal").evaluate(modal => {
    const scroll = modal.querySelector(".bulk-import-scroll");
    const footer = modal.querySelector(".import-footer-actions .btn-primary");
    const modalRect = modal.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return { overflowY: scroll ? getComputedStyle(scroll).overflowY : "", footerVisible: Boolean(footerRect && footerRect.top >= modalRect.top && footerRect.bottom <= modalRect.bottom) };
  });
  if (proof.overflowY !== "auto" || !proof.footerVisible) throw new Error(`Review scroller/footer is not usable: ${JSON.stringify(proof)}`);
}

let worker;
let browser;

async function cleanup() {
  if (browser?.isConnected()) await browser.close().catch(() => {});
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
}

async function main() {
  console.log("Preparing create-only bulk-import review states...");
  mkdirSync(persistDirectory, { recursive: true });
  runNode([resolve(repoRoot, "scripts/build-frontend-assets.mjs")], "Frontend build");
  wrangler(["d1", "migrations", "apply", databaseName, "--env", "staging", "--local", "--persist-to", persistTo], "Local migrations");
  wranglerSql(generateSampleAccountSql(adminPassword).replace(/^--.*$/gm, "").trim(), "Local demo-account seed");
  wranglerSql("DELETE FROM products WHERE sku LIKE 'REVIEW-%';", "Review data cleanup");

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [wranglerBin, "dev", "--local", "--port", String(port), "--persist-to", persistTo, "--env", "staging"], { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer(baseUrl, worker);
  const auth = await seedReviewData(baseUrl);
  browser = await chromium.launch({ headless: smoke });
  const context = await browser.newContext({ viewport: visibleFixes ? { width: 1234, height: 712 } : { width: 1920, height: 1080 } });
  await context.addInitScript(value => sessionStorage.setItem("nuttypaws_erp_v1_auth", JSON.stringify(value)), auth);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", message => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => browserErrors.push(`page: ${error.message}`));
  await page.goto(baseUrl);

  if (visibleFixes) {
    await openCustomerImport(page);
    await page.locator(".import-drop").waitFor();
    const emptyProof = await page.locator(".modal").evaluate(modal => {
      const drop = modal.querySelector(".import-drop");
      const dropStyle = drop ? getComputedStyle(drop) : null;
      return {
        height: modal.getBoundingClientRect().height,
        borderStyle: dropStyle?.borderTopStyle || "",
        borderColor: dropStyle?.borderTopColor || "",
        backgroundColor: dropStyle?.backgroundColor || "",
      };
    });
    if (emptyProof.height > 441 || emptyProof.borderStyle !== "dashed" || emptyProof.borderColor !== "rgb(201, 191, 174)" || emptyProof.backgroundColor !== "rgb(250, 243, 227)") {
      throw new Error(`Empty import presentation is not fixed: ${JSON.stringify(emptyProof)}`);
    }
    await screenshot(page, "E01-customers-empty-import-fixed.png");
    await closeImport(page);

    await openCustomerImport(page);
    await page.locator('.import-drop input[type="file"]').setInputFiles({ name: "unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("not a supported import") });
    await page.getByText("Choose a .csv or .xlsx file.", { exact: true }).waitFor();
    const errorBorder = await page.locator(".import-errors").evaluate(element => getComputedStyle(element).borderTopStyle);
    if (errorBorder !== "solid") throw new Error(`Unsupported-file panel boundary is missing: ${errorBorder}`);
    await screenshot(page, "E05-customers-unsupported-file-fixed.png");
    await closeImport(page);

    await openCustomerImport(page);
    await page.locator(".import-guide summary").click();
    await page.getByText(/first worksheet even if it has been renamed/i).waitFor();
    await page.getByText(/Use pasted values only; formulas are rejected/i).waitFor();
    await screenshot(page, "E06-customers-expanded-guide-fixed.png");
    await closeImport(page);

    await page.setViewportSize({ width: 625, height: 703 });
    await openCustomerImport(page);
    await chooseFile(page, "invalid-customer.csv", `${customerHeaders}\nVisible Fix Customer,Test Contact,not-an-email,555-0100,active\n`);
    await page.getByText("Contact Email", { exact: true }).waitFor();
    const renderedColumn = await page.locator(".import-errors tbody tr td").nth(1).textContent();
    const renderedError = await page.locator(".import-errors tbody tr td").nth(2).textContent();
    if (renderedColumn?.trim() !== "Contact Email" || renderedError?.includes("contact_email")) throw new Error(`Raw validation key is still visible: ${renderedColumn} / ${renderedError}`);
    await screenshot(page, "E08-customers-friendly-field-label-fixed.png");
    await closeImport(page);
    await page.setViewportSize({ width: 1234, height: 712 });
  }

  await openProductImport(page);
  await chooseFile(page, "all-new-products.csv", csv(productRow("REVIEW-NEW-001", "New Review Product 1"), productRow("REVIEW-NEW-002", "New Review Product 2")));
  await page.getByText("Ready to import", { exact: true }).waitFor();
  await page.getByText("New records (2)", { exact: true }).waitFor();
  const allNewCounts = await page.locator(".import-summary-count").allTextContents();
  if (JSON.stringify(allNewCounts.map(text => text.replace(/\s+/g, ""))) !== JSON.stringify(["2rows", "2newrecords", "0issues"])) throw new Error(`Unexpected all-new summary: ${JSON.stringify(allNewCounts)}`);
  if (await page.locator(".import-summary-count.is-update").count()) throw new Error("The all-new review still shows a removed summary control.");
  await assertFooterAndScroller(page);
  await screenshot(page, "01-products-all-new.png");
  await closeImport(page);

  await openProductImport(page);
  const mixedRows = visibleFixes
    ? [
        ...Array.from({ length: 5 }, (_, index) => productRow(`REVIEW-CONFLICT-${String(index + 1).padStart(3, "0")}`, `Existing Conflict ${index + 1}`)),
        ...Array.from({ length: 5 }, (_, index) => productRow(`REVIEW-VISIBLE-NEW-${String(index + 1).padStart(3, "0")}`, `New Review Product ${index + 1}`)),
      ]
    : [productRow("REVIEW-EXISTING-001", "Existing Review Product 1"), productRow("REVIEW-NEW-003", "New Review Product 3")];
  await chooseFile(page, "mixed-new-existing-products.csv", csv(...mixedRows));
  await page.getByText("Existing records block this import", { exact: true }).waitFor();
  await page.locator(".import-existing-record-blocker").getByText(visibleFixes ? "REVIEW-CONFLICT-001" : "REVIEW-EXISTING-001", { exact: true }).waitFor();
  await page.getByText(visibleFixes
    ? "The other 5 rows have no reported issues, but they were also held because the entire file must pass."
    : "The other 1 row has no reported issues, but it was also held because the entire file must pass.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Import all rows" }).isDisabled().then(disabled => { if (!disabled) throw new Error("Mixed existing records did not disable import."); });
  await screenshot(page, visibleFixes ? "E02-products-mixed-existing-fixed.png" : "02-products-mixed-existing.png");
  await closeImport(page);

  await openProductImport(page);
  await chooseFile(page, "all-existing-products.csv", csv(productRow("REVIEW-EXISTING-001", "Existing Review Product 1"), productRow("REVIEW-EXISTING-002", "Existing Review Product 2")));
  await page.getByText("Existing records block this import", { exact: true }).waitFor();
  await page.getByText("View existing records (2)", { exact: true }).waitFor();
  await screenshot(page, "03-products-all-existing.png");
  await closeImport(page);

  await openProductImport(page);
  await chooseFile(page, "large-existing-products.csv", csv(...Array.from({ length: 100 }, (_, index) => productRow(`REVIEW-CONFLICT-${String(index + 1).padStart(3, "0")}`, `Existing Conflict ${index + 1}`))));
  await page.getByText("View existing records (100)", { exact: true }).waitFor();
  const details = page.locator(".import-existing-record-blocker details");
  if (await details.getAttribute("open")) throw new Error("Large existing-record list should start collapsed.");
  await assertFooterAndScroller(page);
  await screenshot(page, "04-products-large-existing-collapsed.png");
  await details.locator("summary").click();
  await page.locator(".bulk-import-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await assertFooterAndScroller(page);
  await screenshot(page, "05-products-large-existing-expanded-footer.png");

  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join("\n")}`);
  console.log(`Create-only review ready: ${baseUrl}`);
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
