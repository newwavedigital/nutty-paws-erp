/* =========================================================================
   STANDARDIZED BULK IMPORT
   CSV is the canonical parser path. XLSX rows are normalized to CSV first.
   ========================================================================= */
const IMPORT_ERROR_INITIAL_ROW_LIMIT = 50;
const IMPORT_ERROR_ROW_INCREMENT = 50;
const XLSX_MAX_ARCHIVE_ENTRIES = 2_000;
const XLSX_MAX_ENTRY_BYTES = 12_000_000;
const XLSX_MAX_TOTAL_UNCOMPRESSED_BYTES = 24_000_000;
const XLSX_MAX_EXPANSION_RATIO = 100;
const IMPORT_MAX_NON_CURRENCY_NUMBER = 1_000_000_000;
const IMPORT_MAX_DECIMAL_PLACES = 6;

const bulkImportState = { module: '', schema: null, headers: [], rows: [], rowNumbers: [], preview: null, busy: false, sourceFileBytes: 0, sourceFileName: '', sourceWorksheetName: '', selectionId: 0, errorRowLimits: {} };

const BULK_IMPORT_ROLES = {
  customers: ['Admin', 'Sales'], products: ['Admin', 'Sales'],
  suppliers: ['Admin', 'Supply Chain & Procurement'],
  inventory: ['Admin', 'Supply Chain & Procurement', 'Warehousing']
};

function canBulkImport(moduleName) {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return false;
  const roles = currentBackendRoles();
  return roles.includes('Admin') || (BULK_IMPORT_ROLES[moduleName] || []).some(role => roles.includes(role));
}

function bulkImportButtonHtml(moduleName) {
  return canBulkImport(moduleName)
    ? `<button class="btn btn-secondary btn-sm" onclick="openBulkImport('${moduleName}')">Import CSV / Excel</button>`
    : '';
}

function importCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function importSummaryCount(count, singular, plural = `${singular}s`, tone = 'total') {
  const formattedCount = Number(count).toLocaleString('en-US');
  return `<span class="import-summary-count is-${tone}"><strong>${formattedCount}</strong><span>${count === 1 ? singular : plural}</span></span>`;
}

async function openBulkImport(moduleName) {
  if (!canBulkImport(moduleName)) { toast('You do not have access to import this module.'); return; }
  bulkImportState.module = moduleName;
  bulkImportState.schema = null;
  bulkImportState.headers = [];
  bulkImportState.rows = [];
  bulkImportState.rowNumbers = [];
  bulkImportState.preview = null;
  bulkImportState.sourceFileBytes = 0;
  bulkImportState.sourceFileName = '';
  bulkImportState.sourceWorksheetName = '';
  bulkImportState.selectionId += 1;
  bulkImportState.busy = false;
  bulkImportState.errorRowLimits = {};
  openModal('Import ' + escapeHtml(moduleName), '<div class="empty">Loading standardized template...</div>');
  document.querySelector('.modal')?.classList.add('stitch-modal', 'bulk-import-modal');
  try {
    bulkImportState.schema = await apiRequest(`/api/imports/${encodeURIComponent(moduleName)}/schema`);
    renderBulkImportModal();
  } catch (error) {
    document.getElementById('modalBody').innerHTML = `<div class="inv-check bad"><strong>Import unavailable</strong><div>${escapeHtml(error.message)}</div></div>`;
  }
}

function renderBulkImportModal({ focusResult = false, announceResult = false, restoreScrollTop = null, focusControl = '' } = {}) {
  const schema = bulkImportState.schema;
  const preview = bulkImportState.preview;
  const errors = preview?.errors || [];
  const modal = document.querySelector('.modal');
  modal?.classList.add('stitch-modal', 'bulk-import-modal');
  modal?.classList.toggle('is-import-empty', !preview);
  document.getElementById('modalBody').innerHTML = `<div class="bulk-import-form">
    <div class="bulk-import-scroll">
    <label class="import-drop" ondragenter="handleImportDragEnter(event)" ondragover="handleImportDragEnter(event)" ondragleave="handleImportDragLeave(event)" ondrop="handleImportDrop(event)">
      <strong>Choose CSV or Excel (.xlsx) file</strong>
      <span>Or drag and drop one file here. Maximum ${schema.maxRows} rows and 5 MB. Only the first worksheet is read, regardless of its name. Formulas are not supported.</span>
      <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="handleImportFile(this.files[0])" ${bulkImportState.busy ? 'disabled' : ''}>
      ${bulkImportState.sourceFileName ? `<span class="import-selected-file"><strong>Selected file:</strong> ${escapeHtml(bulkImportState.sourceFileName)}</span>` : ''}
      ${bulkImportState.sourceWorksheetName ? `<span class="import-selected-file"><strong>Worksheet imported:</strong> ${escapeHtml(bulkImportState.sourceWorksheetName)} (first worksheet only)</span>` : ''}
    </label>
    ${preview ? `<div id="importPreviewSummary" class="import-summary ${preview.valid ? 'ok' : 'bad'}" tabindex="-1" aria-label="${escapeHtml(importPreviewAnnouncement(preview))}">
      <strong>${preview.valid ? 'Ready to import' : 'Nothing has been imported'}</strong>
      <span class="import-summary-counts" aria-label="${importCountLabel(preview.totalRows, 'row')}, ${importCountLabel(preview.creates, 'new record')}, ${importCountLabel(errors.length, 'issue', 'issues')}">
        ${importSummaryCount(preview.totalRows, 'row')}${importSummaryCount(preview.creates, 'new record', 'new records', 'create')}${importSummaryCount(errors.length, 'issue', 'issues', 'issue')}
      </span>
    </div>` : ''}
    ${preview?.valid ? renderNewRecordReview(preview, schema) : ''}
    ${errors.length ? renderImportErrorReview(preview, schema) : ''}
    ${renderImportGuide(schema)}
    </div>
    <div class="import-footer-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="commitBulkImport()" ${!preview?.valid || bulkImportState.busy ? 'disabled' : ''}>${bulkImportState.busy ? 'Importing...' : 'Import all rows'}</button></div>
    <div id="importLiveStatus" class="import-live-status" aria-live="polite" aria-atomic="true"></div>
  </div>`;
  if (!preview) return;
  requestAnimationFrame(() => {
    const scroll = document.querySelector('.bulk-import-scroll');
    if (scroll && Number.isFinite(restoreScrollTop)) scroll.scrollTop = restoreScrollTop;
    if (focusResult) document.getElementById('importPreviewSummary')?.focus({ preventScroll: true });
    if (focusControl) document.getElementById(focusControl)?.focus({ preventScroll: true });
    if (announceResult) announceImportPreview(preview);
  });
}

