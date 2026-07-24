import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type ImportColumn = { key: string; label: string; required?: boolean; description: string; validation?: { kind?: string } };
type ImportSchema = { module: string; label: string; keyColumn: string; maxRows: number; maxFileBytes: number; columns: ImportColumn[] };

const adminEmail = "inventory-e2e-admin@example.com";
const adminPassword = "InventoryE2E123!";

async function loginAdmin(request: APIRequestContext) {
  const setup = await request.get("/api/auth/setup-status");
  const setupBody = await setup.json() as { data: { needsSetup: boolean } };
  if (setupBody.data.needsSetup) {
    const created = await request.post("/api/auth/setup", { data: { email: adminEmail, password: adminPassword, displayName: "Bulk Import Create-Only" } });
    expect(created.ok(), await created.text()).toBe(true);
  }
  const login = await request.post("/api/auth/login", { data: { email: adminEmail, password: adminPassword } });
  expect(login.ok(), await login.text()).toBe(true);
  return (await login.json() as { data: { token: string; user: unknown; roles?: string[] } }).data;
}

async function getSchema(request: APIRequestContext, token: string, moduleName: string) {
  const response = await request.get(`/api/imports/${moduleName}/schema`, { headers: { authorization: `Bearer ${token}` } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json() as { data: ImportSchema }).data;
}

async function importCall(request: APIRequestContext, token: string, importSchema: ImportSchema, operation: "preview" | "commit", rows: Array<Record<string, unknown>>, rowNumbers = rows.map((_, index) => index + 2)) {
  return request.post(`/api/imports/${importSchema.module}/${operation}`, {
    headers: { authorization: `Bearer ${token}` },
    data: { headers: importSchema.columns.map(column => column.key), rows, rowNumbers, sourceFileBytes: 100 },
  });
}

const productSchema: ImportSchema = {
  module: "products",
  label: "Products",
  keyColumn: "sku",
  maxRows: 500,
  maxFileBytes: 5_000_000,
  columns: [
    { key: "sku", label: "SKU", required: true, description: "Product SKU", validation: { kind: "identifier" } },
    { key: "name", label: "Name", required: true, description: "Product name" },
  ],
};

const customerSchema: ImportSchema = {
  module: "customers",
  label: "Customers",
  keyColumn: "name",
  maxRows: 500,
  maxFileBytes: 5_000_000,
  columns: [
    { key: "name", label: "Customer Name", required: true, description: "Customer name", validation: { kind: "identifier" } },
    { key: "contact_email", label: "Contact Email", description: "Primary contact email" },
  ],
};

async function loadImportFunctions(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof (globalThis as unknown as { renderBulkImportModal?: unknown }).renderBulkImportModal === "function");
}

async function renderPreview(page: Page, preview: Record<string, unknown>, sourceFileName = "products.csv", schema: ImportSchema = productSchema) {
  await page.evaluate(({ schema, state, fileName }) => {
    bulkImportState.module = schema.module;
    bulkImportState.schema = schema;
    bulkImportState.sourceFileName = fileName;
    bulkImportState.busy = false;
    bulkImportState.preview = state;
    bulkImportState.errorRowLimits = {};
    document.querySelector(".modal")?.classList.add("stitch-modal", "bulk-import-modal");
    document.getElementById("modal")?.classList.add("open");
    renderBulkImportModal();
  }, { schema: productSchema, state: preview, fileName: sourceFileName });
}

async function assertFooterAndScroller(page: Page) {
  const proof = await page.locator(".modal").evaluate(modal => {
    const scroll = modal.querySelector(".bulk-import-scroll");
    const footer = modal.querySelector(".import-footer-actions .btn-primary");
    const modalRect = modal.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      overflowY: scroll ? getComputedStyle(scroll).overflowY : "",
      footerVisible: Boolean(footerRect && footerRect.top >= modalRect.top && footerRect.bottom <= modalRect.bottom),
    };
  });
  expect(proof).toEqual({ overflowY: "auto", footerVisible: true });
}

