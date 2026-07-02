/* =========================================================================
   SUPPLIERS
   ========================================================================= */
function formatSupplierPricePerLb(value) {
  return '$' + Number(value || 0).toFixed(4);
}

function ensureSupplierInventoryLoaded() {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendInventoryState.loaded && !backendInventoryState.loading) {
    loadBackendInventory()
      .then(() => {
        if (currentPage === 'suppliers') {
          renderSupplierProductsList();
        }
      });
  }
}

function supplierEligibleInventoryItems() {
  return (state.ingredients || [])
    .filter(item => item.category !== 'Finished Good')
    .filter(item => (item.category || 'Ingredient') === 'Ingredient' || item.category === 'Packaging')
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function supplierHasEligibleInventoryItems() {
  return supplierEligibleInventoryItems().length > 0;
}

function supplierInventoryItemLabel(item) {
  const category = item.category || 'Ingredient';
  const unit = item.unit ? `, ${item.unit}` : '';
  return `${item.name || 'Unnamed item'} (${category}${unit})`;
}

function supplierLineResolution(line = {}) {
  const items = supplierEligibleInventoryItems();
  const selected = items.find(item =>
    item.id === line.inventoryItemId ||
    item._backendId === line.inventoryItemId
  );
  const inventoryItemId = selected ? (selected._backendId || selected.id) : (line.inventoryItemId || '');
  const product = selected ? selected.name : (line.product || line.itemName || '');
  const legacyUnlinked = Boolean(!inventoryItemId && product);
  return {
    selected,
    missing: Boolean(inventoryItemId && !selected),
    legacyUnlinked,
    line: {
      ...line,
      inventoryItemId,
      product,
      itemName: product,
      type: selected ? (selected.category || 'Ingredient') : (line.type || 'Ingredient'),
      unit: selected ? (selected.unit || '') : (line.unit || '')
    }
  };
}

function supplierLineWithInventorySnapshot(line = {}) {
  return supplierLineResolution(line).line;
}

function supplierInventoryUnavailableMessage() {
  if (backendInventoryState.loading) {
    return 'Loading Ingredient and Packaging inventory before supplier pricing can be edited.';
  }
  if (backendInventoryState.status === 'error') {
    return backendInventoryState.lastError || 'Backend unavailable. Supplier pricing cannot be linked to current inventory right now.';
  }
  return 'No raw material or packaging inventory items are available. Add them in Inventory first, then assign supplier pricing here.';
}

function supplierWebsiteHref(website) {
  const value = (website || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function supplierDocumentLinkHtml(file, label = '') {
  if (!file) return '';
  if (file.fileId) {
    const href = `/api/files/${encodeURIComponent(file.fileId)}/download`;
    return `<a href="${href}" download="${escapeHtml(file.name)}" style="color:var(--orange);text-decoration:none;font-size:12px">&#128206; ${escapeHtml(file.name)}</a>`;
  }
  if (file.dataUrl) {
    return `<a href="${file.dataUrl}" download="${escapeHtml(file.name)}" style="color:var(--orange);text-decoration:none;font-size:12px">&#128206; ${escapeHtml(file.name)}</a>`;
  }
  return `<span style="color:var(--brown);font-size:12px">&#128206; ${escapeHtml(file.name || label || 'Selected file')}</span> <span class="pill">Pending upload</span>`;
}

function renderSuppliers(el) {
  ensureSupplierInventoryLoaded();
  if (!a10DataRecordState.suppliers.loaded && !a10DataRecordState.suppliers.loading) {
    refreshA10DataRecordModule('suppliers')
      .then(() => { if (currentPage === 'suppliers') router('suppliers'); })
      .catch(err => {
        toast(err.message || 'Suppliers could not be loaded from the backend.');
        if (currentPage === 'suppliers') router('suppliers');
      });
  }
  el.innerHTML = `
    ${renderA10DataRecordBanner('suppliers')}
    <div class="card">
      <div class="card-header">
        <h2>Suppliers</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('suppliers.csv', state.suppliers)">Export CSV</button>
          <button class="btn" onclick="editSupplier()">+ Add Supplier</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Name</th><th>Raw Materials / Pricing</th><th>Contact</th><th>Email</th><th>Phone</th>
          <th>Website</th><th>MOQ</th><th>Documents</th><th></th>
        </tr></thead>
        <tbody>
        ${state.suppliers.length === 0 ? `<tr><td colspan="9" class="empty">No suppliers yet.</td></tr>` :
          state.suppliers.map(s => {
            const docs = s.docs || {};
            const docPills = VENDOR_DOC_TYPES.filter(d => docs[d.key]).map(d => {
              const f = docs[d.key];
              if (!f.fileId && !f.dataUrl) return `<span class="pill" title="${escapeHtml(d.label)}: pending upload">&#128206; ${escapeHtml(d.label.split(' ')[0])} pending</span>`;
              const href = f.fileId ? `/api/files/${encodeURIComponent(f.fileId)}/download` : f.dataUrl;
              return `<a href="${href}" download="${escapeHtml(f.name)}" class="pill" style="cursor:pointer;text-decoration:none" title="${escapeHtml(d.label)}: ${escapeHtml(f.name)}">&#128206; ${escapeHtml(d.label.split(' ')[0])}</a>`;
            }).join('');
            const docCount = Object.keys(docs).filter(k => docs[k]).length;
            const lines = Array.isArray(s.productLines) ? s.productLines : [];
            const productsCell = lines.length
              ? lines.map(pl => `<div style="font-size:12px"><strong>${escapeHtml(pl.product||pl.itemName||'')}</strong> <span class="pill">${escapeHtml(pl.type||'')}</span> ${pl.pricePerLb!==''&&pl.pricePerLb!=null ? '<span style="color:var(--brown-light)">'+formatSupplierPricePerLb(pl.pricePerLb)+'/lb</span>' : ''}</div>`).join('')
              : (s.products ? `<div style="font-size:12px;color:var(--brown-light)">${escapeHtml(s.products)}</div>` : '<span style="font-size:12px;color:var(--brown-light)">&mdash;</span>');
            return `
            <tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${productsCell}</td>
              <td>${escapeHtml(s.contact||'')}</td>
              <td><a href="mailto:${escapeHtml(s.email||'')}" style="color:var(--orange)">${escapeHtml(s.email||'')}</a></td>
              <td>${escapeHtml(s.phone||'')}</td>
              <td>${s.website ? `<a href="${escapeHtml(supplierWebsiteHref(s.website))}" target="_blank" style="color:var(--orange)">${escapeHtml(s.website)}</a>` : ''}</td>
              <td>${s.moq||'-'}</td>
              <td>${docCount === 0
                ? '<span style="font-size:12px;color:var(--brown-light)">-</span>'
                : `<div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;color:var(--brown-light);font-weight:600">${docCount} of ${VENDOR_DOC_TYPES.length}</span><div style="display:flex;flex-wrap:wrap;gap:3px">${docPills}</div></div>`
              }</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editSupplier('${s.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteSupplier('${s.id}')">Delete</button>
              </td>
            </tr>
          `;}).join('')
        }
        </tbody>
      </table></div>
    </div>
  `;
}
let supplierEditingDocs = {}; // { docKey: {name,type,size,dataUrl} | null }
let supplierEditingProducts = []; // [{ inventoryItemId, product, itemName, type, pricePerLb }]
function editSupplier(id) {
  ensureSupplierInventoryLoaded();
  const s = state.suppliers.find(x=>x.id===id) || { id: uid('s'), name:'', contact:'', email:'', phone:'', website:'', moq:'', products:'', productLines:[], notes:'', files: [], docs: {} };
  s.docs = s.docs || {};
  s.files = s.files || [];
  const isNew = !id;
  // initialize editing buffer (clones of existing docs)
  supplierEditingDocs = {};
  VENDOR_DOC_TYPES.forEach(d => {
    supplierEditingDocs[d.key] = s.docs[d.key] ? { ...s.docs[d.key] } : null;
  });
  supplierEditingProducts = Array.isArray(s.productLines) ? s.productLines.map(p => supplierLineWithInventorySnapshot(p)) : [];
  openModal((isNew?'Add':'Edit')+' Supplier', `
    <form onsubmit="event.preventDefault();saveSupplier('${s.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Name</label><input id="sup_name" value="${escapeHtml(s.name)}" required /></div>
        <div class="form-row"><label>Contact Person</label><input id="sup_contact" value="${escapeHtml(s.contact)}" /></div>
        <div class="form-row"><label>Email</label><input type="email" id="sup_email" value="${escapeHtml(s.email)}" /></div>
        <div class="form-row"><label>Phone</label><input id="sup_phone" value="${escapeHtml(s.phone)}" /></div>
        <div class="form-row"><label>Website</label><input id="sup_website" value="${escapeHtml(s.website)}" placeholder="e.g. example.com" /></div>
        <div class="form-row"><label>MOQ</label><input type="number" id="sup_moq" value="${s.moq||''}" /></div>
      </div>
      <div style="margin-top:18px;padding:12px;background:var(--beige-light);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:var(--brown);font-size:13px">Raw Materials / Pricing</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addSupplierProduct()" ${supplierHasEligibleInventoryItems() ? '' : 'disabled title="Add Ingredient or Packaging inventory first"'}>+ Add Raw Material</button>
        </div>
        <div id="sup_products_list" style="margin-top:6px"></div>
      </div>
      <div style="margin-top:18px;padding:12px;background:var(--beige-light);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:var(--brown);font-size:13px">Supplier Onboarding Documents</strong>
          <span style="font-size:11px;color:var(--brown-light)">All optional &middot; Max 5 MB each</span>
        </div>
        <div id="sup_docs_list" style="margin-top:6px"></div>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Notes</label>
        <textarea id="sup_notes">${escapeHtml(s.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Supplier':'Save Changes'}</button>
      </div>
    </form>
  `);
  renderSupplierProductsList();
  renderSupplierDocsList();
}
function renderSupplierProductsList() {
  const cont = document.getElementById('sup_products_list');
  if (!cont) return;
  const inventoryItems = supplierEligibleInventoryItems();
  if (!supplierEditingProducts.length) {
    cont.innerHTML = `<div style="font-size:12px;color:var(--brown-light);padding:4px 0">${inventoryItems.length ? 'No raw materials yet. Click "+ Add Raw Material".' : escapeHtml(supplierInventoryUnavailableMessage())}</div>`;
    return;
  }
  const grid = 'grid-template-columns:2fr 1.2fr 1fr 40px';
  cont.innerHTML = `
    ${!inventoryItems.length ? `<div style="font-size:12px;color:var(--danger);margin-bottom:8px">${escapeHtml(supplierInventoryUnavailableMessage())}</div>` : ''}
    <div class="po-line" style="${grid};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Raw Material</div><div>Type</div><div>Price / lb</div><div></div>
    </div>
    ${supplierEditingProducts.map((raw, i) => {
      const resolution = supplierLineResolution(raw);
      const p = resolution.line;
      const missingLabel = p.product || p.itemName || p.inventoryItemId || 'Previously linked inventory item';
      return `
      <div class="po-line" style="${grid}">
        <select ${resolution.legacyUnlinked ? '' : 'required'} onchange="supplierInventoryItemSelected(${i},this.value)">
          <option value="">- Select raw material -</option>
          ${resolution.legacyUnlinked ? `<option value="" selected disabled>Legacy unlinked item: ${escapeHtml(missingLabel)}</option>` : ''}
          ${resolution.missing ? `<option value="${escapeHtml(p.inventoryItemId)}" selected disabled>Missing inventory: ${escapeHtml(missingLabel)}</option>` : ''}
          ${inventoryItems.map(item => {
            const value = item._backendId || item.id;
            return `<option value="${escapeHtml(value)}" ${p.inventoryItemId===value?'selected':''}>${escapeHtml(supplierInventoryItemLabel(item))}</option>`;
          }).join('')}
        </select>
        <div style="font-size:13px;color:${resolution.missing ? 'var(--danger)' : 'var(--brown)'};font-weight:600">${escapeHtml(resolution.missing ? 'Missing link' : (resolution.legacyUnlinked ? 'Legacy unlinked' : (p.type || '-')))}</div>
        <input type="number" step="0.0001" min="0" value="${p.pricePerLb!=null?p.pricePerLb:''}" placeholder="0.0000" onchange="supplierProductChange(${i},'pricePerLb',this.value)" />
        <button type="button" onclick="removeSupplierProduct(${i})">&times;</button>
      </div>
    `;}).join('')}
  `;
}
function addSupplierProduct() {
  if (!supplierHasEligibleInventoryItems()) {
    toast(supplierInventoryUnavailableMessage());
    return;
  }
  supplierEditingProducts.push({ inventoryItemId:'', product:'', itemName:'', type:'Ingredient', pricePerLb:'' });
  renderSupplierProductsList();
}
function removeSupplierProduct(i) {
  supplierEditingProducts.splice(i, 1);
  renderSupplierProductsList();
}
function supplierProductChange(i, field, value) {
  if (field === 'pricePerLb') value = (value === '' ? '' : (parseFloat(value) || 0));
  supplierEditingProducts[i][field] = value;
}
function supplierInventoryItemSelected(i, inventoryItemId) {
  const item = supplierEligibleInventoryItems().find(row => row.id === inventoryItemId || row._backendId === inventoryItemId);
  supplierEditingProducts[i] = {
    ...supplierEditingProducts[i],
    inventoryItemId,
    product: item?.name || '',
    itemName: item?.name || '',
    type: item?.category || 'Ingredient'
  };
  renderSupplierProductsList();
}

function renderSupplierDocsList() {
  const cont = document.getElementById('sup_docs_list');
  if (!cont) return;
  cont.innerHTML = VENDOR_DOC_TYPES.map(d => {
    const f = supplierEditingDocs[d.key];
    return `
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--grey-light);border-radius:6px;margin-bottom:6px;background:var(--white)">
        <div>
          <div style="font-weight:600;color:var(--brown);font-size:13px">${escapeHtml(d.label)}</div>
          ${f
            ? `<div style="margin-top:3px">${supplierDocumentLinkHtml(f, d.label)} <span style="color:var(--brown-light);font-size:11px">(${formatBytes(f.size)})</span></div>`
            : `<div style="font-size:12px;color:var(--brown-light);margin-top:3px">Not uploaded</div>`
          }
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="file" id="sup_doc_input_${d.key}" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" style="display:none" onchange="supplierDocPicked(event,'${d.key}')" />
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('sup_doc_input_${d.key}').click()">${f?'Replace':'Upload'}</button>
          ${f ? `<button type="button" class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="removeSupplierDoc('${d.key}')">Remove</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
function supplierDocPicked(e, docKey) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast(`File too large (max 5 MB).`); e.target.value = ''; return; }
  supplierEditingDocs[docKey] = { name: f.name, type: f.type, size: f.size, file: f };
  e.target.value = '';
  renderSupplierDocsList();
}
function removeSupplierDoc(docKey) {
  supplierEditingDocs[docKey] = null;
  renderSupplierDocsList();
}

async function saveSupplier(id, isNew) {
  const docs = {};
  VENDOR_DOC_TYPES.forEach(d => {
    if (supplierEditingDocs[d.key]) {
      const { file, ...docMeta } = supplierEditingDocs[d.key];
      docs[d.key] = docMeta;
    }
  });
  const existing = state.suppliers.find(s=>s.id===id);
  const resolvedProductLines = supplierEditingProducts.map(p => supplierLineWithInventorySnapshot(p));
  const hasBlankNewLine = resolvedProductLines.some(p => !p.inventoryItemId && !(p.product || p.itemName));
  if (hasBlankNewLine) {
    toast('Choose an existing raw material or packaging inventory item for each supplier line.');
    return;
  }
  const productLines = resolvedProductLines.filter(p => p.inventoryItemId || p.product || p.itemName);
  const data = {
    id,
    name: document.getElementById('sup_name').value,
    contact: document.getElementById('sup_contact').value,
    email: document.getElementById('sup_email').value,
    phone: document.getElementById('sup_phone').value,
    website: document.getElementById('sup_website').value,
    moq: parseInt(document.getElementById('sup_moq').value, 10) || 0,
    productLines,
    notes: document.getElementById('sup_notes').value,
    docs,
    files: existing?.files || []  // preserve any legacy generic files
  };
  try {
    let saved = await saveA10DataRecord('suppliers', 'supplier', data, { recordId: isNew ? null : (existing?._backendId || id) });
    const uploadedDocs = { ...docs };
    let uploadedAny = false;
    for (const d of VENDOR_DOC_TYPES) {
      const pending = supplierEditingDocs[d.key];
      if (!pending?.file) continue;
      const uploaded = await uploadA10FileReference('supplier', saved.id, 'supplier_document', pending.file);
      uploadedDocs[d.key] = { name: pending.name, type: pending.type, size: pending.size, fileId: uploaded.id };
      uploadedAny = true;
    }
    if (uploadedAny) {
      saved = await saveA10DataRecord('suppliers', 'supplier', { ...data, docs: uploadedDocs, fileIds: Object.values(uploadedDocs).map(doc => doc.fileId).filter(Boolean) }, { recordId: saved.id });
    }
    closeModal();
    router('suppliers');
    toast('Supplier saved.');
  } catch (err) {
    toast(err.message || 'Supplier could not be saved to the backend.');
  }
}
async function deleteSupplier(id) {
  const supplier = getSupplier(id);
  const ok = await openConfirmModal({
    title: 'Delete supplier',
    record: supplier?.name || id,
    message: 'Delete this supplier record?',
    risk: 'Supplier references on existing demo records may show as blank.',
    confirmLabel: 'Delete Supplier',
    tone: 'danger'
  });
  if (!ok) return;
  try {
    await archiveA10DataRecord('suppliers', supplier?._backendId || id);
    router('suppliers');
    toast('Supplier deleted.');
  } catch (err) {
    toast(err.message || 'Supplier could not be deleted from the backend.');
  }
}

