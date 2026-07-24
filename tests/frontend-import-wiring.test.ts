import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { frontendText } from "./frontend-assets";

const importSource = readFileSync(resolve(__dirname, "..", "public", "js", "ui", "imports.js"), "utf8");
const importStyles = readFileSync(resolve(__dirname, "..", "public", "css", "uploads.css"), "utf8");

describe("bulk import frontend wiring", () => {
  it("places import actions beside all four supported exports", () => {
    for (const moduleName of ["customers", "products", "suppliers", "inventory"]) {
      expect(frontendText).toContain(`bulkImportButtonHtml('${moduleName}')`);
      expect(frontendText).toContain(`/api/imports/${"${encodeURIComponent(moduleName)}"}/preview`);
    }
  });

  it("uses CSV as the shared parsing path for CSV and XLSX while bounding rendered error rows", () => {
    expect(frontendText).toContain("parsed = parseCanonicalCsv(await file.text(), undefined, schema.maxRows)");
    expect(frontendText).toContain("parsed = parseCanonicalCsv(matrixToCsv(firstSheet, schema.maxFileBytes), firstSheet.map((_, index) => index + 1), schema.maxRows)");
    expect(frontendText).toContain("workbook[0]?.data ? workbook[0].data : workbook");
    expect(frontendText).toContain("inspectXlsxBeforeRead(file, maxDataRows, schema)");
    expect(frontendText).toContain("assertXlsxArchiveLimits(zip, file.size)");
    expect(frontendText).toContain("assertXlsxDataRowLimit(xml, maxDataRows)");
    expect(frontendText).toContain("assertXlsxVisibleRows(documentNode)");
    expect(frontendText).toContain("assertXlsxIdentifierCellsAreText(zip, documentNode, schema)");
    expect(frontendText).toContain("resolveFirstWorksheetPath(zip, worksheetPaths)");
    expect(frontendText).toContain("resolveFirstWorksheetInfo(zip, worksheetPaths)");
    expect(frontendText).toContain("{ sheets: [1] }");
    expect(frontendText).toContain("IMPORT_XLSX_FORMULA");
    expect(frontendText).toContain("uses a numeric cell");
    expect(frontendText).toContain("nonblank hidden or filtered-out");
    expect(frontendText).toContain("is hidden. Make it visible and review it before uploading.");
    expect(frontendText).toContain("Worksheet imported:");
    expect(frontendText).toContain("Row contains data beyond the last standardized template column.");
    expect(frontendText).toContain("commas inside a value must be enclosed in double quotes");
    expect(frontendText).toContain("creates: 0, records: [], errors: [...serverPreview.errors, ...rowShapeErrors]");
    expect(frontendText).toContain("const selectionId = ++bulkImportState.selectionId");
    expect(frontendText).toContain("if (selectionId !== bulkImportState.selectionId) return");
    expect(frontendText).toContain("This file has more than ${maxDataRows} nonblank data rows.");
    expect(frontendText).toContain("function showMoreImportErrors(scope)");
    expect(frontendText).toContain("!preview?.valid || bulkImportState.busy");
  });

  it("routes drag-and-drop through the shared file handler", () => {
    expect(importSource).toContain('ondragenter="handleImportDragEnter(event)"');
    expect(importSource).toContain('ondragover="handleImportDragEnter(event)"');
    expect(importSource).toContain('ondragleave="handleImportDragLeave(event)"');
    expect(importSource).toContain('ondrop="handleImportDrop(event)"');
    expect(importSource).toContain("handleImportFile(files[0])");
    expect(importSource).toContain("Drop one CSV or Excel (.xlsx) file at a time.");
    expect(importStyles).toContain(".import-drop.is-dragover");
    expect(importStyles).toContain("border: 1px dashed var(--grey)");
    expect(importStyles).toContain("background: var(--beige-light)");
    expect(importStyles).not.toContain("var(--border)");
    expect(importStyles).not.toContain("var(--cream)");
  });

  it("preserves physical CSV and XLSX rows through preview and commit", () => {
    expect(frontendText).toContain("skip_empty_lines: false");
    expect(frontendText).toContain("info: true");
    expect(frontendText).toContain("const startLine = previousEndLine + 1");
    expect(frontendText).toContain("rowNumbers: []");
    expect(frontendText).toContain("const rowNumbers = dataRecords.map(record => record.rowNumber)");
    expect(frontendText).toMatch(/JSON\.stringify\(\{ headers, rows, rowNumbers, sourceFileBytes: file\.size \}\)/);
    expect(frontendText).toContain("rowNumbers: bulkImportState.rowNumbers");
  });

  it("renders create-only review states with a fixed footer and dedicated scroller", () => {
    expect(importSource).toContain("function renderNewRecordReview(preview, schema)");
    expect(importSource).toContain("const records = Array.isArray(preview.records) ? preview.records : []");
    expect(importSource).toContain("New records (${records.length})");
    expect(importSource).toContain('aria-label="New records"');
    expect(importSource).toContain("function renderImportErrorReview(preview, schema)");
    expect(importSource).toContain("error.code === 'IMPORT_RECORD_EXISTS'");
    expect(importSource).toContain("Existing records block this import");
    expect(importSource).toContain("View existing records (${existing.length})");
    expect(importSource).toContain("<th>Row</th><th>${escapeHtml(matchKeyLabel)}</th><th>Issue</th>");
    expect(importSource).toContain("existing.length <= 10 ? 'open' : ''");
    expect(importSource).toContain("No records were imported.");
    expect(importSource).toContain("no reported issues");
    expect(importSource).toContain("because the entire file must pass");
    expect(importSource).toContain("function importFieldLabel(schema, field)");
    expect(importSource).toContain("importFieldLabel(schema, error.field)");
    expect(importSource).toContain("function importErrorMessage(schema, error)");
    expect(importSource).toContain("importErrorMessage(schema, error)");
    expect(importSource).toContain("bulk-import-form");
    expect(importSource).toContain("import-footer-actions");
    expect(importSource).toContain('id="importPreviewSummary"');
    expect(importSource).toContain('id="importLiveStatus"');
    expect(importSource).toContain("focus({ preventScroll: true })");
    expect(importSource).toContain('class="bulk-import-scroll"');
    expect(importStyles).toContain("height: calc(100dvh - 80px)");
    expect(importStyles).toContain("max-height: calc(100dvh - 80px)");
    expect(importStyles).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(importStyles).toContain(".bulk-import-scroll { display: grid; align-content: start;");
    expect(importStyles).toContain(".import-existing-record-list { border-top: 1px solid var(--grey-light); }");
    expect(importStyles).toContain(".import-errors { margin-top: 12px;");
    expect(importStyles).toContain(".import-error-pagination");
    expect(importStyles).toContain(".import-live-status");
    expect(importStyles).not.toContain(".import-summary-count.is-update");
    expect(importStyles).not.toContain("import-field-differences");
    expect(importStyles).not.toContain("import-multi-lot-blocker");
  });

  it("uses one create-only Guide and create-only spreadsheet instructions", () => {
    expect(importSource).toContain("function renderImportGuide(schema)");
    expect(importSource).toContain('<summary>Import guide</summary>');
    expect(importSource).toContain("add new records only");
    expect(importSource).toContain("Edit existing records in the portal.");
    expect(importSource).toContain("Existing records");
    expect(importSource).toContain("the first worksheet even if it has been renamed");
    expect(importSource).toContain("Use pasted values only; formulas are rejected.");
    expect(importSource).toContain("it may be renamed, but it must remain the first worksheet");
    expect(importSource).toContain("Formulas are rejected; replace them with plain text or numbers");
    expect(importSource).toContain("const textStyleId = await addExcelTextStyle(zip)");
    expect(importSource).toContain("column.validation?.kind !== 'identifier'");
    expect(importSource).toContain("style.setAttribute('numFmtId', '49')");
    expect(importSource).toContain("Non-currency quantities may be up to 1,000,000,000 with no more than 6 decimal places");
    expect(importSource).toContain("ROUND(${cell},${IMPORT_MAX_DECIMAL_PLACES})=${cell}");
    expect(importSource).toContain("${cell}<=${IMPORT_MAX_NON_CURRENCY_NUMBER}");
    expect(importSource).toContain("An existing matching record blocks the whole file; edit it in the portal instead.");
    expect(importSource).toContain("sheet: 'Import Data'");
    expect(importSource).toContain("sheet: 'Instructions'");
    expect(importSource).toContain("sheet: 'Lists'");
    expect(importSource.indexOf("sheet: 'Import Data'")).toBeLessThan(importSource.indexOf("sheet: 'Instructions'"));
    expect(importSource).toContain("stickyRowsCount: instructionHeaderRows");
    expect(importSource).toContain("dataValidations");
    expect(importSource).toContain("autoFilter");
    expect(importSource).toContain("501");
    expect(importSource).not.toContain("Corrections and Undo");
  });

  it("reports successful imports as new records", () => {
    expect(importSource).toContain("toast(`Imported ${importCountLabel(result.creates, 'new record')}.`)");
  });

  it("loads local spreadsheet dependencies before the application bundle", () => {
    for (const file of ["index.html", "public/index.html"]) {
      const html = readFileSync(resolve(__dirname, "..", file), "utf8");
      expect(html.indexOf("vendor/csv-parse-sync.js")).toBeLessThan(html.indexOf("dist/app."));
      expect(html).toContain("vendor/jszip.min.js");
      expect(html).toContain("vendor/read-excel-file.min.js");
      expect(html).toContain("vendor/write-excel-file.min.js");
    }
  });
});