async function assertModalViewportBounds(page: Page) {
  const bounds = await page.locator(".modal").evaluate(modal => {
    const rect = modal.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
      modalBottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(39);
  expect(bounds.bottom).toBeGreaterThanOrEqual(39);
  expect(Math.abs(bounds.top - bounds.bottom)).toBeLessThanOrEqual(1);
  expect(bounds.modalBottom).toBeLessThanOrEqual(bounds.viewportHeight - 39);
}

test.describe("bulk import create-only browser hardening", () => {
  test("shows an all-new preview with neutral total, green new records, and no update UI", async ({ page }) => {
    await loadImportFunctions(page);
    await renderPreview(page, {
      module: "products",
      valid: true,
      totalRows: 2,
      creates: 2,
      records: [{ row: 2, key: "NEW-001" }, { row: 3, key: "NEW-002" }],
      errors: [],
    }, "all-new-products.csv");

    await expect(page.locator(".import-selected-file")).toHaveText("Selected file: all-new-products.csv");
    await expect(page.locator(".import-summary-count")).toHaveText(["2rows", "2new records", "0issues"]);
    await expect(page.locator(".import-summary-count").nth(0)).toHaveCSS("color", "rgb(26, 26, 26)");
    await expect(page.locator(".import-summary-count").nth(1)).toHaveCSS("color", "rgb(74, 124, 68)");
    await expect(page.locator(".import-summary-count").nth(2)).toHaveCSS("color", "rgb(178, 58, 58)");
    await expect(page.locator(".import-new-records")).toContainText("New records (2)");
    await expect(page.locator(".import-create-identifiers code")).toHaveText(["NEW-001", "NEW-002"]);
    await expect(page.getByText(/Updates/i)).toHaveCount(0);
    await expect(page.locator(".import-footer-actions .btn-primary")).toBeEnabled();
    await assertFooterAndScroller(page);
    await assertModalViewportBounds(page);
  });

  test("blocks mixed new and existing records with the exact identifier and physical row", async ({ page }) => {
    await loadImportFunctions(page);
    await renderPreview(page, {
      module: "products",
      valid: false,
      totalRows: 2,
      creates: 0,
      records: [],
      errors: [
        { row: 4, field: "sku", code: "IMPORT_RECORD_EXISTS", recordKey: "SKU-EXISTING", message: "This Product SKU already exists. Imports only add new records and cannot change existing records." },
      ],
    }, "mixed-products.csv");

    await expect(page.getByText("Nothing has been imported", { exact: true })).toBeVisible();
    await expect(page.locator(".import-existing-record-blocker")).toContainText("Existing records block this import");
    await expect(page.locator(".import-existing-record-list tbody tr")).toHaveCount(1);
    await expect(page.locator(".import-existing-record-list tbody tr")).toContainText("4");
    await expect(page.locator(".import-existing-record-list tbody tr")).toContainText("SKU-EXISTING");
    await expect(page.locator(".import-held-row-note")).toHaveText("The other 1 row has no reported issues, but it was also held because the entire file must pass.");
    await expect(page.locator(".import-footer-actions .btn-primary")).toBeDisabled();
    await assertFooterAndScroller(page);
  });

  test("shows a bounded drop surface, compact empty state, and friendly validation labels", async ({ page }) => {
    await loadImportFunctions(page);
    await page.evaluate(schema => {
      bulkImportState.module = schema.module;
      bulkImportState.schema = schema;
      bulkImportState.sourceFileName = "";
      bulkImportState.busy = false;
      bulkImportState.preview = null;
      document.querySelector(".modal")?.classList.add("stitch-modal", "bulk-import-modal");
      document.getElementById("modal")?.classList.add("open");
      renderBulkImportModal();
    }, customerSchema);

    await expect(page.locator(".import-drop")).toHaveCSS("border-top-style", "dashed");
    await expect(page.locator(".import-drop")).toHaveCSS("border-top-color", "rgb(201, 191, 174)");
    await expect(page.locator(".import-drop")).toHaveCSS("background-color", "rgb(250, 243, 227)");
    const emptyHeight = await page.locator(".modal").evaluate(modal => modal.getBoundingClientRect().height);
    expect(emptyHeight).toBeLessThanOrEqual(441);

    await renderPreview(page, {
      module: "customers",
      valid: false,
      totalRows: 1,
      creates: 0,
      records: [],
      errors: [{ row: 2, field: "contact_email", message: "Enter a valid email address." }],
    }, "invalid-customer.csv", customerSchema);
    await expect(page.locator(".import-errors tbody tr td").nth(1)).toHaveText("Contact Email");
    await expect(page.locator(".import-errors tbody tr td").nth(2)).toHaveText("Enter a valid email address.");
    await expect(page.locator(".import-errors")).not.toContainText("contact_email");
    await expect(page.locator(".import-errors")).toHaveCSS("border-top-style", "solid");
  });

  test("keeps all-existing and large existing conflicts readable without nested scrolling", async ({ page }) => {
    await loadImportFunctions(page);
    await renderPreview(page, {
      module: "products",
      valid: false,
      totalRows: 2,
      creates: 0,
      records: [],
      errors: [
        { row: 2, field: "sku", code: "IMPORT_RECORD_EXISTS", recordKey: "SKU-001", message: "This Product SKU already exists." },
        { row: 3, field: "sku", code: "IMPORT_RECORD_EXISTS", recordKey: "SKU-002", message: "This Product SKU already exists." },
      ],
    });
    await expect(page.locator(".import-existing-record-list tbody tr")).toHaveCount(2);
    await expect(page.getByText("View existing records (2)", { exact: true })).toBeVisible();

    await renderPreview(page, {
      module: "products",
      valid: false,
      totalRows: 100,
      creates: 0,
      records: [],
      errors: Array.from({ length: 100 }, (_, index) => ({
        row: index + 2,
        field: "sku",
        code: "IMPORT_RECORD_EXISTS",
        recordKey: `SKU-${index + 1}`,
        message: "This Product SKU already exists.",
      })),
    }, "large-existing-products.csv");
    const details = page.locator(".import-existing-record-blocker details");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(page.locator(".import-existing-record-list tbody tr")).toHaveCount(50);
    await expect(page.getByRole("button", { name: "Show 50 more rows" })).toBeVisible();
    await page.getByRole("button", { name: "Show 50 more rows" }).click();
    await expect(page.locator(".import-existing-record-list tbody tr")).toHaveCount(100);
    await expect(page.locator("#importExistingRecordsSummary")).toBeFocused();
    await expect(page.locator(".import-existing-record-list")).toHaveCSS("overflow-y", "visible");
    await details.locator("summary").click();
    await page.setViewportSize({ width: 1100, height: 560 });
    await page.locator(".bulk-import-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await assertFooterAndScroller(page);
    await assertModalViewportBounds(page);
  });

  test("makes the guide and workbook instructions explicitly create-only", async ({ page }) => {
    await loadImportFunctions(page);
    await renderPreview(page, { module: "products", valid: false, totalRows: 0, creates: 0, records: [], errors: [] });
    await page.locator(".import-guide > summary").click();
    await expect(page.locator(".import-guide")).toContainText("add new records only");
    await expect(page.locator(".import-guide")).toContainText("Edit existing records in the portal");
    const workbookStrings = await page.evaluate(async schema => {
      const workbook = await buildGuidedImportWorkbook(schema);
      const zip = await JSZip.loadAsync(await workbook.arrayBuffer());
      const xml = await zip.file("xl/sharedStrings.xml")?.async("string");
      return xml || "";
    }, productSchema);
    expect(workbookStrings).toContain("new records only");
    expect(workbookStrings).toContain("existing matching record blocks the whole file");
  });

  test("previews a CSV dropped onto the shared import target", async ({ page, request }) => {
    const auth = await loginAdmin(request);
    const suffix = crypto.randomUUID().slice(0, 8);
    const name = `Dropped Customer ${suffix}`;
    await page.addInitScript(value => sessionStorage.setItem("nuttypaws_erp_v1_auth", JSON.stringify(value)), auth);
    await page.goto("/");
    await page.waitForFunction(() => typeof (globalThis as unknown as { openBulkImport?: unknown }).openBulkImport === "function");
    await page.evaluate(() => openBulkImport("customers"));

    const dragState = await page.locator(".import-drop").evaluate((target, csv) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], "dropped-customer.csv", { type: "text/csv" }));
      target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const activeDuringDrag = target.classList.contains("is-dragover");
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return { activeDuringDrag, activeAfterDrop: target.classList.contains("is-dragover") };
    }, `name,contact_name,contact_email,phone,status\n${name},Drop Contact,${suffix}@example.com,555-0102,active\n`);

    expect(dragState).toEqual({ activeDuringDrag: true, activeAfterDrop: false });
    await expect(page.locator(".import-selected-file")).toHaveText("Selected file: dropped-customer.csv");
    await expect(page.getByText("Ready to import", { exact: true })).toBeVisible();
    await expect(page.locator(".import-new-records")).toContainText(name);
  });

  test("keeps CSV/XLSX previews equivalent and preserves physical rows", async ({ page, request }) => {
    const auth = await loginAdmin(request);
    const customerSchema = await getSchema(request, auth.token, "customers");
    await loadImportFunctions(page);
    const parsed = await page.evaluate(async schema => {
      const matrix = [
        schema.columns.map(column => column.key),
        ["Parity Customer", "Jane Doe", "jane@example.com", "555-0101", "active"],
      ];
      const csv = parseCanonicalCsv(matrixToCsv(matrix));
      const workbook = await writeXlsxFile([{ data: matrix.map(row => row.map(value => ({ value }))), sheet: "Import Data" }]).toBlob();
      const firstSheet = await readFirstExcelSheet(new File([workbook], "parity.xlsx"));
      const xlsx = parseCanonicalCsv(matrixToCsv(firstSheet), firstSheet.map((_, index) => index + 1));
      const normalize = (value: { rows: unknown[][]; rowNumbers: number[] }) => {
        const headers = value.rows[0].map(cell => String(cell ?? "").trim().toLowerCase());
        const dataRows = value.rows.slice(1).map((row, index) => ({ row, rowNumber: value.rowNumbers[index + 1] }))
          .filter(record => record.row.some(cell => String(cell ?? "").trim() !== ""));
        return {
          headers,
          rows: dataRows.map(record => Object.fromEntries(headers.map((header, index) => [header, record.row[index] ?? ""]))),
          rowNumbers: dataRows.map(record => record.rowNumber),
        };
      };
      const physicalCsv = parseCanonicalCsv("name,contact_name,contact_email,phone,status\nPhysical One,,,,active\n\nPhysical Two,,,,active\n");
      return { csv: normalize(csv), xlsx: normalize(xlsx), physical: normalize(physicalCsv) };
    }, customerSchema);
    expect(parsed.xlsx).toEqual(parsed.csv);
    expect(parsed.physical.rowNumbers).toEqual([2, 4]);
    const [csvPreview, xlsxPreview] = await Promise.all([
      request.post("/api/imports/customers/preview", { headers: { authorization: `Bearer ${auth.token}` }, data: { ...parsed.csv, sourceFileBytes: 100 } }),
      request.post("/api/imports/customers/preview", { headers: { authorization: `Bearer ${auth.token}` }, data: { ...parsed.xlsx, sourceFileBytes: 100 } }),
    ]);
    expect(csvPreview.ok(), await csvPreview.text()).toBe(true);
    expect(xlsxPreview.ok(), await xlsxPreview.text()).toBe(true);
    expect((await xlsxPreview.json()).data).toEqual((await csvPreview.json()).data);
    const physicalPreview = await request.post("/api/imports/customers/preview", { headers: { authorization: `Bearer ${auth.token}` }, data: { ...parsed.physical, sourceFileBytes: 100 } });
    expect(physicalPreview.ok(), await physicalPreview.text()).toBe(true);
    expect((await physicalPreview.json()).data.records).toEqual([{ row: 2, key: "Physical One" }, { row: 4, key: "Physical Two" }]);
  });

  test("reads only worksheet one and rejects first-sheet formulas or corrupt files", async ({ page }) => {
    await loadImportFunctions(page);
    const result = await page.evaluate(async () => {
      const base = await writeXlsxFile([
        { data: [[{ value: "name" }], [{ value: "First sheet" }]], sheet: "Import Data" },
        { data: [[{ value: "name" }], [{ value: "Later sentinel" }]], sheet: "Later Data" },
      ]).toBlob();
      const laterRows = await readFirstExcelSheet(new File([base], "later.xlsx"));
      const zip = await JSZip.loadAsync(await base.arrayBuffer());
      const firstEntry = zip.file("xl/worksheets/sheet1.xml");
      if (!firstEntry) throw new Error("First worksheet fixture is missing");
      const firstXml = await firstEntry.async("string");
      zip.file("xl/worksheets/sheet1.xml", firstXml.replace(/(<c\b[^>]*>)/, "$1<f>1+1</f>"));
      let formulaError = "";
      try { await readFirstExcelSheet(new File([await zip.generateAsync({ type: "blob" })], "formula.xlsx")); } catch (error) { formulaError = error instanceof Error ? error.message : String(error); }
      let corruptError = "";
      try { await readFirstExcelSheet(new File(["not a zip"], "corrupt.xlsx")); } catch (error) { corruptError = error instanceof Error ? error.message : String(error); }
      return { laterRows, formulaError, corruptError };
    });
    expect(result.laterRows).toEqual([["name"], ["First sheet"]]);
    expect(JSON.stringify(result.laterRows)).not.toContain("Later sentinel");
    expect(result.formulaError).toContain("first Excel sheet contains a formula");
    expect(result.corruptError).toContain("Excel file could not be read");
  });

  test("blocks hidden spreadsheet data, hidden worksheet one, and numeric identifiers", async ({ page }) => {
    await loadImportFunctions(page);
    const result = await page.evaluate(async schema => {
      const makeWorkbook = () => writeXlsxFile([{
        data: [
          [{ value: "sku" }, { value: "name" }],
          [{ value: "001234" }, { value: "Text SKU" }],
        ],
        sheet: "July Upload",
      }]).toBlob();
      const errors: Record<string, string> = {};

      const hiddenRowZip = await JSZip.loadAsync(await (await makeWorkbook()).arrayBuffer());
      const hiddenRowEntry = hiddenRowZip.file("xl/worksheets/sheet1.xml");
      if (!hiddenRowEntry) throw new Error("Hidden-row fixture is missing");
      hiddenRowZip.file("xl/worksheets/sheet1.xml", (await hiddenRowEntry.async("string")).replace(/<row r="2"/, '<row r="2" hidden="1"'));
      try { await readFirstExcelSheet(new File([await hiddenRowZip.generateAsync({ type: "blob" })], "hidden-row.xlsx"), 500, schema); }
      catch (error) { errors.hiddenRow = error instanceof Error ? error.message : String(error); }

      const hiddenSheetZip = await JSZip.loadAsync(await (await makeWorkbook()).arrayBuffer());
      const workbookEntry = hiddenSheetZip.file("xl/workbook.xml");
      if (!workbookEntry) throw new Error("Workbook fixture is missing");
      hiddenSheetZip.file("xl/workbook.xml", (await workbookEntry.async("string")).replace("<sheet ", '<sheet state="hidden" '));
      try { await readFirstExcelSheet(new File([await hiddenSheetZip.generateAsync({ type: "blob" })], "hidden-sheet.xlsx"), 500, schema); }
      catch (error) { errors.hiddenSheet = error instanceof Error ? error.message : String(error); }

      const numeric = await writeXlsxFile([{
        data: [
          [{ value: "sku" }, { value: "name" }],
          [{ value: 1234567890123456 }, { value: "Rounded numeric SKU" }],
        ],
        sheet: "July Upload",
      }]).toBlob();
      try { await readFirstExcelSheet(new File([numeric], "numeric-sku.xlsx"), 500, schema); }
      catch (error) { errors.numeric = error instanceof Error ? error.message : String(error); }

      const visible = await readFirstExcelSheet(new File([await makeWorkbook()], "visible.xlsx"), 500, schema);
      return { errors, visible, worksheetName: (visible as unknown as { worksheetName?: string }).worksheetName };
    }, productSchema);

    expect(result.errors.hiddenRow).toContain("1 nonblank hidden or filtered-out row (2)");
    expect(result.errors.hiddenSheet).toContain('first Excel worksheet "July Upload" is hidden');
    expect(result.errors.numeric).toContain("Excel row 2, column A (sku) uses a numeric cell");
    expect(result.errors.numeric).toContain("Format identifier and relationship-name columns as Text");
    expect(result.visible).toEqual([["sku", "name"], ["001234", "Text SKU"]]);
    expect(result.worksheetName).toBe("July Upload");
  });

  test("formats guided identifier columns as Text and ignores an unused filter control", async ({ page }) => {
    await loadImportFunctions(page);
    const result = await page.evaluate(async schema => {
      const guided = await buildGuidedImportWorkbook(schema);
      const guidedZip = await JSZip.loadAsync(await guided.arrayBuffer());
      const guidedSheet = await guidedZip.file("xl/worksheets/sheet1.xml")?.async("string") || "";
      const styles = await guidedZip.file("xl/styles.xml")?.async("string") || "";

      const normal = await writeXlsxFile([{
        data: [[{ value: "sku" }, { value: "name" }], [{ value: "TEXT-001" }, { value: "Visible row" }]],
        sheet: "Import Data",
      }]).toBlob();
      const filterZip = await JSZip.loadAsync(await normal.arrayBuffer());
      const filterEntry = filterZip.file("xl/worksheets/sheet1.xml");
      if (!filterEntry) throw new Error("Filter fixture is missing");
      filterZip.file("xl/worksheets/sheet1.xml", (await filterEntry.async("string")).replace("</worksheet>", '<autoFilter ref="A1:B2"/></worksheet>'));
      const rows = await readFirstExcelSheet(new File([await filterZip.generateAsync({ type: "blob" })], "unused-filter.xlsx"), 500, schema);
      return { guidedSheet, styles, rows };
    }, productSchema);

    expect(result.guidedSheet).toMatch(/<col min="1" max="1"[^>]* style="\d+"/);
    expect(result.styles).toContain('numFmtId="49"');
    expect(result.rows).toEqual([["sku", "name"], ["TEXT-001", "Visible row"]]);
  });

  test("blocks CSV column drift from an unquoted comma while accepting a quoted comma", async ({ page }) => {
    await loadImportFunctions(page);
    await page.route("**/api/imports/customers/preview", async route => {
      const body = route.request().postDataJSON() as { rows: Array<{ name?: string }> };
      const key = body.rows[0]?.name || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { module: "customers", valid: true, totalRows: 1, creates: 1, records: [{ row: 2, key }], errors: [] } }),
      });
    });
    await page.evaluate(schema => {
      bulkImportState.module = schema.module;
      bulkImportState.schema = schema;
      document.getElementById("modal")?.classList.add("open");
      renderBulkImportModal();
    }, customerSchema);

    await page.evaluate(async () => handleImportFile(new File(["name,contact_email\nAcme, Inc,\n"], "unquoted.csv", { type: "text/csv" })));
    await expect(page.getByText("Nothing has been imported", { exact: true })).toBeVisible();
    await expect(page.locator(".import-errors")).toContainText("commas inside a value must be enclosed in double quotes");
    await expect(page.getByRole("button", { name: "Import all rows" })).toBeDisabled();

    await page.evaluate(async () => handleImportFile(new File(['name,contact_email\n"Acme, Inc",\n'], "quoted.csv", { type: "text/csv" })));
    await expect(page.getByText("Ready to import", { exact: true })).toBeVisible();
    await expect(page.locator(".import-create-identifiers")).toContainText("Acme, Inc");
  });

  test("continues to read generated workbooks with blank string cells", async ({ page }) => {
    await loadImportFunctions(page);
    const result = await page.evaluate(async () => {
      const workbook = await writeXlsxFile([{ data: [[{ value: "name" }], [{ value: "Blank string safe" }]], sheet: "Import Data" }]).toBlob();
      const zip = await JSZip.loadAsync(await workbook.arrayBuffer());
      const entry = zip.file("xl/worksheets/sheet1.xml");
      if (!entry) throw new Error("First worksheet fixture is missing");
      const xml = await entry.async("string");
      zip.file("xl/worksheets/sheet1.xml", xml.replace(/(<\/x:row>)/, '<x:c r="B1" t="str" />$1'));
      const mutated = new File([await zip.generateAsync({ type: "blob" })], "blank-string.xlsx");
      try { return { rows: await readFirstExcelSheet(mutated, 500), error: "" }; } catch (error) { return { rows: [], error: error instanceof Error ? error.message : String(error) }; }
    });
    expect(result.error).toBe("");
    expect(result.rows).toContainEqual(["name"]);
  });

  test("stops files at the 501st nonblank data row before previewing", async ({ page }) => {
    await loadImportFunctions(page);
    const result = await page.evaluate(async () => {
      const csv = `name\n${Array.from({ length: 501 }, (_, index) => `Customer ${index + 1}`).join("\n")}`;
      let csvError = "";
      try { parseCanonicalCsv(csv, undefined, 500); } catch (error) { csvError = error instanceof Error ? error.message : String(error); }
      const rows = [["name"], ...Array.from({ length: 501 }, (_, index) => [`Customer ${index + 1}`])];
      const workbook = await writeXlsxFile([{ data: rows.map(row => row.map(value => ({ value }))), sheet: "Import Data" }]).toBlob();
      let xlsxError = "";
      try { await readFirstExcelSheet(new File([workbook], "too-many.xlsx"), 500); } catch (error) { xlsxError = error instanceof Error ? error.message : String(error); }
      return { csvError, xlsxError };
    });
    expect(result.csvError).toContain("more than 500 nonblank data rows");
    expect(result.xlsxError).toContain("more than 500 nonblank data rows");
  });

  test("rejects compressed Excel expansion before the workbook parser runs", async ({ page }) => {
    await loadImportFunctions(page);
    const error = await page.evaluate(async () => {
      const workbook = await writeXlsxFile([{ data: [[{ value: "name" }], [{ value: "Safe row" }]], sheet: "Import Data" }]).toBlob();
      const zip = await JSZip.loadAsync(await workbook.arrayBuffer());
      zip.file("xl/media/compressed-padding.txt", "x".repeat(1_000_000));
      const inflated = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      try { await readFirstExcelSheet(new File([inflated], "inflated.xlsx"), 500); return ""; } catch (error) { return error instanceof Error ? error.message : String(error); }
    });
    expect(error).toContain("expands too much to import safely");
  });

  test("restores focus and announces the finished preview", async ({ page }) => {
    await loadImportFunctions(page);
    await page.route("**/api/imports/customers/preview", async route => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { module: "customers", valid: true, totalRows: 1, creates: 1, records: [{ row: 2, key: "Focusable Customer" }], errors: [] } }) });
    });
    await page.evaluate(async schema => {
      bulkImportState.module = "customers";
      bulkImportState.schema = schema;
      document.querySelector(".modal")?.classList.add("stitch-modal", "bulk-import-modal");
      document.getElementById("modal")?.classList.add("open");
      await handleImportFile(new File(["name\nFocusable Customer\n"], "focus.csv", { type: "text/csv" }));
    }, customerSchema);
    await expect(page.locator("#importPreviewSummary")).toBeFocused();
    await expect(page.locator("#importLiveStatus")).toHaveText("Import preview ready. 1 row, 1 new record, 0 issues.");
  });

  test("keeps the newest file selection when an older preview resolves last", async ({ page, request }) => {
    const auth = await loginAdmin(request);
    const customerSchema = await getSchema(request, auth.token, "customers");
    await page.route("**/api/imports/customers/preview", async route => {
      const body = route.request().postDataJSON() as { rows: Array<{ name?: string }> };
      const name = body.rows[0]?.name || "";
      if (name === "Older Selection") await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { module: "customers", valid: true, totalRows: 1, creates: 1, records: [{ row: 2, key: name }], errors: [] } }) });
    });
    await loadImportFunctions(page);
    const state = await page.evaluate(async schema => {
      bulkImportState.module = "customers";
      bulkImportState.schema = schema;
      const headers = schema.columns.map(column => column.key).join(",");
      const older = handleImportFile(new File([`${headers}\nOlder Selection,,,,active\n`], "older.csv"));
      await new Promise(resolve => setTimeout(resolve, 40));
      const newer = handleImportFile(new File([`${headers}\nNewer Selection,,,,active\n`], "newer.csv"));
      await Promise.all([older, newer]);
      return { sourceFileName: bulkImportState.sourceFileName, firstName: bulkImportState.rows[0]?.name, previewKey: bulkImportState.preview?.records?.[0]?.key };
    }, customerSchema);
    expect(state).toEqual({ sourceFileName: "newer.csv", firstName: "Newer Selection", previewKey: "Newer Selection" });
  });

  test("builds create-only Guides and Instructions for every import module", async ({ page, request }) => {
    const auth = await loginAdmin(request);
    await loadImportFunctions(page);
    for (const moduleName of ["customers", "products", "suppliers", "inventory"]) {
      const importSchema = await getSchema(request, auth.token, moduleName);
      const result = await page.evaluate(async schema => {
        bulkImportState.module = schema.module;
        bulkImportState.schema = schema;
        bulkImportState.preview = { valid: false, totalRows: 0, creates: 0, records: [], errors: [] };
        renderBulkImportModal();
        const guide = document.querySelector(".import-guide")?.textContent || "";
        const workbook = await buildGuidedImportWorkbook(schema);
        const zip = await JSZip.loadAsync(await workbook.arrayBuffer());
        return { guide, sharedStrings: await zip.file("xl/sharedStrings.xml")?.async("string") || "", workbookXml: await zip.file("xl/workbook.xml")?.async("string") || "" };
      }, importSchema);
      expect(result.guide, moduleName).toContain("add new records only");
      expect(result.guide, moduleName).toContain("Edit existing records in the portal");
      expect(result.guide, moduleName).toContain("first worksheet even if it has been renamed");
      expect(result.guide, moduleName).toContain("Use pasted values only; formulas are rejected");
      expect(result.sharedStrings, moduleName).toContain("new records only");
      expect(result.sharedStrings, moduleName).toContain("existing matching record blocks the whole file");
      expect(result.sharedStrings, moduleName).toContain("it may be renamed, but it must remain the first worksheet");
      expect(result.sharedStrings, moduleName).toContain("Formulas are rejected");
      if (moduleName === "inventory") expect(result.sharedStrings).toContain("Use one row per new SKU");
      expect(result.workbookXml, moduleName).toContain("Import Data");
      expect(result.workbookXml, moduleName).toContain("Instructions");
    }
  });

  test("creates, commits, reloads, and then blocks existing targets for every module", async ({ request }) => {
    const auth = await loginAdmin(request);
    const token = auth.token;
    const schemas = Object.fromEntries(await Promise.all(["customers", "products", "suppliers", "inventory"].map(async moduleName => [moduleName, await getSchema(request, token, moduleName)]))) as Record<string, ImportSchema>;
    const suffix = crypto.randomUUID().slice(0, 8);
    const customerName = `Create Only Customer ${suffix}`;
    const supplierName = `Create Only Supplier ${suffix}`;
    const rows: Record<string, Record<string, unknown>> = {
      customers: { name: customerName, contact_name: "Original Contact", contact_email: `customer-${suffix}@example.com`, phone: "555-0100", status: "active" },
      suppliers: { name: supplierName, contact_name: "Original Supplier", email: `supplier-${suffix}@example.com`, phone: "555-0200", website: "https://example.com", moq: "25.5", notes: "Original supplier note" },
      products: { sku: `CREATE-${suffix}`, name: "Original Product", customer_name: customerName, status: "active", size: "12", size_unit: "oz", case_quantity: "24", unit_price: "4.25", kosher: "Yes", allergen: "No", daily_production_rate: "500" },
      inventory: { sku: `CREATE-INV-${suffix}`, name: "Original Ingredient", category: "Ingredient", unit_of_measure: "lbs", customer_name: customerName, supplier_name: supplierName, on_hand_quantity: "25.5", reorder_point_quantity: "5.5", unit_cost: "2.35", lead_time_days: "14", location: "A1", lot_number: "LOT-CREATE" },
    };
    const endpoint: Record<string, string> = { customers: "/api/customers", suppliers: "/api/suppliers", products: "/api/products", inventory: "/api/inventory" };
    const headers = { authorization: `Bearer ${token}` };

    for (const moduleName of ["customers", "suppliers", "products", "inventory"]) {
      const expectedKey = moduleName === "customers" || moduleName === "suppliers" ? rows[moduleName].name : rows[moduleName].sku;
      const preview = await importCall(request, token, schemas[moduleName], "preview", [rows[moduleName]], [6]);
      expect(preview.ok(), `${moduleName} preview: ${await preview.text()}`).toBe(true);
      expect((await preview.json()).data).toMatchObject({ valid: true, creates: 1, records: [{ row: 6, key: expectedKey }] });
      const commit = await importCall(request, token, schemas[moduleName], "commit", [rows[moduleName]], [6]);
      expect(commit.ok(), `${moduleName} commit: ${await commit.text()}`).toBe(true);
      expect((await commit.json()).data).toMatchObject({ valid: true, creates: 1, records: [{ row: 6, key: expectedKey }] });
    }

    const before = Object.fromEntries(await Promise.all(Object.entries(endpoint).map(async ([moduleName, path]) => [moduleName, await (await request.get(path, { headers })).json()]))) as Record<string, unknown>;
    const conflicts: Record<string, Record<string, unknown>> = {
      customers: { ...rows.customers, name: customerName.toLowerCase(), contact_name: "Changed Contact" },
      suppliers: { ...rows.suppliers, name: supplierName.toLowerCase(), contact_name: "Changed Supplier" },
      products: { ...rows.products, sku: String(rows.products.sku).toLowerCase(), name: "Changed Product" },
      inventory: { ...rows.inventory, sku: String(rows.inventory.sku).toLowerCase(), on_hand_quantity: "999" },
    };
    for (const moduleName of ["customers", "suppliers", "products", "inventory"]) {
      const expectedKey = moduleName === "customers" || moduleName === "suppliers" ? conflicts[moduleName].name : conflicts[moduleName].sku;
      const preview = await importCall(request, token, schemas[moduleName], "preview", [conflicts[moduleName]], [19]);
      expect(preview.ok(), `${moduleName} conflict preview: ${await preview.text()}`).toBe(true);
      const previewBody = await preview.json() as { data: { valid: boolean; creates: number; records: unknown[]; errors: Array<{ row: number; code?: string; recordKey?: string }> } };
      expect(previewBody.data).toMatchObject({ valid: false, creates: 0, records: [] });
      expect(previewBody.data.errors).toContainEqual(expect.objectContaining({ row: 19, code: "IMPORT_RECORD_EXISTS", recordKey: expectedKey }));
      const commit = await importCall(request, token, schemas[moduleName], "commit", [conflicts[moduleName]], [19]);
      expect(commit.status(), `${moduleName} existing target commit`).toBe(400);
    }
    const after = Object.fromEntries(await Promise.all(Object.entries(endpoint).map(async ([moduleName, path]) => [moduleName, await (await request.get(path, { headers })).json()]))) as Record<string, unknown>;
    expect(after).toEqual(before);
  });

  test("matches import-button visibility to module roles", async ({ page }) => {
    await loadImportFunctions(page);
    const matrix = await page.evaluate(() => {
      const visible = (roles: string[], moduleName: string) => {
        backendAuthState.token = "test-token";
        backendAuthState.user = { userType: "employee" };
        backendAuthState.roles = roles;
        return bulkImportButtonHtml(moduleName).includes("Import CSV / Excel");
      };
      return {
        admin: ["customers", "products", "suppliers", "inventory"].every(moduleName => visible(["Admin"], moduleName)),
        sales: [visible(["Sales"], "customers"), visible(["Sales"], "products"), visible(["Sales"], "suppliers"), visible(["Sales"], "inventory")],
        procurement: [visible(["Supply Chain & Procurement"], "customers"), visible(["Supply Chain & Procurement"], "suppliers"), visible(["Supply Chain & Procurement"], "inventory")],
        warehousing: [visible(["Warehousing"], "customers"), visible(["Warehousing"], "inventory")],
        customer: (() => { backendAuthState.user = { userType: "customer" }; return bulkImportButtonHtml("products").includes("Import CSV / Excel"); })(),
      };
    });
    expect(matrix).toEqual({ admin: true, sales: [true, true, false, false], procurement: [false, true, true], warehousing: [false, true], customer: false });
  });

  test("commits a new Customer from the create-only UI and reloads it from the API", async ({ page, request }) => {
    const auth = await loginAdmin(request);
    const suffix = crypto.randomUUID().slice(0, 8);
    const name = `UI Create Only ${suffix}`;
    await page.addInitScript(value => sessionStorage.setItem("nuttypaws_erp_v1_auth", JSON.stringify(value)), auth);
    await page.goto("/");
    await page.waitForFunction(() => typeof (globalThis as unknown as { openBulkImport?: unknown }).openBulkImport === "function");
    await page.evaluate(() => openBulkImport("customers"));
    await page.locator('.import-drop input[type="file"]').setInputFiles({ name: "new-customer.csv", mimeType: "text/csv", buffer: Buffer.from(`name,contact_name,contact_email,phone,status\n${name},UI Contact,${suffix}@example.com,555-0101,active\n`) });
    await expect(page.getByText("Ready to import", { exact: true })).toBeVisible();
    await expect(page.locator(".import-new-records")).toContainText(name);
    await page.getByRole("button", { name: "Import all rows" }).click();
    await expect(page.locator(".toast")).toHaveText("Imported 1 new record.");
    const customers = await request.get("/api/customers", { headers: { authorization: `Bearer ${auth.token}` } });
    expect(customers.ok(), await customers.text()).toBe(true);
    expect(JSON.stringify((await customers.json()).data)).toContain(name);
  });
});