function importPreviewAnnouncement(preview) {
  const outcome = preview?.valid ? 'Import preview ready' : 'Import preview blocked';
  return `${outcome}. ${importCountLabel(Number(preview?.totalRows) || 0, 'row')}, ${importCountLabel(Number(preview?.creates) || 0, 'new record')}, ${importCountLabel((preview?.errors || []).length, 'issue', 'issues')}.`;
}

function announceImportPreview(preview) {
  const status = document.getElementById('importLiveStatus');
  if (!status) return;
  status.textContent = '';
  requestAnimationFrame(() => { status.textContent = importPreviewAnnouncement(preview); });
}

function renderImportGuide(schema) {
  return `<details class="import-guide">
    <summary>Import guide</summary>
    <div class="import-guide-content">
      <section class="import-guide-section">
        <strong>Import rules</strong>
        <p>Use the standardized template to add new records only. Existing <strong>${escapeHtml(schema.keyColumn)}</strong> matches are blocked after ignoring capitalization and surrounding spaces; punctuation and wording must otherwise match exactly. Edit existing records in the portal. The entire file is rejected if any row is invalid.</p>
      </section>
      <section class="import-guide-section">
        <strong>Templates</strong>
        <div class="import-actions">
          <button class="btn btn-secondary btn-sm" onclick="downloadImportTemplate('csv')">Download CSV template</button>
          <button class="btn btn-secondary btn-sm" onclick="downloadImportTemplate('xlsx')">Download Excel (.xlsx) template</button>
        </div>
        <div class="help-text"><strong>Excel (.xlsx) is recommended:</strong> it includes dropdowns, number checks, units, and complete instructions. CSV is available as a plain header template.</div>
        <div class="help-text">For Excel files, the importer reads the first worksheet even if it has been renamed. Use pasted values only; formulas are rejected.</div>
      </section>
      <section class="import-guide-section">
        <strong>Columns</strong>
        <div class="import-guide-columns"><table><thead><tr><th>Column</th><th>Required</th><th>Meaning</th></tr></thead><tbody>${schema.columns.map(column => `<tr><td><code>${escapeHtml(column.key)}</code></td><td>${column.required ? 'Yes' : 'No'}</td><td>${escapeHtml(column.description)}</td></tr>`).join('')}</tbody></table></div>
      </section>
    </div>
  </details>`;
}

function renderNewRecordReview(preview, schema) {
  const records = Array.isArray(preview.records) ? preview.records : [];
  return `
    <div class="import-review-note">
      <strong>New records only</strong>
      <div>Check these ${escapeHtml(schema.keyColumn)} values before importing. Existing records must be edited in the portal.</div>
    </div>
    ${records.length ? `<details class="import-new-records" open>
      <summary>New records (${records.length})</summary>
      <ul class="import-create-identifiers" aria-label="New records">${records.map(record => `<li><code>${escapeHtml(record.key)}</code></li>`).join('')}</ul>
    </details>` : ''}`;
}

function importMatchKeyLabel(schema) {
  return schema?.columns?.find(column => column.key === schema.keyColumn)?.label
    || (schema?.keyColumn === 'sku' ? 'SKU' : 'Name');
}

function renderImportErrorReview(preview, schema) {
  const errors = preview?.errors || [];
  const existing = errors.filter(error => error.code === 'IMPORT_RECORD_EXISTS');
  const otherErrors = errors.filter(error => error.code !== 'IMPORT_RECORD_EXISTS');
  const matchKeyLabel = importMatchKeyLabel(schema);
  const issueRows = new Set(errors.map(error => Number(error.row)).filter(row => Number.isInteger(row) && row > 0));
  const hasFileIssue = errors.some(error => !Number(error.row));
  const otherwiseValidRows = hasFileIssue ? 0 : Math.max(0, Number(preview?.totalRows || 0) - issueRows.size);
  return `${existing.length ? `<section class="import-existing-record-blocker" aria-labelledby="importExistingRecordTitle">
    <strong id="importExistingRecordTitle">Existing records block this import</strong>
    <div>${existing.length} ${existing.length === 1 ? 'row uses an existing record' : 'rows use existing records'}. Imports only add new records. No records were imported.</div>
    ${otherwiseValidRows ? `<div class="import-held-row-note">The other ${otherwiseValidRows} ${otherwiseValidRows === 1 ? 'row has' : 'rows have'} no reported issues, but ${otherwiseValidRows === 1 ? 'it was' : 'they were'} also held because the entire file must pass.</div>` : ''}
    <div>Edit ${existing.length === 1 ? 'that record' : 'those records'} in the portal or remove the row${existing.length === 1 ? '' : 's'} from this file, then upload again.</div>
    <details ${existing.length <= 10 ? 'open' : ''}>
      <summary id="importExistingRecordsSummary">View existing records (${existing.length})</summary>
      ${renderExistingRecordTable(existing, matchKeyLabel, schema)}
    </details>
  </section>` : ''}
  ${otherErrors.length ? renderImportErrorTable(otherErrors, existing.length ? 'Other issues' : 'Issues to correct', schema) : ''}`;
}

