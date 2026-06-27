/* =========================================================================
   SUPPLIERS
   ========================================================================= */
function renderSuppliers(el) {
  if (!a10DataRecordState.suppliers.loaded && !a10DataRecordState.suppliers.loading) {
    refreshA10DataRecordModule('suppliers').then(() => { if (currentPage === 'suppliers') router('suppliers'); }).catch(() => {});
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
          <th>Name</th><th>Products / Pricing</th><th>Contact</th><th>Email</th><th>Phone</th>
          <th>Website</th><th>MOQ</th><th>Documents</th><th></th>
        </tr></thead>
        <tbody>
        ${state.suppliers.length === 0 ? `<tr><td colspan="9" class="empty">No suppliers yet.</td></tr>` :
          state.suppliers.map(s => {
            const docs = s.docs || {};
            const docPills = VENDOR_DOC_TYPES.filter(d => docs[d.key]).map(d => {
              const f = docs[d.key];
              const href = f.fileId ? `/api/files/${encodeURIComponent(f.fileId)}/download` : (f.dataUrl || '#');
              return `<a href="${href}" download="${escapeHtml(f.name)}" class="pill" style="cursor:pointer;text-decoration:none" title="${escapeHtml(d.label)}: ${escapeHtml(f.name)}">&#128206; ${escapeHtml(d.label.split(' ')[0])}</a>`;
            }).join('');
            const docCount = Object.keys(docs).filter(k => docs[k]).length;
            const lines = Array.isArray(s.productLines) ? s.productLines : [];
            const productsCell = lines.length
              ? lines.map(pl => `<div style="font-size:12px"><strong>${escapeHtml(pl.product||'')}</strong> <span class="pill">${escapeHtml(pl.type||'')}</span> ${pl.pricePerLb!==''&&pl.pricePerLb!=null ? '<span style="color:var(--brown-light)">'+fmtMoney(pl.pricePerLb)+'/lb</span>' : ''}</div>`).join('')
              : (s.products ? `<div style="font-size:12px;color:var(--brown-light)">${escapeHtml(s.products)}</div>` : '<span style="font-size:12px;color:var(--brown-light)">&mdash;</span>');
            return `
            <tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${productsCell}</td>
              <td>${escapeHtml(s.contact||'')}</td>
              <td><a href="mailto:${escapeHtml(s.email||'')}" style="color:var(--orange)">${escapeHtml(s.email||'')}</a></td>
              <td>${escapeHtml(s.phone||'')}</td>
              <td>${s.website ? `<a href="https://${escapeHtml(s.website)}" target="_blank" style="color:var(--orange)">${escapeHtml(s.website)}</a>` : ''}</td>
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
let supplierEditingProducts = []; // [{ product, type, pricePerLb }]
function editSupplier(id) {
  const s = state.suppliers.find(x=>x.id===id) || { id: uid('s'), name:'', contact:'', email:'', phone:'', website:'', moq:'', products:'', productLines:[], notes:'', files: [], docs: {} };
  s.docs = s.docs || {};
  s.files = s.files || [];
  const isNew = !id;
  // initialize editing buffer (clones of existing docs)
  supplierEditingDocs = {};
  VENDOR_DOC_TYPES.forEach(d => {
    supplierEditingDocs[d.key] = s.docs[d.key] ? { ...s.docs[d.key] } : null;
  });
  supplierEditingProducts = Array.isArray(s.productLines) ? s.productLines.map(p => ({ ...p })) : [];
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
          <strong style="color:var(--brown);font-size:13px">Products / Pricing</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addSupplierProduct()">+ Add Product</button>
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
  if (!supplierEditingProducts.length) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--brown-light);padding:4px 0">No products yet. Click "+ Add Product".</div>';
    return;
  }
  const grid = 'grid-template-columns:2fr 1.2fr 1fr 40px';
  cont.innerHTML = `
    <div class="po-line" style="${grid};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Product</div><div>Type</div><div>Price / lb</div><div></div>
    </div>
    ${supplierEditingProducts.map((p, i) => `
      <div class="po-line" style="${grid}">
        <input type="text" value="${escapeHtml(p.product||'')}" placeholder="Product name" onchange="supplierProductChange(${i},'product',this.value)" />
        <select onchange="supplierProductChange(${i},'type',this.value)">
          <option ${p.type==='Ingredient'?'selected':''}>Ingredient</option>
          <option ${p.type==='Packaging'?'selected':''}>Packaging</option>
        </select>
        <input type="number" step="0.01" min="0" value="${p.pricePerLb!=null?p.pricePerLb:''}" placeholder="0.00" onchange="supplierProductChange(${i},'pricePerLb',this.value)" />
        <button type="button" onclick="removeSupplierProduct(${i})">&times;</button>
      </div>
    `).join('')}
  `;
}
function addSupplierProduct() {
  supplierEditingProducts.push({ product:'', type:'Ingredient', pricePerLb:'' });
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

function renderSupplierDocsList() {
  const cont = document.getElementById('sup_docs_list');
  if (!cont) return;
  cont.innerHTML = VENDOR_DOC_TYPES.map(d => {
    const f = supplierEditingDocs[d.key];
    const href = f?.fileId ? `/api/files/${encodeURIComponent(f.fileId)}/download` : (f?.dataUrl || '#');
    return `
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--grey-light);border-radius:6px;margin-bottom:6px;background:var(--white)">
        <div>
          <div style="font-weight:600;color:var(--brown);font-size:13px">${escapeHtml(d.label)}</div>
          ${f
            ? `<div style="margin-top:3px"><a href="${href}" download="${escapeHtml(f.name)}" style="color:var(--orange);text-decoration:none;font-size:12px">&#128206; ${escapeHtml(f.name)}</a> <span style="color:var(--brown-light);font-size:11px">(${formatBytes(f.size)})</span></div>`
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
  const productLines = supplierEditingProducts.filter(p => (p.product||'').trim());
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