declare global {
  function renderBulkImportModal(): void;
  function openBulkImport(moduleName: string): Promise<void>;
  function bulkImportButtonHtml(moduleName: string): string;
  function handleImportFile(file: File): Promise<void>;
  function parseCanonicalCsv(text: string, sourceRowNumbers?: number[], maxDataRows?: number): { rows: unknown[][]; rowNumbers: number[] };
  function matrixToCsv(rows: unknown[][], maxBytes?: number): string;
  function readFirstExcelSheet(file: File, maxDataRows?: number, schema?: unknown): Promise<unknown[][]>;
  function buildGuidedImportWorkbook(schema: ImportSchema): Promise<Blob>;
  function writeXlsxFile(data: unknown[]): { toBlob(): Promise<Blob> };
  const JSZip: typeof import("jszip");
  const backendAuthState: { token: string; user: { userType?: string; roles?: string[] } | null; roles: string[] };
  const bulkImportState: {
    module: string;
    schema: ImportSchema | null;
    headers: string[];
    rows: Array<Record<string, unknown>>;
    rowNumbers: number[];
    sourceFileName: string;
    busy: boolean;
    errorRowLimits: Record<string, number>;
    preview: ({ records?: Array<{ row: number; key: string }> } & Record<string, unknown>) | null;
  };
}