function importFieldLabel(schema, field) {
  const schemaLabel = schema?.columns?.find(column => column.key === field)?.label;
  if (schemaLabel) return schemaLabel;
  if (field === 'file') return 'File';
  if (field === 'row') return 'Row';
  return String(field || 'Record').split('_').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function importErrorMessage(schema, error) {
  let message = String(error?.message || 'Import validation failed.');
  const columns = [...(schema?.columns || [])].sort((left, right) => right.key.length - left.key.length);
  for (const column of columns) message = message.split(column.key).join(column.label);
  return message;
}

function importErrorGroups(errors) {
  const groups = new Map();
  errors.forEach((error, index) => {
    const row = Number(error?.row);
    const key = Number.isInteger(row) && row > 0 ? `row:${row}` : `file:${index}`;
    if (!groups.has(key)) groups.set(key, { label: Number.isInteger(row) && row > 0 ? String(row) : 'File', errors: [] });
    groups.get(key).errors.push(error);
  });
  return [...groups.values()];
}

function visibleImportErrorGroups(scope, errors) {
  const groups = importErrorGroups(errors);
  const limit = bulkImportState.errorRowLimits[scope] || IMPORT_ERROR_INITIAL_ROW_LIMIT;
  return { groups, visible: groups.slice(0, limit), limit };
}

function renderImportErrorPagination(scope, groups, visibleCount) {
  if (visibleCount >= groups.length) return '';
  const nextCount = Math.min(IMPORT_ERROR_ROW_INCREMENT, groups.length - visibleCount);
  return `<div class="import-error-pagination" aria-live="polite">Showing ${visibleCount} of ${groups.length} affected ${groups.length === 1 ? 'row' : 'rows'}. <button id="importShowMore${scope}" class="btn btn-secondary btn-sm" onclick="showMoreImportErrors('${scope}')">Show ${nextCount} more ${nextCount === 1 ? 'row' : 'rows'}</button></div>`;
}

function renderExistingRecordTable(errors, matchKeyLabel, schema) {
  const { groups, visible } = visibleImportErrorGroups('existing', errors);
  const rows = visible.flatMap(group => group.errors.map((error, index) => `<tr><td>${index ? '' : group.label}</td><td><code>${escapeHtml(error.recordKey || '')}</code></td><td>${escapeHtml(importErrorMessage(schema, error))}</td></tr>`)).join('');
  return `<div class="import-existing-record-list"><table><thead><tr><th>Row</th><th>${escapeHtml(matchKeyLabel)}</th><th>Issue</th></tr></thead><tbody>${rows}</tbody></table>${renderImportErrorPagination('existing', groups, visible.length)}</div>`;
}

function renderImportErrorTable(errors, heading, schema) {
  const { groups, visible } = visibleImportErrorGroups('other', errors);
  const rows = visible.flatMap(group => group.errors.map((error, index) => `<tr><td>${index ? '' : group.label}</td><td>${escapeHtml(importFieldLabel(schema, error.field))}</td><td>${escapeHtml(importErrorMessage(schema, error))}</td></tr>`)).join('');
  return `<section class="import-error-section">
    <strong id="importOtherIssuesHeading" tabindex="-1">${escapeHtml(heading)} (${errors.length})</strong>
    <div class="import-errors"><table><thead><tr><th>Row</th><th>Column</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>${renderImportErrorPagination('other', groups, visible.length)}</div>
  </section>`;
}

function showMoreImportErrors(scope) {
  const scroll = document.querySelector('.bulk-import-scroll');
  const scrollTop = scroll?.scrollTop ?? 0;
  bulkImportState.errorRowLimits[scope] = (bulkImportState.errorRowLimits[scope] || IMPORT_ERROR_INITIAL_ROW_LIMIT) + IMPORT_ERROR_ROW_INCREMENT;
  const errors = bulkImportState.preview?.errors || [];
  const scopedErrors = scope === 'existing'
    ? errors.filter(error => error.code === 'IMPORT_RECORD_EXISTS')
    : errors.filter(error => error.code !== 'IMPORT_RECORD_EXISTS');
  const hasMore = visibleImportErrorGroups(scope, scopedErrors).visible.length < importErrorGroups(scopedErrors).length;
  const fallback = scope === 'existing' ? 'importExistingRecordsSummary' : 'importOtherIssuesHeading';
  renderBulkImportModal({ restoreScrollTop: scrollTop, focusControl: hasMore ? `importShowMore${scope}` : fallback });
}

function handleImportDragEnter(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  if (bulkImportState.busy) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    return;
  }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  event.currentTarget.classList.add('is-dragover');
}

function handleImportDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
  event.currentTarget.classList.remove('is-dragover');
}

function handleImportDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('is-dragover');
  if (bulkImportState.busy) return;
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length !== 1) {
    showClientImportError('Drop one CSV or Excel (.xlsx) file at a time.');
    return;
  }
  handleImportFile(files[0]);
}

async function handleImportFile(file) {
  if (!file) return;
  const schema = bulkImportState.schema;
  const moduleName = bulkImportState.module;
  const selectionId = ++bulkImportState.selectionId;
  bulkImportState.preview = null;
  bulkImportState.headers = [];
  bulkImportState.rows = [];
  bulkImportState.rowNumbers = [];
  bulkImportState.sourceFileBytes = 0;
  bulkImportState.sourceFileName = file.name;
  bulkImportState.sourceWorksheetName = '';
  bulkImportState.errorRowLimits = {};
  if (file.size > schema.maxFileBytes) return showClientImportError('File is larger than 5 MB.');
  try {
    let parsed;
    let sourceWorksheetName = '';
    const isCsvFile = /\.csv$/i.test(file.name);
    if (isCsvFile) {
      parsed = parseCanonicalCsv(await file.text(), undefined, schema.maxRows);
    } else if (/\.xlsx$/i.test(file.name)) {
      const firstSheet = await readFirstExcelSheet(file, schema.maxRows, schema);
      sourceWorksheetName = firstSheet.worksheetName || '';
      parsed = parseCanonicalCsv(matrixToCsv(firstSheet, schema.maxFileBytes), firstSheet.map((_, index) => index + 1), schema.maxRows);
    } else throw new Error('Choose a .csv or .xlsx file.');
    const matrix = parsed.rows;
    if (!matrix.length) throw new Error('The file is empty.');
    const headers = matrix[0].map(value => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase());
    const dataRecords = matrix.slice(1).map((row, index) => ({ row, rowNumber: parsed.rowNumbers[index + 1] ?? index + 2 }))
      .filter(record => record.row.some(value => String(value ?? '').trim() !== ''));
    const rowShapeErrors = dataRecords.flatMap(record => {
      if (isCsvFile && record.row.length !== matrix[0].length) {
        return [{
          row: record.rowNumber,
          field: 'row',
          message: `This CSV row has ${record.row.length} columns, but the header has ${matrix[0].length}. Check for missing separators or an unquoted comma; commas inside a value must be enclosed in double quotes.`,
        }];
      }
      return !isCsvFile && record.row.slice(headers.length).some(value => String(value ?? '').trim() !== '')
        ? [{ row: record.rowNumber, field: 'row', message: 'Row contains data beyond the last standardized template column.' }]
        : [];
    });
    const rows = dataRecords.map(record => Object.fromEntries(headers.map((header, index) => [header, record.row[index] ?? ''])));
    const rowNumbers = dataRecords.map(record => record.rowNumber);
    if (selectionId !== bulkImportState.selectionId) return;
    const serverPreview = await apiRequest(`/api/imports/${encodeURIComponent(moduleName)}/preview`, { method: 'POST', body: JSON.stringify({ headers, rows, rowNumbers, sourceFileBytes: file.size }) });
    if (selectionId !== bulkImportState.selectionId) return;
    bulkImportState.headers = headers;
    bulkImportState.rows = rows;
    bulkImportState.rowNumbers = rowNumbers;
    bulkImportState.sourceFileBytes = file.size;
    bulkImportState.sourceWorksheetName = sourceWorksheetName;
    bulkImportState.preview = rowShapeErrors.length ? { ...serverPreview, valid: false, creates: 0, records: [], errors: [...serverPreview.errors, ...rowShapeErrors] } : serverPreview;
    renderBulkImportModal({ focusResult: true, announceResult: true });
  } catch (error) {
    if (selectionId === bulkImportState.selectionId) showClientImportError(error.message || 'The file could not be read.');
  }
}

function parseCanonicalCsv(text, sourceRowNumbers, maxDataRows = Number.POSITIVE_INFINITY) {
  if (!window.csv_parse_sync?.parse) throw new Error('CSV parser failed to load.');
  let parsedRows = 0;
  let dataRows = 0;
  const parsed = window.csv_parse_sync.parse(text, {
    bom: true,
    skip_empty_lines: false,
    relax_column_count: true,
    info: true,
    on_record(entry) {
      const row = entry?.record ?? entry;
      parsedRows += 1;
      if (parsedRows > 1 && Array.isArray(row) && row.some(value => String(value ?? '').trim() !== '')) {
        dataRows += 1;
        if (dataRows > maxDataRows) throw new Error(`This file has more than ${maxDataRows} nonblank data rows.`);
      }
      return entry;
    },
  });
  let previousEndLine = 0;
  const rows = [];
  const rowNumbers = [];
  parsed.forEach((entry, index) => {
    const endLine = Number(entry?.info?.lines) || previousEndLine + 1;
    const startLine = previousEndLine + 1;
    previousEndLine = endLine;
    rows.push(entry?.record ?? []);
    rowNumbers.push(sourceRowNumbers?.[index] ?? startLine);
  });
  while (rows.length && rows[rows.length - 1].every(value => String(value ?? '').trim() === '')) {
    rows.pop(); rowNumbers.pop();
  }
  return { rows, rowNumbers };
}

async function readFirstExcelSheet(file, maxDataRows = Number.POSITIVE_INFINITY, schema = null) {
  if (typeof window.readXlsxFile !== 'function' || !window.JSZip) throw new Error('Excel parser failed to load.');
  const inspected = await inspectXlsxBeforeRead(file, maxDataRows, schema);
  let workbook;
  try {
    workbook = await window.readXlsxFile(inspected.file, { sheets: [1] });
  } catch (error) {
    if (error?.code === 'IMPORT_XLSX_FORMULA') throw error;
    throw new Error('The Excel file could not be read. Re-download the portal template and paste in plain values.');
  }
  const rows = Array.isArray(workbook) && workbook[0]?.data ? workbook[0].data : workbook;
  if (!Array.isArray(rows)) throw new Error('The first Excel sheet could not be read.');
  for (const [rowIndex, row] of rows.entries()) {
    if (!Array.isArray(row)) throw new Error(`Excel row ${rowIndex + 1} is invalid.`);
    for (const [columnIndex, value] of row.entries()) {
      if (value instanceof Date || (value !== null && typeof value === 'object')) {
        throw new Error(`Excel row ${rowIndex + 1}, column ${columnIndex + 1} contains a formula or unsupported value. Replace it with plain text or a number.`);
      }
    }
  }
  if (countNonblankDataRows(rows) > maxDataRows) throw new Error(`This file has more than ${maxDataRows} nonblank data rows.`);
  Object.defineProperty(rows, 'worksheetName', { value: inspected.worksheetName, configurable: true });
  return rows;
}

function countNonblankDataRows(rows) {
  return rows.slice(1).filter(row => Array.isArray(row) && row.some(value => String(value ?? '').trim() !== '')).length;
}

async function inspectXlsxBeforeRead(file, maxDataRows, schema = null) {
  let zip;
  try {
    zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  } catch (error) {
    throw new Error('The Excel file could not be read. Re-download the portal template and paste in plain values.');
  }
  assertXlsxArchiveLimits(zip, file.size);
  const worksheetPaths = Object.keys(zip.files).filter(path => /^xl\/worksheets\/[^/]+\.xml$/i.test(path));
  const firstWorksheet = await resolveFirstWorksheetInfo(zip, worksheetPaths);
  if (firstWorksheet.hidden) {
    throw new Error(`The first Excel worksheet "${firstWorksheet.name}" is hidden. Make it visible and review it before uploading.`);
  }
  const entry = firstWorksheet.path ? zip.file(firstWorksheet.path) : null;
  if (!entry) throw new Error('The first Excel worksheet is missing.');
  assertXlsxEntryLimit(entry, 'first worksheet', XLSX_MAX_ENTRY_BYTES);
  const xml = await entry.async('string');
  const documentNode = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Invalid first worksheet XML.');
  if (documentNode.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'f').length) {
    const error = new Error('The first Excel sheet contains a formula. Replace formulas with plain text or numbers.');
    error.code = 'IMPORT_XLSX_FORMULA';
    throw error;
  }
  assertXlsxVisibleRows(documentNode);
  await assertXlsxIdentifierCellsAreText(zip, documentNode, schema);
  assertXlsxDataRowLimit(xml, maxDataRows);
  const sanitizedXml = xml
    .replace(/<(?:[a-z_][\w.-]*:)?c\b(?=[^>]*\bt="str")[^>]*\/>/gi, '')
    .replace(/<(?:[a-z_][\w.-]*:)?c\b(?=[^>]*\bt="str")[^>]*>\s*<(?:[a-z_][\w.-]*:)?v(?:\s[^>]*)?\/>\s*<\/(?:[a-z_][\w.-]*:)?c>/gi, '')
    .replace(/<(?:[a-z_][\w.-]*:)?c\b(?=[^>]*\bt="str")[^>]*>\s*<(?:[a-z_][\w.-]*:)?v(?:\s[^>]*)?>\s*<\/(?:[a-z_][\w.-]*:)?v>\s*<\/(?:[a-z_][\w.-]*:)?c>/gi, '');
  if (sanitizedXml === xml) return { file, worksheetName: firstWorksheet.name };
  zip.file(firstWorksheet.path, sanitizedXml);
  return {
    file: new File(
      [await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })],
      file.name,
      { type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    ),
    worksheetName: firstWorksheet.name,
  };
}

function assertXlsxVisibleRows(documentNode) {
  const hiddenRows = Array.from(documentNode.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'row'))
    .filter(row => row.getAttribute('hidden') === '1' || row.getAttribute('hidden') === 'true')
    .filter(row => Array.from(row.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'c')).some(xlsxCellHasValue))
    .map(row => Number(row.getAttribute('r')))
    .filter(Number.isSafeInteger);
  if (!hiddenRows.length) return;
  const shownRows = hiddenRows.slice(0, 12).join(', ');
  const remainder = hiddenRows.length > 12 ? `, and ${hiddenRows.length - 12} more` : '';
  throw new Error(`The first Excel worksheet contains ${hiddenRows.length} nonblank hidden or filtered-out ${hiddenRows.length === 1 ? 'row' : 'rows'} (${shownRows}${remainder}). Unhide the rows or clear filters and review them before uploading.`);
}

async function assertXlsxIdentifierCellsAreText(zip, documentNode, schema) {
  const identifierColumns = new Set((schema?.columns || [])
    .filter(column => column.validation?.kind === 'identifier')
    .map(column => column.key));
  if (!identifierColumns.size) return;
  const rows = Array.from(documentNode.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'row'));
  const headerRow = rows.find(row => Array.from(row.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'c')).some(xlsxCellHasValue));
  if (!headerRow) return;
  const sharedStrings = await readXlsxSharedStrings(zip);
  const identifiersByColumn = new Map();
  for (const cell of Array.from(headerRow.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'c'))) {
    const columnIndex = xlsxCellColumnIndex(cell);
    const header = xlsxRawCellText(cell, sharedStrings).replace(/^\uFEFF/, '').trim().toLowerCase();
    if (identifierColumns.has(header)) identifiersByColumn.set(columnIndex, header);
  }
  if (!identifiersByColumn.size) return;
  for (const row of rows) {
    if (row === headerRow) continue;
    const rowNumber = Number(row.getAttribute('r'));
    for (const cell of Array.from(row.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'c'))) {
      const columnIndex = xlsxCellColumnIndex(cell);
      const header = identifiersByColumn.get(columnIndex);
      if (!header || !xlsxCellHasValue(cell)) continue;
      const type = cell.getAttribute('t') || 'n';
      if (type === 'n') {
        throw new Error(`Excel row ${rowNumber}, column ${excelColumnName(columnIndex)} (${header}) uses a numeric cell. Format identifier and relationship-name columns as Text before uploading so leading zeros and long numbers are preserved.`);
      }
    }
  }
}

function xlsxCellHasValue(cell) {
  return Array.from(cell.children).some(child =>
    (child.localName === 'v' || child.localName === 't' || child.localName === 'is')
    && String(child.textContent || '').trim() !== ''
  );
}

function xlsxCellColumnIndex(cell) {
  const letters = String(cell.getAttribute('r') || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

async function readXlsxSharedStrings(zip) {
  const entry = zip.file('xl/sharedStrings.xml');
  if (!entry) return [];
  const documentNode = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Invalid Excel shared strings XML.');
  return Array.from(documentNode.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'si'))
    .map(node => node.textContent || '');
}

function xlsxRawCellText(cell, sharedStrings) {
  const type = cell.getAttribute('t') || 'n';
  const text = Array.from(cell.children)
    .filter(child => child.localName === 'v' || child.localName === 'is' || child.localName === 't')
    .map(child => child.textContent || '')
    .join('');
  if (type !== 's') return text;
  const index = Number(text);
  return Number.isSafeInteger(index) ? String(sharedStrings[index] ?? '') : '';
}

function xlsxEntrySizes(entry) {
  const data = entry?._data || {};
  return { compressed: Number(data.compressedSize), uncompressed: Number(data.uncompressedSize) };
}

function assertXlsxEntryLimit(entry, label, byteLimit = XLSX_MAX_ENTRY_BYTES) {
  const { compressed, uncompressed } = xlsxEntrySizes(entry);
  if (!Number.isSafeInteger(compressed) || !Number.isSafeInteger(uncompressed) || compressed < 0 || uncompressed < 0) {
    throw new Error(`The Excel ${label} has invalid size metadata.`);
  }
  if (uncompressed > byteLimit) throw new Error(`The Excel ${label} is too large after expansion.`);
  if (uncompressed > 0 && (compressed === 0 || uncompressed / compressed > XLSX_MAX_EXPANSION_RATIO)) {
    throw new Error(`The Excel ${label} expands too much to import safely.`);
  }
  return uncompressed;
}

function assertXlsxArchiveLimits(zip, sourceBytes) {
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  if (entries.length > XLSX_MAX_ARCHIVE_ENTRIES) throw new Error('The Excel file contains too many workbook entries.');
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    totalUncompressedBytes += assertXlsxEntryLimit(entry, 'workbook entry');
    if (totalUncompressedBytes > XLSX_MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error('The Excel file is too large after expansion.');
  }
  if (sourceBytes > 0 && totalUncompressedBytes / sourceBytes > XLSX_MAX_EXPANSION_RATIO) {
    throw new Error('The Excel file expands too much to import safely.');
  }
}

function assertXlsxDataRowLimit(xml, maxDataRows) {
  let nonblankRows = 0;
  let sawHeader = false;
  const rows = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || [];
  for (const rowXml of rows) {
    if (!/<(?:v|t)\b[^>]*>\s*\S[\s\S]*?<\/(?:v|t)>/i.test(rowXml)) continue;
    if (!sawHeader) { sawHeader = true; continue; }
    nonblankRows += 1;
    if (nonblankRows > maxDataRows) throw new Error(`This file has more than ${maxDataRows} nonblank data rows.`);
  }
}

async function resolveFirstWorksheetPath(zip, worksheetPaths) {
  return (await resolveFirstWorksheetInfo(zip, worksheetPaths)).path;
}

async function resolveFirstWorksheetInfo(zip, worksheetPaths) {
  const fallback = [...worksheetPaths].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0] || '';
  const workbookEntry = zip.file('xl/workbook.xml');
  const relationshipsEntry = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookEntry || !relationshipsEntry) return { path: fallback, name: 'Worksheet 1', hidden: false };
  const workbook = new DOMParser().parseFromString(await workbookEntry.async('string'), 'application/xml');
  const relationships = new DOMParser().parseFromString(await relationshipsEntry.async('string'), 'application/xml');
  if (workbook.querySelector('parsererror') || relationships.querySelector('parsererror')) return { path: fallback, name: 'Worksheet 1', hidden: false };
  const firstSheet = workbook.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'sheet')[0];
  const name = firstSheet?.getAttribute('name') || 'Worksheet 1';
  const hidden = ['hidden', 'veryHidden'].includes(firstSheet?.getAttribute('state') || '');
  const relationshipId = firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || firstSheet?.getAttribute('r:id');
  if (!relationshipId) return { path: fallback, name, hidden };
  const relationship = Array.from(relationships.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship'))
    .find(entry => entry.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target') || '';
  if (!target || /^[a-z]+:/i.test(target)) return { path: fallback, name, hidden };
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  return { path: worksheetPaths.includes(path) ? path : fallback, name, hidden };
}

function matrixToCsv(rows, maxBytes = Number.POSITIVE_INFINITY) {
  let bytes = 0;
  const encoder = new TextEncoder();
  const lines = [];
  for (const row of rows) {
    const line = row.map(csvCell).join(',');
    bytes += encoder.encode(line).byteLength + 1;
    if (bytes > maxBytes) throw new Error('Excel data expands beyond the 5 MB import limit.');
    lines.push(line);
  }
  return lines.join('\n');
}
function csvCell(value) { const text = value == null ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function showClientImportError(message) {
  bulkImportState.preview = { valid: false, totalRows: bulkImportState.rows.length, creates: 0, records: [], errors: [{ row: 0, field: 'file', message }] };
  renderBulkImportModal({ focusResult: true, announceResult: true });
}

async function downloadImportTemplate(format) {
  const schema = bulkImportState.schema;
  const headers = schema.columns.map(column => column.key);
  if (format === 'xlsx') {
    if (typeof writeXlsxFile !== 'function') { toast('Excel template writer failed to load.'); return; }
    try {
      const workbook = await buildGuidedImportWorkbook(schema);
      downloadImportBlob(workbook, `${schema.module}_import_template.xlsx`);
    } catch (error) { toast(error.message || 'Excel template could not be created.'); }
    return;
  }
  const blob = new Blob([headers.map(csvCell).join(',') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${schema.module}_import_template.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

async function buildGuidedImportWorkbook(schema) {
  const headerRow = schema.columns.map(column => ({
    value: column.key,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: column.required ? '#8b4513' : '#7a6858',
  }));
  const instructions = [
    [{ value: `${schema.label} Import Instructions`, fontWeight: 'bold' }, null, null, null],
    [{ value: 'Recommended format' }, { value: 'Use this .xlsx workbook and enter new records only on the first worksheet. The template places Import Data first; it may be renamed, but it must remain the first worksheet.' }, null, null],
    [{ value: 'Excel cell values' }, { value: 'Use pasted values only. Formulas are rejected; replace them with plain text or numbers before uploading.' }, null, null],
    [{ value: 'All-or-nothing rule' }, { value: 'One error blocks the entire file. Correct the workbook and preview it again.' }, null, null],
    [{ value: 'Existing records' }, { value: 'Names and SKUs match without case sensitivity, but punctuation and wording must otherwise match exactly. An existing matching record blocks the whole file; edit it in the portal instead.' }, null, null],
    [{ value: 'Before importing' }, { value: 'Review every new record. A matching SKU or name that already exists is blocked.' }, null, null],
    [{ value: 'Numbers and units' }, { value: 'Enter plain non-negative numbers only. Non-currency quantities may be up to 1,000,000,000 with no more than 6 decimal places; counts and days must be whole numbers. Do not type currency symbols, grouping commas, or units inside numeric cells; use the designated unit column.' }, null, null],
    [{ value: 'Relationships' }, { value: 'Referenced customers and suppliers must already exist and be active.' }, null, null],
    [
      { value: 'Column', fontWeight: 'bold', backgroundColor: '#e9dccf' },
      { value: 'Required', fontWeight: 'bold', backgroundColor: '#e9dccf' },
      { value: 'Accepted format', fontWeight: 'bold', backgroundColor: '#e9dccf' },
      { value: 'Meaning', fontWeight: 'bold', backgroundColor: '#e9dccf' },
    ],
    ...schema.columns.map(column => [
      { value: column.key, fontWeight: 'bold', height: 32, alignVertical: 'top' },
      { value: column.required ? 'Yes' : 'No', height: 32, alignVertical: 'top' },
      { value: importColumnFormat(column), height: 32, alignVertical: 'top', wrap: true },
      { value: column.description, height: 32, alignVertical: 'top', wrap: true },
    ]),
  ];
  const instructionHeaderRows = instructions.findIndex(row => row[0]?.value === 'Column') + 1;
  const listColumns = schema.columns.filter(column => column.validation?.allowedValues?.length);
  const listHeight = Math.max(1, ...listColumns.map(column => column.validation.allowedValues.length));
  const lists = listColumns.length
    ? Array.from({ length: listHeight + 1 }, (_, rowIndex) => listColumns.map(column => ({
        value: rowIndex === 0 ? column.key : (column.validation.allowedValues[rowIndex - 1] ?? null),
        ...(rowIndex === 0 ? { fontWeight: 'bold', backgroundColor: '#e9dccf' } : {}),
      })))
    : [[{ value: 'This module has no dropdown-only columns.', fontWeight: 'bold' }]];

  const workbook = await writeXlsxFile([
    { data: [headerRow], sheet: 'Import Data', columns: schema.columns.map(column => ({ width: Math.max(14, Math.min(34, column.label.length + 5)) })), stickyRowsCount: 1 },
    { data: instructions, sheet: 'Instructions', columns: [{ width: 26 }, { width: 14 }, { width: 44 }, { width: 76 }], stickyRowsCount: instructionHeaderRows },
    { data: lists, sheet: 'Lists', columns: listColumns.map(() => ({ width: 24 })), stickyRowsCount: 1 },
  ]).toBlob();
  return addGuidedWorkbookFeatures(workbook, schema);
}

function importColumnFormat(column) {
  const validation = column.validation || {};
  if (validation.allowedValues?.length) return `Choose: ${validation.allowedValues.join(', ')}`;
  if (validation.kind === 'identifier') return `Text, maximum ${validation.maxLength || 255} characters`;
  if (validation.kind === 'currency') return `Dollars, no symbol, 0-2 decimals${validation.unit ? ` (${validation.unit})` : ''}`;
  if (validation.kind === 'whole') return `Whole number, 0-${IMPORT_MAX_NON_CURRENCY_NUMBER.toLocaleString()}${validation.unit ? ` (${validation.unit})` : ''}`;
  if (validation.kind === 'decimal') return `Number, 0-${IMPORT_MAX_NON_CURRENCY_NUMBER.toLocaleString()}, up to ${IMPORT_MAX_DECIMAL_PLACES} decimals${validation.unit ? ` (${validation.unit})` : ''}`;
  return 'Plain text';
}

async function addGuidedWorkbookFeatures(workbook, schema) {
  const zip = await window.JSZip.loadAsync(await workbook.arrayBuffer());
  const textStyleId = await addExcelTextStyle(zip);
  const worksheetPaths = Object.keys(zip.files).filter(path => /^xl\/worksheets\/[^/]+\.xml$/i.test(path));
  const firstWorksheet = await resolveFirstWorksheetPath(zip, worksheetPaths);
  const entry = firstWorksheet ? zip.file(firstWorksheet) : null;
  if (!entry) throw new Error('Generated Excel template is missing its Import Data worksheet.');
  const documentNode = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Generated Excel template contains invalid worksheet XML.');
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const worksheet = documentNode.documentElement;
  const columns = Array.from(worksheet.getElementsByTagNameNS(namespace, 'col'));
  schema.columns.forEach((column, index) => {
    if (column.validation?.kind !== 'identifier') return;
    const excelIndex = index + 1;
    const columnNode = columns.find(node => Number(node.getAttribute('min')) <= excelIndex && Number(node.getAttribute('max')) >= excelIndex);
    if (columnNode) columnNode.setAttribute('style', String(textStyleId));
  });
  Array.from(worksheet.children).filter(element => element.localName === 'autoFilter' || element.localName === 'dataValidations')
    .forEach(element => worksheet.removeChild(element));

  const finalColumn = excelColumnName(schema.columns.length - 1);
  const autoFilter = documentNode.createElementNS(namespace, 'autoFilter');
  autoFilter.setAttribute('ref', `A1:${finalColumn}501`);
  insertWorksheetElement(worksheet, autoFilter);

  const validations = schema.columns.map((column, index) => createExcelDataValidation(documentNode, column, index)).filter(Boolean);
  if (validations.length) {
    const container = documentNode.createElementNS(namespace, 'dataValidations');
    container.setAttribute('count', String(validations.length));
    validations.forEach(validation => container.appendChild(validation));
    insertWorksheetElement(worksheet, container);
  }
  zip.file(firstWorksheet, new XMLSerializer().serializeToString(documentNode));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function addExcelTextStyle(zip) {
  const entry = zip.file('xl/styles.xml');
  if (!entry) throw new Error('Generated Excel template is missing its styles.');
  const documentNode = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Generated Excel template contains invalid styles XML.');
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const cellXfs = documentNode.getElementsByTagNameNS(namespace, 'cellXfs')[0];
  if (!cellXfs) throw new Error('Generated Excel template is missing cell styles.');
  const textStyleId = Array.from(cellXfs.children).filter(child => child.localName === 'xf').length;
  const style = documentNode.createElementNS(namespace, 'xf');
  style.setAttribute('numFmtId', '49');
  style.setAttribute('applyNumberFormat', '1');
  cellXfs.appendChild(style);
  cellXfs.setAttribute('count', String(textStyleId + 1));
  zip.file('xl/styles.xml', new XMLSerializer().serializeToString(documentNode));
  return textStyleId;
}

function createExcelDataValidation(documentNode, column, index) {
  const validation = column.validation;
  if (!validation?.kind) return null;
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const columnName = excelColumnName(index);
  const cell = `${columnName}2`;
  const element = documentNode.createElementNS(namespace, 'dataValidation');
  element.setAttribute('sqref', `${columnName}2:${columnName}501`);
  element.setAttribute('allowBlank', column.required ? '0' : '1');
  element.setAttribute('showErrorMessage', '1');
  element.setAttribute('showInputMessage', '1');
  element.setAttribute('errorTitle', 'Invalid import value');
  element.setAttribute('error', importColumnFormat(column));
  element.setAttribute('promptTitle', column.label);
  element.setAttribute('prompt', importColumnFormat(column));
  const formula = documentNode.createElementNS(namespace, 'formula1');
  if ((validation.kind === 'enum' || validation.kind === 'boolean') && validation.allowedValues?.length) {
    element.setAttribute('type', 'list');
    formula.textContent = `"${validation.allowedValues.join(',')}"`;
  } else {
    element.setAttribute('type', 'custom');
    formula.textContent = excelValidationFormula(column, cell);
  }
  element.appendChild(formula);
  return element;
}

function excelValidationFormula(column, cell) {
  const validation = column.validation || {};
  let check = 'TRUE';
  if (validation.kind === 'identifier') check = `LEN(${cell})<=${validation.maxLength || 255}`;
  if (validation.kind === 'decimal') check = `AND(ISNUMBER(${cell}),${cell}>=0,${cell}<=${IMPORT_MAX_NON_CURRENCY_NUMBER},ROUND(${cell},${IMPORT_MAX_DECIMAL_PLACES})=${cell})`;
  if (validation.kind === 'whole') check = `AND(ISNUMBER(${cell}),${cell}>=0,${cell}<=${IMPORT_MAX_NON_CURRENCY_NUMBER},MOD(${cell},1)=0)`;
  if (validation.kind === 'currency') check = `AND(ISNUMBER(${cell}),${cell}>=0,ROUND(${cell},2)=${cell})`;
  return column.required ? `AND(${cell}<>"",${check})` : `OR(${cell}="",${check})`;
}

function excelColumnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
  return name;
}

function insertWorksheetElement(worksheet, element) {
  const order = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
  const targetIndex = order.indexOf(element.localName);
  const next = Array.from(worksheet.children).find(child => order.indexOf(child.localName) > targetIndex);
  if (next) worksheet.insertBefore(element, next); else worksheet.appendChild(element);
}

function downloadImportBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function commitBulkImport() {
  if (!bulkImportState.preview?.valid || bulkImportState.busy) return;
  bulkImportState.busy = true; renderBulkImportModal();
  try {
    const result = await apiRequest(`/api/imports/${encodeURIComponent(bulkImportState.module)}/commit`, { method: 'POST', body: JSON.stringify({ headers: bulkImportState.headers, rows: bulkImportState.rows, rowNumbers: bulkImportState.rowNumbers, sourceFileBytes: bulkImportState.sourceFileBytes }) });
    await refreshAfterBulkImport(bulkImportState.module);
    closeModal();
    toast(`Imported ${importCountLabel(result.creates, 'new record')}.`);
    router(currentPage);
  } catch (error) {
    const serverPreview = error.envelope?.error?.details?.preview;
    bulkImportState.preview = serverPreview || { valid: false, totalRows: bulkImportState.rows.length, creates: 0, records: [], errors: [{ row: 0, field: 'file', message: error.message }] };
    bulkImportState.busy = false; renderBulkImportModal();
  }
}

async function refreshAfterBulkImport(moduleName) {
  if (moduleName === 'customers') { backendCustomerState.loaded = false; await loadBackendCustomers(); }
  if (moduleName === 'products') { backendProductState.loaded = false; await loadBackendProducts(); }
  if (moduleName === 'suppliers') await refreshA10DataRecordModule('suppliers', { force: true });
  if (moduleName === 'inventory') {
    backendMasterItemState.loaded = false; backendInventoryState.loaded = false;
    await Promise.all([loadBackendMasterItems(), loadBackendInventory()]);
  }
}
