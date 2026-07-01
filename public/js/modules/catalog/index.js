/* =========================================================================
   CUSTOMERS & PRODUCTS
   ========================================================================= */
function renderCustomers(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendCustomerState.loaded && !backendCustomerState.loading) {
    loadBackendCustomers().then(() => { if (currentPage === 'customers') router('customers'); });
  }
  el.innerHTML = `
    ${renderBackendDataStatusBanner('customers', backendCustomerState)}
    <div class="card">
      <div class="card-header">
        <h2>Customers</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('customers.csv', state.customers)">Export CSV</button>
          <button class="btn" onclick="editCustomer()">+ Add Customer</button>
        </div>
      </div>
      <div class="table-wrap"><table class="customer-table">
        <colgroup>
          <col class="customer-company-col">
          <col class="customer-contact-col">
          <col class="customer-contact-col">
          <col class="customer-contact-col">
          <col class="customer-contact-col">
          <col class="customer-file-col">
          <col class="customer-file-col">
          <col class="customer-actions-col">
        </colgroup>
        <thead><tr>
          <th>Company Name</th><th>Sales Contact</th><th>Shipping Contact</th><th>Billing Contact</th><th>Food Safety Contact</th>
          <th>Spec Sheet</th><th>Co-Packing Agreement</th><th class="customer-actions-header">Actions</th>
        </tr></thead>
        <tbody>
          ${state.customers.length === 0 ? `<tr><td colspan="8" class="empty">No customers yet.</td></tr>` :
            state.customers.map(c => {
              const sheet = c.specSheet;
              const agreement = c.copackingAgreement;
              const contactCell = (role) => {
                const r = c[role];
                if (!r || (!r.name && !r.email && !r.phone)) return '<span style="color:var(--brown-light);font-size:12px">&mdash;</span>';
                return `
                  ${r.name ? `<div style="font-weight:600;font-size:13px">${escapeHtml(r.name)}</div>` : ''}
                  ${r.email ? `<div style="font-size:11px"><a href="mailto:${escapeHtml(r.email)}" style="color:var(--orange);text-decoration:none">${escapeHtml(r.email)}</a></div>` : ''}
                  ${r.phone ? `<div style="font-size:11px;color:var(--brown-light)">${escapeHtml(r.phone)}</div>` : ''}
                `;
              };
              return `<tr>
                <td>
                  <strong>${escapeHtml(c.name)}</strong>
                  ${c.email ? `<div style="font-size:11px"><a href="mailto:${escapeHtml(c.email)}" style="color:var(--orange);text-decoration:none">${escapeHtml(c.email)}</a></div>` : ''}
                  ${c.phone ? `<div style="font-size:11px;color:var(--brown-light)">${escapeHtml(c.phone)}</div>` : ''}
                </td>
                <td>${contactCell('salesContact')}</td>
                <td>${contactCell('shippingContact')}</td>
                <td>${contactCell('billingContact')}</td>
                <td>${contactCell('foodSafetyContact')}</td>
                <td>${sheet
                  ? `<a href="${sheet.dataUrl}" download="${escapeHtml(sheet.name||sheet.fileName||'spec-sheet')}" class="btn btn-icon btn-sm" style="text-decoration:none">&#128196; ${escapeHtml((sheet.name||sheet.fileName||'spec').slice(0,18))}</a>`
                  : '<span style="font-size:12px;color:var(--brown-light)">&mdash;</span>'
                }</td>
                <td>${agreement
                  ? `<a href="${agreement.dataUrl}" download="${escapeHtml(agreement.name||agreement.fileName||'agreement')}" class="btn btn-icon btn-sm" style="text-decoration:none">&#128196; ${escapeHtml((agreement.name||agreement.fileName||'agreement').slice(0,18))}</a>`
                  : '<span style="font-size:12px;color:var(--brown-light)">&mdash;</span>'
                }</td>
                <td class="customer-actions-cell">
                  <div class="row-actions">
                    <button class="btn btn-icon btn-sm" onclick="editCustomer('${c.id}')">Edit</button>
                    <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteCustomer('${c.id}')">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join('')
          }
        </tbody>
      </table></div>
    </div>
  `;
}
const CUSTOMER_CONTACT_ROLES = [
  { key: 'salesContact',      label: 'Sales Contact' },
  { key: 'shippingContact',   label: 'Shipping Contact' },
  { key: 'billingContact',    label: 'Billing Contact' },
  { key: 'foodSafetyContact', label: 'Food Safety Contact' }
];
function editCustomer(id) {
  const c = state.customers.find(x=>x.id===id) || { id: uid('c'), name:'', contact:'', email:'', phone:'', address:'', notes:'', specSheet:null, copackingAgreement:null };
  // ensure each role exists with sub-fields
  CUSTOMER_CONTACT_ROLES.forEach(r => { if (!c[r.key]) c[r.key] = { name:'', email:'', phone:'' }; });
  const isNew = !id;
  openModal((isNew?'Add':'Edit')+' Customer', `
    <form onsubmit="event.preventDefault();saveCustomer('${c.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Company Name</label><input id="cust_name" value="${escapeHtml(c.name)}" required /></div>
        <div class="form-row"><label>Main Email</label><input type="email" id="cust_email" value="${escapeHtml(c.email)}" /></div>
        <div class="form-row"><label>Main Phone</label><input id="cust_phone" value="${escapeHtml(c.phone)}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Address</label>
        <input id="cust_address" value="${escapeHtml(c.address||'')}" />
      </div>
      <div style="margin-top:18px;padding:12px;background:var(--beige-light);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:var(--brown);font-size:13px">Contacts by Role</strong>
          <span style="font-size:11px;color:var(--brown-light)">All optional</span>
        </div>
        ${CUSTOMER_CONTACT_ROLES.map(r => {
          const v = c[r.key] || {};
          return `
            <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:10px 12px;margin-bottom:8px">
              <div style="font-weight:700;color:var(--brown);font-size:12px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${escapeHtml(r.label)}</div>
              <div class="form-grid">
                <div class="form-row"><label>Name</label><input id="cust_${r.key}_name" value="${escapeHtml(v.name||'')}" /></div>
                <div class="form-row"><label>Email</label><input type="email" id="cust_${r.key}_email" value="${escapeHtml(v.email||'')}" /></div>
                <div class="form-row"><label>Phone</label><input id="cust_${r.key}_phone" value="${escapeHtml(v.phone||'')}" /></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="form-row" style="margin-top:14px"><label>Spec Sheet</label>
        <div class="file-upload">
          <input type="file" id="cust_spec_input" accept=".pdf,.doc,.docx,image/*" onchange="customerFileSelected(event,'spec')" />
          <div class="file-info ${c.specSheet?'has':''}" id="cust_spec_info">
            ${c.specSheet ? `&#128206; ${escapeHtml(c.specSheet.name||c.specSheet.fileName||'file')} (${Math.round((c.specSheet.size||0)/1024)} KB)` : 'No spec sheet uploaded.'}
          </div>
          ${c.specSheet ? `<button type="button" class="btn btn-icon btn-sm" onclick="clearCustomerFile('spec')">Remove</button>` : ''}
        </div>
        <input type="hidden" id="cust_spec_data" value='${c.specSheet ? JSON.stringify(c.specSheet).replace(/'/g, "&#039;") : ""}' />
      </div>
      <div class="form-row" style="margin-top:14px"><label>Co-Packing Agreement</label>
        <div class="file-upload">
          <input type="file" id="cust_agree_input" accept=".pdf,.doc,.docx,image/*" onchange="customerFileSelected(event,'agree')" />
          <div class="file-info ${c.copackingAgreement?'has':''}" id="cust_agree_info">
            ${c.copackingAgreement ? `&#128206; ${escapeHtml(c.copackingAgreement.name||c.copackingAgreement.fileName||'file')} (${Math.round((c.copackingAgreement.size||0)/1024)} KB)` : 'No co-packing agreement uploaded.'}
          </div>
          ${c.copackingAgreement ? `<button type="button" class="btn btn-icon btn-sm" onclick="clearCustomerFile('agree')">Remove</button>` : ''}
        </div>
        <input type="hidden" id="cust_agree_data" value='${c.copackingAgreement ? JSON.stringify(c.copackingAgreement).replace(/'/g, "&#039;") : ""}' />
      </div>
      <div class="form-row" style="margin-top:10px"><label>Notes</label>
        <textarea id="cust_notes">${escapeHtml(c.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Customer':'Save Changes'}</button>
      </div>
    </form>
  `);
}
function customerFileSelected(e, kind) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const data = { name: f.name, type: f.type, size: f.size, dataUrl: reader.result };
    document.getElementById('cust_'+kind+'_data').value = JSON.stringify(data);
    const info = document.getElementById('cust_'+kind+'_info');
    info.innerHTML = `&#128206; ${escapeHtml(f.name)} (${Math.round(f.size/1024)} KB)`;
    info.classList.add('has');
  };
  reader.readAsDataURL(f);
}
function clearCustomerFile(kind) {
  document.getElementById('cust_'+kind+'_data').value = '';
  document.getElementById('cust_'+kind+'_input').value = '';
  const info = document.getElementById('cust_'+kind+'_info');
  info.textContent = kind === 'spec' ? 'No spec sheet uploaded.' : 'No co-packing agreement uploaded.';
  info.classList.remove('has');
}
async function saveCustomer(id, isNew) {
  let specSheet = null, copackingAgreement = null;
  const sd = document.getElementById('cust_spec_data').value;
  const ad = document.getElementById('cust_agree_data').value;
  if (sd) { try { specSheet = JSON.parse(sd); } catch(e){} }
  if (ad) { try { copackingAgreement = JSON.parse(ad); } catch(e){} }
  const data = {
    id,
    name: document.getElementById('cust_name').value,
    email: document.getElementById('cust_email').value,
    phone: document.getElementById('cust_phone').value,
    address: document.getElementById('cust_address').value,
    notes: document.getElementById('cust_notes').value,
    specSheet,
    copackingAgreement
  };
  // capture each role's name/email/phone
  CUSTOMER_CONTACT_ROLES.forEach(r => {
    data[r.key] = {
      name:  document.getElementById('cust_'+r.key+'_name').value,
      email: document.getElementById('cust_'+r.key+'_email').value,
      phone: document.getElementById('cust_'+r.key+'_phone').value
    };
  });
  const existing = state.customers.find(c=>c.id===id);
  if (!requireEmployeeBackendWrite(backendCustomerState)) return;
  if (!isNew && !existing?._backendId) return failBackendRequiredWrite(null, backendCustomerState, 'This customer is not backend-backed. Nothing was saved locally.');
  const payload = {
    name: data.name,
    contactName: data.contact || data.salesContact?.name || null,
    contactEmail: data.email || data.salesContact?.email || null,
    phone: data.phone || null
  };
  try {
    const saved = isNew
      ? await apiRequest('/api/customers', { method: 'POST', body: JSON.stringify(payload) })
      : await apiRequest(`/api/customers/${encodeURIComponent(existing?._backendId || '')}`, { method: 'PATCH', body: JSON.stringify(payload) });
    mergeBackendCustomers([saved]);
    backendCustomerState.status = 'connected';
    backendCustomerState.lastError = '';
    closeModal();
    router('customers');
    toast(isNew ? 'Customer added to backend.' : 'Customer saved to backend.');
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendCustomerState);
    return;
  }
}
async function deleteCustomer(id) {
  const used = state.products.find(p => p.customerId === id);
  if (used) { toast('Remove or reassign products linked to this customer first.'); return; }
  const customer = getCustomer(id);
  const ok = await openConfirmModal({
    title: 'Delete customer',
    record: customer?.name || id,
    message: 'Delete this customer record?',
    risk: 'Customer-linked setup records should be reassigned first.',
    confirmLabel: 'Delete Customer',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendCustomerState)) return;
  if (!customer?._backendId) return failBackendRequiredWrite(null, backendCustomerState, 'Customer delete requires backend confirmation. Nothing was saved locally.');
  try {
    await archiveBackendCustomer(customer._backendId);
    backendCustomerState.status = 'connected';
    backendCustomerState.lastError = '';
    saveState();
    router('customers');
    toast('Customer archived in backend.');
  } catch (error) {
    failBackendRequiredWrite(error, backendCustomerState);
  }
}
let editingFormula = []; // [{ingredientId, qty, pct}]
const pendingProductMediaFiles = { product: null, nfp: null };
const FORMULA_GRID = 'grid-template-columns:2fr 1fr 1fr 0.7fr 1fr 40px';
const CASE_STICKER_OPTIONS = ['', '2x3', 'Keyence'];
function editProduct(id) {
  const p = state.products.find(x=>x.id===id) || { id: uid('p'), name:'', sku:'', customerId:'', price:0, room:'Main', notes:'', size:'', sizeUnit:'oz', caseQty: 0, caseSticker: '', kosher: false, dailyProductionRate: 0, allergen: false, allergenDetails: '', productImage: null, nfpImage: null };
  const isNew = !id;
  editingFormula = (state.boms[p.id] || []).map(b => ({ ingredientId: b.ingredientId, qty: b.qty, pct: typeof b.pct === 'number' ? b.pct : 0 }));
  // For legacy formulas with no pct, auto-distribute proportionally based on qty
  if (editingFormula.length && editingFormula.every(r => !r.pct)) {
    const totalQty = editingFormula.reduce((s, r) => s + (r.qty || 0), 0);
    if (totalQty > 0) {
      editingFormula.forEach(r => { r.pct = +(((r.qty || 0) / totalQty) * 100).toFixed(2); });
      // ensure sum is exactly 100 (drop rounding diff onto first row)
      const sum = editingFormula.reduce((s, r) => s + r.pct, 0);
      if (Math.abs(sum - 100) > 0.001 && editingFormula.length) editingFormula[0].pct = +(editingFormula[0].pct + (100 - sum)).toFixed(2);
    }
  }
  openModal((isNew?'Add':'Edit')+' Product', `
    <form onsubmit="event.preventDefault();saveProduct('${p.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>SKU</label><input id="prod_sku" value="${escapeHtml(p.sku)}" required /></div>
        <div class="form-row"><label>Name</label><input id="prod_name" value="${escapeHtml(p.name)}" required /></div>
        <div class="form-row"><label>Customer</label>
          <select id="prod_customer" required>
            <option value="">- Select -</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${p.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Production Room</label>
          <select id="prod_room">
            ${ROOMS.map(r=>`<option ${p.room===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Size</label><input type="number" step="0.01" id="prod_size" value="${p.size||''}" placeholder="16" /></div>
        <div class="form-row"><label>Size Unit</label>
          <select id="prod_size_unit">
            <option ${(p.sizeUnit||'oz')==='oz'?'selected':''}>oz</option>
            <option ${p.sizeUnit==='lb'?'selected':''}>lb</option>
            <option ${p.sizeUnit==='ct'?'selected':''}>ct</option>
            <option ${p.sizeUnit==='ml'?'selected':''}>ml</option>
            <option ${p.sizeUnit==='g'?'selected':''}>g</option>
          </select>
        </div>
        <div class="form-row"><label>Unit Price</label><input type="number" step="0.01" id="prod_price" value="${p.price||0}" /></div>
        <div class="form-row"><label>Daily Production Rate</label>
          <input type="number" min="0" step="1" id="prod_daily_rate" value="${p.dailyProductionRate||0}" placeholder="Units / day" />
          <div class="help-text">Estimated units produced per day at full run.</div>
        </div>
        <div class="form-row"><label>Case Qty</label><input type="number" min="0" step="1" id="prod_case_qty" value="${p.caseQty||0}" placeholder="Units per case" /></div>
        <div class="form-row"><label>Case Sticker</label>
          <select id="prod_case_sticker">
            <option value="" ${!p.caseSticker?'selected':''}>- None -</option>
            <option ${p.caseSticker==='2x3'?'selected':''}>2x3</option>
            <option ${p.caseSticker==='Keyence'?'selected':''}>Keyence</option>
          </select>
        </div>
        <div class="form-row">
          <label>Kosher</label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--grey);border-radius:5px;background:var(--white);cursor:pointer">
            <input type="checkbox" id="prod_kosher" ${p.kosher?'checked':''} style="width:16px;height:16px;cursor:pointer" />
            <span style="font-size:14px;color:var(--brown)">Kosher Certified</span>
          </label>
        </div>
        <div class="form-row">
          <label>Allergen</label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--grey);border-radius:5px;background:var(--white);cursor:pointer">
            <input type="checkbox" id="prod_allergen" ${p.allergen?'checked':''} onchange="document.getElementById('prod_allergen_row').style.display = this.checked ? 'flex' : 'none'" style="width:16px;height:16px;cursor:pointer" />
            <span style="font-size:14px;color:var(--brown)">Contains Allergen</span>
          </label>
        </div>
        <div class="form-row" id="prod_allergen_row" style="display:${p.allergen?'flex':'none'}">
          <label>Allergen Details</label>
          <input type="text" id="prod_allergen_details" value="${escapeHtml(p.allergenDetails||'')}" placeholder="e.g. Peanuts, Milk, Soy, Tree nuts" />
          <div class="help-text">Specify which allergen(s) this product contains.</div>
        </div>
        <div class="form-row">
          <label>Linked Finished Good Inventory Item</label>
          <select id="prod_fg">
            <option value="">- Link later or create on first production -</option>
            ${state.ingredients.filter(i=>i.category==='Finished Good').map(fg => `<option value="${fg.id}" ${p.finishedGoodId===fg.id?'selected':''}>${escapeHtml(fg.name)}</option>`).join('')}
          </select>
          <div class="help-text">Choose the inventory item that should increase when this product is completed in production. Leave blank to create or link it later.</div>
        </div>
      </div>

      <div style="margin-top:18px;padding:12px;background:var(--beige-light);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="color:var(--brown)">Formula / Bill of Materials</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addFormulaRow()">+ Add Ingredient</button>
        </div>
        <div class="help-text" style="margin-bottom:6px">List every ingredient and packaging item used per unit. The Product Calculator pulls from this formula.</div>
        <div id="formula_rows"></div>
      </div>

      <div style="margin-top:18px;padding:12px;background:var(--beige-light);border-radius:8px">
        <strong style="color:var(--brown);font-size:13px">Images</strong>
        <div class="help-text" style="margin-bottom:8px">Upload a product photo and a Nutrition Facts Panel (NFP) image. Max 5 MB each.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--brown);margin-bottom:4px">Product Image</div>
            <div id="prod_image_preview">${productImagePreviewHtml(p.productImage, 'product')}</div>
            <input type="file" id="prod_image_input" accept="image/*" style="display:none" onchange="productImageSelected(event,'product')" />
            <input type="hidden" id="prod_image_data" value='${p.productImage ? JSON.stringify(p.productImage).replace(/'/g,"&#039;") : ""}' />
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--brown);margin-bottom:4px">Nutrition Facts Panel (NFP)</div>
            <div id="prod_nfp_preview">${productImagePreviewHtml(p.nfpImage, 'nfp')}</div>
            <input type="file" id="prod_nfp_input" accept="image/*" style="display:none" onchange="productImageSelected(event,'nfp')" />
            <input type="hidden" id="prod_nfp_data" value='${p.nfpImage ? JSON.stringify(p.nfpImage).replace(/'/g,"&#039;") : ""}' />
          </div>
        </div>
      </div>

      <div class="form-row" style="margin-top:10px"><label>Notes</label>
        <textarea id="prod_notes">${escapeHtml(p.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Product':'Save Changes'}</button>
      </div>
    </form>
  `);
  renderFormulaRows();
}
function productImagePreviewHtml(img, kind) {
  const inputId = kind === 'nfp' ? 'prod_nfp_input' : 'prod_image_input';
  if (img && img.dataUrl) {
    return `
      <div style="border:1px solid var(--grey-light);border-radius:6px;padding:8px;background:var(--white);text-align:center">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name||'')}" style="max-width:100%;max-height:140px;border-radius:4px" />
        <div style="font-size:11px;color:var(--brown-light);margin-top:4px">${escapeHtml(img.name||'')} (${Math.round((img.size||0)/1024)} KB)</div>
        <div style="margin-top:6px;display:flex;gap:6px;justify-content:center">
          <button type="button" class="btn btn-icon btn-sm" onclick="document.getElementById('${inputId}').click()">Replace</button>
          <button type="button" class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="clearProductImage('${kind}')">Remove</button>
        </div>
      </div>
    `;
  }
  return `
    <div style="border:2px dashed var(--grey);border-radius:6px;padding:18px;background:var(--white);text-align:center;cursor:pointer" onclick="document.getElementById('${inputId}').click()">
      <div style="font-size:28px;color:var(--grey)">&#128247;</div>
      <div style="font-size:12px;color:var(--brown-light);margin-top:4px">Click to upload</div>
    </div>
  `;
}
function productImageSelected(e, kind) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('Image too large (max 5 MB).'); e.target.value=''; return; }
  pendingProductMediaFiles[kind] = f;
  const reader = new FileReader();
  reader.onload = () => {
    const data = { name: f.name, type: f.type, size: f.size, dataUrl: reader.result };
    const dataField = kind === 'nfp' ? 'prod_nfp_data' : 'prod_image_data';
    const previewEl = kind === 'nfp' ? 'prod_nfp_preview' : 'prod_image_preview';
    document.getElementById(dataField).value = JSON.stringify(data);
    document.getElementById(previewEl).innerHTML = productImagePreviewHtml(data, kind);
  };
  reader.readAsDataURL(f);
}
function clearProductImage(kind) {
  const dataField = kind === 'nfp' ? 'prod_nfp_data' : 'prod_image_data';
  const inputId = kind === 'nfp' ? 'prod_nfp_input' : 'prod_image_input';
  const previewEl = kind === 'nfp' ? 'prod_nfp_preview' : 'prod_image_preview';
  document.getElementById(dataField).value = '';
  document.getElementById(inputId).value = '';
  document.getElementById(previewEl).innerHTML = productImagePreviewHtml(null, kind);
}
function renderFormulaRows() {
  const cont = document.getElementById('formula_rows');
  if (!cont) return;
  if (editingFormula.length === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--brown-light);padding:6px 0">No ingredients added yet.</div>';
    return;
  }
  const totalPct = editingFormula.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
  const totalCost = editingFormula.reduce((s, r) => { const ing = getIngredient(r.ingredientId); return s + (ing ? ing.cost * r.qty : 0); }, 0);
  const pctOk = Math.abs(totalPct - 100) <= 0.5;
  const pctColor = pctOk ? 'var(--success)' : 'var(--danger)';
  cont.innerHTML = `
    <div class="po-line" style="${FORMULA_GRID};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Ingredient / Packaging</div><div>Qty / Unit</div><div>%</div><div>Unit</div><div>Cost / Unit</div><div></div>
    </div>
    ${editingFormula.map((r, i) => {
      const ing = getIngredient(r.ingredientId);
      const sub = ing ? ing.cost * r.qty : 0;
      return `<div class="po-line" style="${FORMULA_GRID}">
        <select onchange="formulaIngredientChange(${i},this.value)">
          <option value="">- Select -</option>
          ${state.ingredients.map(opt => `<option value="${opt.id}" ${r.ingredientId===opt.id?'selected':''}>${escapeHtml(opt.name)}</option>`).join('')}
        </select>
        <input type="number" min="0" step="0.001" value="${r.qty}" oninput="formulaQtyInput(${i},this.value)" />
        <input type="number" min="0" max="100" step="0.01" value="${r.pct||0}" oninput="formulaPctInput(${i},this.value)" placeholder="0" />
        <div data-row-unit="${i}" style="text-align:center;color:var(--brown-light);font-size:13px">${ing ? escapeHtml(ing.unit) : '-'}</div>
        <div data-row-sub="${i}" style="text-align:right;font-weight:600;color:var(--brown)">${fmtMoney(sub)}</div>
        <button type="button" onclick="removeFormulaRow(${i})">&times;</button>
      </div>`;
    }).join('')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 10px;background:var(--white);border-radius:6px;border:1px solid var(--grey-light);flex-wrap:wrap;gap:8px">
      <div style="font-size:13px" id="formula_pct_summary">
        <span style="color:var(--brown-light)">Total %: </span>
        <strong data-formula-total-pct style="color:${pctColor};font-size:15px">${totalPct.toFixed(2)}%</strong>
        <span data-formula-pct-status>${pctOk ? '<span style="color:var(--success);margin-left:6px">&#10003;</span>' : '<span style="color:var(--danger);margin-left:6px">(needs to total 100% to save)</span>'}</span>
        <button type="button" class="btn btn-icon btn-sm" style="margin-left:10px" onclick="autoBalanceFormulaPct()">Auto-balance</button>
      </div>
      <div style="font-size:13px;color:var(--brown-light)">
        Total ingredient cost / unit: <strong data-formula-total-cost style="color:var(--brown)">${fmtMoney(totalCost)}</strong>
      </div>
    </div>
  `;
}
function addFormulaRow() {
  editingFormula.push({ ingredientId: '', qty: 0, pct: 0 });
  renderFormulaRows();
}
function removeFormulaRow(idx) {
  editingFormula.splice(idx, 1);
  renderFormulaRows();
}
// Selecting an ingredient changes unit/cost displays - full re-render is fine because the select isn't being typed in
function formulaIngredientChange(idx, value) {
  editingFormula[idx].ingredientId = value;
  renderFormulaRows();
}
// Typing in qty: update data + just patch the row subtotal and the total cost (no re-render so focus stays put)
function formulaQtyInput(idx, value) {
  editingFormula[idx].qty = parseFloat(value) || 0;
  patchFormulaTotals(idx);
}
// Typing in pct: update data + just patch the running total % display
function formulaPctInput(idx, value) {
  editingFormula[idx].pct = parseFloat(value) || 0;
  patchFormulaTotals();
}
function patchFormulaTotals(rowIdx) {
  // update one row's subtotal if rowIdx provided (qty changed)
  if (typeof rowIdx === 'number') {
    const r = editingFormula[rowIdx];
    const ing = getIngredient(r.ingredientId);
    const sub = ing ? ing.cost * r.qty : 0;
    const cell = document.querySelector(`[data-row-sub="${rowIdx}"]`);
    if (cell) cell.textContent = fmtMoney(sub);
  }
  // update running totals
  const totalPct = editingFormula.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
  const totalCost = editingFormula.reduce((s, r) => { const ing = getIngredient(r.ingredientId); return s + (ing ? ing.cost * r.qty : 0); }, 0);
  const pctOk = Math.abs(totalPct - 100) <= 0.5;
  const pctColor = pctOk ? 'var(--success)' : 'var(--danger)';
  const pctEl = document.querySelector('[data-formula-total-pct]');
  if (pctEl) {
    pctEl.textContent = totalPct.toFixed(2) + '%';
    pctEl.style.color = pctColor;
  }
  const statusEl = document.querySelector('[data-formula-pct-status]');
  if (statusEl) {
    statusEl.innerHTML = pctOk
      ? '<span style="color:var(--success);margin-left:6px">&#10003;</span>'
      : '<span style="color:var(--danger);margin-left:6px">(needs to total 100% to save)</span>';
  }
  const costEl = document.querySelector('[data-formula-total-cost]');
  if (costEl) costEl.textContent = fmtMoney(totalCost);
}
// One-click: distribute pct proportionally based on qty so they sum to 100
function autoBalanceFormulaPct() {
  const totalQty = editingFormula.reduce((s, r) => s + (r.qty || 0), 0);
  if (totalQty <= 0) { toast('Set quantities first, then auto-balance.'); return; }
  editingFormula.forEach(r => { r.pct = +(((r.qty || 0) / totalQty) * 100).toFixed(2); });
  const sum = editingFormula.reduce((s, r) => s + r.pct, 0);
  if (Math.abs(sum - 100) > 0.001 && editingFormula.length) {
    editingFormula[0].pct = +(editingFormula[0].pct + (100 - sum)).toFixed(2);
  }
  renderFormulaRows();
}
async function saveProduct(id, isNew) {
  let productImage = null, nfpImage = null;
  const pid = document.getElementById('prod_image_data').value;
  const nid = document.getElementById('prod_nfp_data').value;
  if (pid) { try { productImage = JSON.parse(pid); } catch(e){} }
  if (nid) { try { nfpImage = JSON.parse(nid); } catch(e){} }
  const data = {
    id,
    sku: document.getElementById('prod_sku').value,
    name: document.getElementById('prod_name').value,
    customerId: document.getElementById('prod_customer').value,
    room: document.getElementById('prod_room').value,
    size: parseFloat(document.getElementById('prod_size').value) || 0,
    sizeUnit: document.getElementById('prod_size_unit').value,
    price: parseFloat(document.getElementById('prod_price').value) || 0,
    caseQty: parseInt(document.getElementById('prod_case_qty').value, 10) || 0,
    caseSticker: document.getElementById('prod_case_sticker').value || '',
    kosher: document.getElementById('prod_kosher').checked,
    dailyProductionRate: parseInt(document.getElementById('prod_daily_rate').value, 10) || 0,
    allergen: document.getElementById('prod_allergen').checked,
    allergenDetails: document.getElementById('prod_allergen').checked ? (document.getElementById('prod_allergen_details').value || '') : '',
    finishedGoodId: document.getElementById('prod_fg').value || '',
    productImage,
    nfpImage,
    notes: document.getElementById('prod_notes').value
  };
  // validate formula percentages sum to 100 (with 0.5 tolerance) - only if any rows exist
  const cleanFormula = editingFormula.filter(r => r.ingredientId && r.qty > 0).map(r => ({ ingredientId: r.ingredientId, qty: r.qty, pct: parseFloat(r.pct) || 0 }));
  if (cleanFormula.length) {
    const totalPct = cleanFormula.reduce((s, r) => s + r.pct, 0);
    if (Math.abs(totalPct - 100) > 0.5) {
      toast(`Formula % must total 100% (currently ${totalPct.toFixed(2)}%). Use Auto-balance or adjust manually.`);
      return;
    }
  }
  const existing = state.products.find(p=>p.id===id);
  let backendProduct = null;
  if (!requireEmployeeBackendWrite(backendProductState)) return;
  try {
    backendProduct = await saveBackendProduct(id, isNew, { ...data, _backendId: existing?._backendId }, cleanFormula);
    if (pendingProductMediaFiles.product) await uploadBackendProductMedia(backendProduct.id, pendingProductMediaFiles.product, 'product_image');
    if (pendingProductMediaFiles.nfp) await uploadBackendProductMedia(backendProduct.id, pendingProductMediaFiles.nfp, 'nutrition_facts');
    pendingProductMediaFiles.product = null;
    pendingProductMediaFiles.nfp = null;
    backendProductState.status = 'connected';
    backendProductState.loaded = false;
    backendProductState.lastError = '';
    data.id = backendProduct.id;
    data._backendId = backendProduct.id;
    id = backendProduct.id;
  } catch (error) {
    failBackendRequiredWrite(error, backendProductState);
    return;
  }
  if (isNew) state.products.push(data);
  else Object.assign(existing, data);
  // save formula (BOM) with pct
  state.boms = state.boms || {};
  if (cleanFormula.length) state.boms[id] = cleanFormula;
  else delete state.boms[id];
  try { saveState(); }
  catch(err) {
    if (isNew) state.products = state.products.filter(p => p.id !== id);
    toast('Storage full - try smaller images or remove one.');
    return;
  }
  closeModal();
  router(currentPage === 'customers' ? 'customers' : 'products');
  toast('Product saved.');
}
async function deleteProduct(id) {
  const used = state.purchaseOrders.find(po => po.lines.some(l=>l.productId===id));
  if (used) { toast('Product is referenced on a PO and cannot be deleted.'); return; }
  const product = getProduct(id);
  const ok = await openConfirmModal({
    title: 'Delete product',
    record: product?.sku || product?.name || id,
    message: 'Delete this product setup record?',
    risk: 'This does not delete completed PO history, but the product will no longer appear for setup and order entry.',
    confirmLabel: 'Delete Product',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendProductState)) return;
  if (!product?._backendId) return failBackendRequiredWrite(null, backendProductState, 'Product delete requires backend confirmation. Nothing was saved locally.');
  try {
    await archiveBackendProduct(product._backendId);
    backendProductState.status = 'connected';
    backendProductState.lastError = '';
    saveState();
    router(currentPage);
    toast('Product archived in backend.');
  } catch (error) {
    failBackendRequiredWrite(error, backendProductState);
  }
}

/* =========================================================================
   PRODUCTS (standalone page) + PRODUCT CALCULATOR
   ========================================================================= */
let productsTab = 'list';
function setProductsTab(t) { productsTab = t; renderProducts(document.getElementById('content')); }

function renderProducts(el) {
  if (backendAuthState.token && !backendProductState.loaded && !backendProductState.loading) {
    loadBackendProducts().then(() => { if (currentPage === 'products') router('products'); });
  }
  el.innerHTML = `
    <div class="ops-page">
    ${renderBackendDataStatusBanner('products', backendProductState)}
    <div class="ops-panel">
      <div class="tabs">
        <button class="tab ${productsTab==='list'?'active':''}" onclick="setProductsTab('list')">Products <span class="tab-count">${state.products.length}</span></button>
        <button class="tab ${productsTab==='calc'?'active':''}" onclick="setProductsTab('calc')">Product Calculator</button>
      </div>
      <div id="productsBody"></div>
    </div>
    </div>
  `;
  const body = document.getElementById('productsBody');
  if (productsTab === 'calc') renderProductCalculator(body);
  else renderProductList(body);
}

function viewProductImage(productId, kind) {
  const p = getProduct(productId);
  if (!p) return;
  const img = kind === 'nfp' ? p.nfpImage : p.productImage;
  if (!img) return;
  const title = kind === 'nfp' ? 'Nutrition Facts Panel' : 'Product Image';
  openModal(`${title} - ${escapeHtml(p.name)}`, `
    <div style="text-align:center">
      <img src="${img.dataUrl}" alt="${escapeHtml(img.name||'')}" style="max-width:100%;max-height:60vh;border-radius:6px;border:1px solid var(--grey-light)" />
      <div style="font-size:12px;color:var(--brown-light);margin-top:8px">${escapeHtml(img.name||'')} (${Math.round((img.size||0)/1024)} KB)</div>
    </div>
    <div class="form-actions">
      <a href="${img.dataUrl}" download="${escapeHtml(img.name||(kind+'-image'))}" class="btn btn-secondary" style="text-decoration:none">Download</a>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>
  `);
}
function formulaPillHtml(p, bom) {
  if (!bom || bom.length === 0) return '<span style="color:var(--brown-light);font-size:12px">-</span>';
  const totalPct = bom.reduce((s, b) => s + (b.pct || 0), 0);
  const rows = bom.map(b => {
    const ing = getIngredient(b.ingredientId);
    return `<tr>
      <td>${escapeHtml(ing?.name || '(missing)')}</td>
      <td style="text-align:right">${b.qty} ${escapeHtml(ing?.unit||'')}</td>
      <td style="text-align:right">${b.pct ? b.pct.toFixed(2) + '%' : '-'}</td>
    </tr>`;
  }).join('');
  return `
    <div style="display:inline-flex;align-items:center;gap:6px">
      <span class="pill formula-pill formula-icon" title="Hover to preview formula" aria-label="${bom.length} ingredients">
        &#128196;
        <div class="formula-snippet">
          <h4>${escapeHtml(p.name||p.sku||'Formula')}</h4>
          <table>
            <thead><tr><th>Ingredient</th><th style="text-align:right">Qty</th><th style="text-align:right">%</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="fs-foot">Total %: ${totalPct.toFixed(2)}%${p.size ? ` &middot; Per ${p.size}${escapeHtml(p.sizeUnit||'oz')} unit` : ''}</div>
        </div>
      </span>
      <button class="btn btn-icon btn-sm formula-dl" title="Download formula as PDF" onclick="downloadProductFormula('${p.id}')">&#11015;</button>
    </div>
  `;
}

function downloadProductFormula(productId) {
  const p = getProduct(productId);
  if (!p) { toast('Product not found.'); return; }
  const bom = (state.boms || {})[p.id] || [];
  if (bom.length === 0) { toast('No formula on file for this product.'); return; }
  const cust = getCustomer(p.customerId);
  const totalPerUnit = bom.reduce((s, b) => {
    const ing = getIngredient(b.ingredientId);
    return s + (ing ? ing.cost * b.qty : 0);
  }, 0);
  const totalPct = bom.reduce((s, b) => s + (b.pct || 0), 0);

  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups to download the formula.'); return; }
  const safeName = (p.sku || p.name || 'Formula').replace(/[^A-Za-z0-9_-]+/g, '_');
  w.document.write(`
    <html><head><title>Formula - ${escapeHtml(p.sku||p.name||'Product')}</title>
    <style>
      body{font-family:Helvetica,Arial,sans-serif;padding:36px;color:#1A1A1A}
      h1{color:#5C3A21;margin:0 0 4px}
      h2{color:#5C3A21;margin:18px 0 8px;font-size:18px}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #E07B2A;padding-bottom:12px;margin-bottom:18px}
      .label{font-size:11px;color:#8B5E3C;text-transform:uppercase;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
      th{background:#F5E9D3;text-align:left;padding:8px;border-bottom:2px solid #5C3A21}
      td{padding:8px;border-bottom:1px solid #E9E2D2}
      tfoot th{background:#5C3A21;color:#fff;text-align:right}
      tfoot th:last-child{text-align:left}
      .meta{margin:14px 0;font-size:13px;color:#5C3A21}
      .meta strong{color:#1A1A1A}
    </style></head><body>
    <div class="head">
      <div>
        <h1>Product Formula</h1>
        <div style="color:#8B5E3C">${escapeHtml(p.name||'')}${p.sku ? ' &middot; '+escapeHtml(p.sku) : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="label">Customer</div>
        <div>${escapeHtml(cust?.name||'-')}</div>
        <div class="label" style="margin-top:6px">Production Room</div>
        <div>${escapeHtml(p.room||'-')}</div>
      </div>
    </div>
    <div class="meta">
      ${p.size ? `<strong>Unit Size:</strong> ${p.size}${escapeHtml(p.sizeUnit||'oz')} &nbsp;&middot;&nbsp; ` : ''}
      ${p.caseQty ? `<strong>Case Qty:</strong> ${p.caseQty} units/case &nbsp;&middot;&nbsp; ` : ''}
      ${p.caseSticker ? `<strong>Case Sticker:</strong> ${escapeHtml(p.caseSticker)}` : ''}
    </div>
    <table>
      <thead><tr><th>Ingredient / Packaging</th><th>Qty / Unit</th><th>Unit</th><th>%</th><th>Unit Cost</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${bom.map(b => {
          const ing = getIngredient(b.ingredientId);
          if (!ing) return '';
          const sub = ing.cost * b.qty;
          return `<tr>
            <td>${escapeHtml(ing.name)}</td>
            <td>${b.qty}</td>
            <td>${escapeHtml(ing.unit||'')}</td>
            <td>${b.pct ? b.pct.toFixed(2)+'%' : '-'}</td>
            <td>${fmtMoney(ing.cost)}</td>
            <td>${fmtMoney(sub)}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr><th colspan="3" style="text-align:right">Totals</th><th>${totalPct.toFixed(2)}%</th><th></th><th>${fmtMoney(totalPerUnit)}</th></tr>
      </tfoot>
    </table>
    ${p.notes ? `<p style="margin-top:18px"><strong>Notes:</strong> ${escapeHtml(p.notes)}</p>` : ''}
    <p style="margin-top:30px;color:#8B5E3C;font-size:11px">Generated ${new Date().toLocaleString()} &middot; Verify against current spec sheet before each batch.</p>
    <script>
      window.onload = () => {
        // Set the suggested filename for "Save as PDF" via document title
        document.title = 'Formula_${safeName}';
        setTimeout(() => window.print(), 200);
      };
    <\/script>
    </body></html>
  `);
  w.document.close();
}

function renderProductList(el) {
  const filters = `${opsSelect('Customer filter', ['All customers', ...state.customers.map(c=>c.name).slice(0,8)])}${opsSelect('Production room filter', ['All rooms','Squeeze Pack','Bnutty','Main','Dog House'])}${opsSelect('Status filter', ['All statuses','Active','Archived'])}`;
  const actions = `
    <button class="btn btn-secondary btn-sm" onclick="exportCsv('products.csv', state.products.map(p=>({sku:p.sku,name:p.name,customer:getCustomer(p.customerId)?.name||'',room:p.room,size:p.size?p.size+(p.sizeUnit||'oz'):'',case_qty:p.caseQty||0,case_sticker:p.caseSticker||'',daily_production_rate:p.dailyProductionRate||0,kosher:p.kosher?'Yes':'No',allergen:p.allergen?'Yes':'No',allergen_details:p.allergenDetails||'',price:p.price,notes:p.notes||''})))">Export CSV</button>
    <button class="btn btn-sm" onclick="editProduct()">+ Add Product</button>`;
  el.innerHTML = `
    <div class="ops-header">
      <div>
        <h2 class="ops-title">Products</h2>
        <div class="ops-kicker">Product/SKU setup, media, formulas, customer links, and production details.</div>
      </div>
      <div class="ops-actions">${actions}</div>
    </div>
    ${opsToolbarHtml({ filters })}
    <div class="ops-note">All SKUs we manufacture. Each product is linked to a customer, production room, media, and Formula/BOM.</div>
    <div class="table-wrap allow-overflow"><table>
      <thead><tr>
        <th>Image</th><th>SKU</th><th>Name</th><th>Customer</th><th>Production Room</th><th>Size</th><th>Case Qty</th><th>Case Sticker</th><th>Daily Rate</th><th>Kosher</th><th>Allergen</th><th>NFP</th><th>Formula</th><th>Price</th><th></th>
      </tr></thead>
      <tbody>
        ${state.products.length === 0 ? `<tr><td colspan="15" class="empty">No products yet.</td></tr>` :
          state.products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p => {
            const bom = state.boms[p.id] || [];
            return `
            <tr>
              <td>${p.productImage ? `<img src="${p.productImage.dataUrl}" alt="${escapeHtml(p.name)}" style="width:42px;height:42px;object-fit:cover;border-radius:5px;border:1px solid var(--grey-light);cursor:pointer" onclick="viewProductImage('${p.id}','product')" />` : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td><strong>${escapeHtml(p.sku)}</strong></td>
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(getCustomer(p.customerId)?.name||'-')}</td>
              <td><span class="room-dot" style="display:inline-block;background:${roomColor(p.room)}"></span> ${escapeHtml(p.room||'-')}</td>
              <td>${p.size ? escapeHtml(p.size+(p.sizeUnit||'oz')) : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.caseQty || '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.caseSticker ? '<span class="pill">'+escapeHtml(p.caseSticker)+'</span>' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.dailyProductionRate ? p.dailyProductionRate + ' / day' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.kosher ? '<span class="badge badge-prod" title="Kosher Certified">&#10003; Kosher</span>' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.allergen ? `<span class="badge badge-low" title="${escapeHtml(p.allergenDetails||'Allergen')}">&#9888; ${escapeHtml(p.allergenDetails||'Yes')}</span>` : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${p.nfpImage ? `<img src="${p.nfpImage.dataUrl}" alt="NFP" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--grey-light);cursor:pointer" onclick="viewProductImage('${p.id}','nfp')" />` : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
              <td>${formulaPillHtml(p, bom)}</td>
              <td>${fmtMoney(p.price)}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editProduct('${p.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" onclick="loadProductIntoCalc('${p.id}')">Calculate</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteProduct('${p.id}')">Delete</button>
              </td>
            </tr>
          `;}).join('')
        }
      </tbody>
    </table></div>
  `;
}

/* ----- Product Calculator ----- */
let calcState = {
  productId: '',
  units: 1000,
  sizeOz: 16,
  ingredients: [],   // [{ingredientId, qtyPerUnit}]
  packaging: [],     // [{ingredientId, qtyPerUnit}]
  allergenTestPerBatch: 150,
  qaTestPerBatch: 0,
  laborHours: 8,
  laborRate: 22,
  overheadPerUnit: 0.10,
  caseCostPerUnit: 0.05,
  freightPerUnit: 0.08,
  copackFeePerUnit: 0,
  marginPct: 35
};

function renderProductCalculator(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Product Cost Calculator</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="resetCalc()">Reset</button>
      </div>
    </div>
    <div class="ops-panel-body">
      <div class="help-text" style="margin-bottom:10px">Build a cost-up for any product. Pick an existing product to pre-load its formula, then tweak quantities, batch fees, labor, and margin.</div>
      <div style="margin-bottom:12px;padding:10px 14px;background:#fff5e8;border-left:3px solid var(--orange);border-radius:4px;font-size:12px;color:var(--brown)">
        <strong>Loss factor:</strong> All ingredient and packaging quantities are automatically buffered by <strong>5%</strong> to account for production loss/waste.
      </div>

      <div class="form-grid">
        <div class="form-row"><label>Load From Product</label>
          <select id="calc_product" onchange="calcLoadProduct()">
            <option value="">- Build manually -</option>
            ${state.products.map(p => `<option value="${p.id}" ${calcState.productId===p.id?'selected':''}>${escapeHtml(p.sku)} - ${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Number of Units (Jars / Pouches)</label>
          <input type="number" id="calc_units" value="${calcState.units}" min="1" oninput="updateCalc()" />
        </div>
        <div class="form-row"><label>Size per Unit (oz)</label>
          <input type="number" id="calc_size" value="${calcState.sizeOz}" min="0" step="0.01" oninput="updateCalc()" />
        </div>
      </div>

      <div style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="color:var(--brown)">Ingredients (per unit)</strong>
          <button class="btn btn-secondary btn-sm" onclick="addCalcRow('ingredients')">+ Add Ingredient</button>
        </div>
        <div id="calc_ingredients" style="margin-top:8px"></div>
      </div>

      <div style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="color:var(--brown)">Packaging (per unit)</strong>
          <button class="btn btn-secondary btn-sm" onclick="addCalcRow('packaging')">+ Add Packaging</button>
        </div>
        <div id="calc_packaging" style="margin-top:8px"></div>
      </div>

      <div style="margin-top:20px;padding:16px;background:var(--beige-light);border-radius:8px">
        <strong style="color:var(--brown)">Batch Fees & Per-Unit Costs</strong>
        <div class="form-grid" style="margin-top:10px">
          <div class="form-row"><label>Allergen Testing ($/batch)</label><input type="number" id="calc_allergen" value="${calcState.allergenTestPerBatch}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>QA / Lab Testing ($/batch)</label><input type="number" id="calc_qa" value="${calcState.qaTestPerBatch}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Production Labor (hours)</label><input type="number" id="calc_lhours" value="${calcState.laborHours}" step="0.25" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Labor Rate ($/hr loaded)</label><input type="number" id="calc_lrate" value="${calcState.laborRate}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Overhead ($/unit)</label><input type="number" id="calc_oh" value="${calcState.overheadPerUnit}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Case / Carton ($/unit)</label><input type="number" id="calc_case" value="${calcState.caseCostPerUnit}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Freight Allocation ($/unit)</label><input type="number" id="calc_freight" value="${calcState.freightPerUnit}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Co-Pack Fee ($/unit)</label><input type="number" id="calc_copack" value="${calcState.copackFeePerUnit}" step="0.01" oninput="updateCalc()" /></div>
          <div class="form-row"><label>Target Margin %</label><input type="number" id="calc_margin" value="${calcState.marginPct}" step="1" oninput="updateCalc()" /></div>
        </div>
      </div>

      <div id="calc_summary" style="margin-top:20px"></div>
    </div>
  `;
  renderCalcRows('ingredients');
  renderCalcRows('packaging');
  updateCalc();
}

function loadProductIntoCalc(productId) {
  productsTab = 'calc';
  calcState.productId = productId;
  router('products');
  // hand-off after render
  setTimeout(() => {
    const sel = document.getElementById('calc_product');
    if (sel) { sel.value = productId; calcLoadProduct(); }
  }, 30);
}

function calcLoadProduct() {
  const id = document.getElementById('calc_product').value;
  calcState.productId = id;
  if (!id) { updateCalc(); return; }
  const p = getProduct(id);
  const bom = state.boms[id] || [];
  // split BOM into ingredient rows vs packaging rows by unit ('ea' = packaging-ish)
  calcState.ingredients = [];
  calcState.packaging = [];
  bom.forEach(b => {
    const ing = getIngredient(b.ingredientId);
    if (!ing) return;
    const row = { ingredientId: b.ingredientId, qtyPerUnit: b.qty };
    if (ing.unit === 'ea') calcState.packaging.push(row);
    else calcState.ingredients.push(row);
  });
  if (p && p.size) calcState.sizeOz = p.size;
  document.getElementById('calc_size').value = calcState.sizeOz;
  renderCalcRows('ingredients');
  renderCalcRows('packaging');
  updateCalc();
}

function renderCalcRows(kind) {
  const cont = document.getElementById('calc_'+kind);
  if (!cont) return;
  const rows = calcState[kind];
  if (rows.length === 0) {
    cont.innerHTML = `<div style="font-size:12px;color:var(--brown-light);padding:10px 0">No ${kind} added.</div>`;
    return;
  }
  cont.innerHTML = `
    <div class="po-line" style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Item</div><div>Qty / Unit</div><div>Unit Cost</div><div>Subtotal (+5% loss)</div><div></div>
    </div>
    ${rows.map((r, i) => {
      const ing = getIngredient(r.ingredientId);
      const sub = (ing ? ing.cost : 0) * r.qtyPerUnit * LOSS_FACTOR;
      return `<div class="po-line">
        <select onchange="calcRowChange('${kind}',${i},'ingredientId',this.value)">
          <option value="">- Select -</option>
          ${state.ingredients.map(opt => `<option value="${opt.id}" ${r.ingredientId===opt.id?'selected':''}>${escapeHtml(opt.name)} (${escapeHtml(opt.unit)})</option>`).join('')}
        </select>
        <input type="number" min="0" step="0.001" value="${r.qtyPerUnit}" oninput="calcRowChange('${kind}',${i},'qtyPerUnit',this.value)" />
        <div style="text-align:right;color:var(--brown-light);font-size:13px">${ing ? fmtMoney(ing.cost) : '-'}</div>
        <div style="text-align:right;font-weight:600;color:var(--brown)">${fmtMoney(sub)}</div>
        <button type="button" onclick="removeCalcRow('${kind}',${i})">&times;</button>
      </div>`;
    }).join('')}
  `;
}
function addCalcRow(kind) {
  calcState[kind].push({ ingredientId: '', qtyPerUnit: 0 });
  renderCalcRows(kind);
  updateCalc();
}
function removeCalcRow(kind, idx) {
  calcState[kind].splice(idx, 1);
  renderCalcRows(kind);
  updateCalc();
}
function calcRowChange(kind, idx, field, value) {
  if (field === 'qtyPerUnit') value = parseFloat(value) || 0;
  calcState[kind][idx][field] = value;
  // re-render to refresh subtotal display
  renderCalcRows(kind);
  updateCalc();
}
function readCalcInputs() {
  calcState.units = parseFloat(document.getElementById('calc_units').value) || 0;
  calcState.sizeOz = parseFloat(document.getElementById('calc_size').value) || 0;
  calcState.allergenTestPerBatch = parseFloat(document.getElementById('calc_allergen').value) || 0;
  calcState.qaTestPerBatch = parseFloat(document.getElementById('calc_qa').value) || 0;
  calcState.laborHours = parseFloat(document.getElementById('calc_lhours').value) || 0;
  calcState.laborRate = parseFloat(document.getElementById('calc_lrate').value) || 0;
  calcState.overheadPerUnit = parseFloat(document.getElementById('calc_oh').value) || 0;
  calcState.caseCostPerUnit = parseFloat(document.getElementById('calc_case').value) || 0;
  calcState.freightPerUnit = parseFloat(document.getElementById('calc_freight').value) || 0;
  calcState.copackFeePerUnit = parseFloat(document.getElementById('calc_copack').value) || 0;
  calcState.marginPct = parseFloat(document.getElementById('calc_margin').value) || 0;
}
const LOSS_FACTOR = 1.05; // 5% loss applied to ingredients & packaging
function calcSubtotal(kind) {
  return calcState[kind].reduce((s, r) => {
    const ing = getIngredient(r.ingredientId);
    return s + (ing ? ing.cost : 0) * r.qtyPerUnit * LOSS_FACTOR;
  }, 0);
}
function calcSubtotalRaw(kind) {
  return calcState[kind].reduce((s, r) => {
    const ing = getIngredient(r.ingredientId);
    return s + (ing ? ing.cost : 0) * r.qtyPerUnit;
  }, 0);
}
function updateCalc() {
  if (!document.getElementById('calc_units')) return;
  readCalcInputs();
  const units = calcState.units;
  const ingPerUnit = calcSubtotal('ingredients');
  const pkgPerUnit = calcSubtotal('packaging');
  const laborTotal = calcState.laborHours * calcState.laborRate;
  const laborPerUnit = units ? laborTotal / units : 0;
  const allergenPerUnit = units ? calcState.allergenTestPerBatch / units : 0;
  const qaPerUnit = units ? calcState.qaTestPerBatch / units : 0;
  const overheadPerUnit = calcState.overheadPerUnit;
  const casePerUnit = calcState.caseCostPerUnit;
  const freightPerUnit = calcState.freightPerUnit;
  const copackPerUnit = calcState.copackFeePerUnit;

  const totalPerUnit = ingPerUnit + pkgPerUnit + laborPerUnit + allergenPerUnit + qaPerUnit + overheadPerUnit + casePerUnit + freightPerUnit + copackPerUnit;
  const batchTotal = totalPerUnit * units;
  const margin = calcState.marginPct / 100;
  const wholesale = margin < 1 && margin > 0 ? totalPerUnit / (1 - margin) : totalPerUnit;
  const wholesaleBatch = wholesale * units;
  const profitPerUnit = wholesale - totalPerUnit;
  const profitTotal = profitPerUnit * units;
  const costPerOz = calcState.sizeOz > 0 ? totalPerUnit / calcState.sizeOz : 0;

  const sum = document.getElementById('calc_summary');
  sum.innerHTML = `
    <div style="background:var(--white);border:2px solid var(--orange);border-radius:10px;padding:18px">
      <h3 style="margin:0 0 12px;color:var(--brown)">Cost Summary</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
        ${costRow('Ingredients / unit', ingPerUnit, '(incl. 5% loss)')}
        ${costRow('Packaging / unit', pkgPerUnit, '(incl. 5% loss)')}
        ${costRow('Labor / unit', laborPerUnit, `(${laborTotal.toFixed(2)} batch)`)}
        ${costRow('Allergen test / unit', allergenPerUnit, `(${calcState.allergenTestPerBatch.toFixed(2)} batch)`)}
        ${costRow('QA / Lab / unit', qaPerUnit, `(${calcState.qaTestPerBatch.toFixed(2)} batch)`)}
        ${costRow('Overhead / unit', overheadPerUnit)}
        ${costRow('Case / Carton / unit', casePerUnit)}
        ${costRow('Freight / unit', freightPerUnit)}
        ${costRow('Co-Pack fee / unit', copackPerUnit)}
      </div>
      <hr style="margin:14px 0;border:none;border-top:1px solid var(--grey-light)" />
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
        <div class="stat brown" style="margin:0"><div class="label">Total Cost / Unit</div><div class="value">${fmtMoney(totalPerUnit)}</div></div>
        <div class="stat" style="margin:0"><div class="label">Cost / oz</div><div class="value">${fmtMoney(costPerOz)}</div></div>
        <div class="stat" style="margin:0"><div class="label">Batch Cost (${units} units)</div><div class="value">${fmtMoney(batchTotal)}</div></div>
        <div class="stat ok" style="margin:0"><div class="label">Suggested Wholesale @ ${calcState.marginPct}% margin</div><div class="value">${fmtMoney(wholesale)}</div></div>
        <div class="stat ok" style="margin:0"><div class="label">Profit / Unit</div><div class="value">${fmtMoney(profitPerUnit)}</div></div>
        <div class="stat ok" style="margin:0"><div class="label">Batch Profit</div><div class="value">${fmtMoney(profitTotal)}</div></div>
      </div>
      <div style="margin-top:14px;text-align:right;font-size:13px;color:var(--brown-light)">
        Total batch revenue at suggested wholesale: <strong style="color:var(--brown)">${fmtMoney(wholesaleBatch)}</strong>
      </div>
    </div>
  `;
}
function costRow(label, perUnit, extra='') {
  return `<div style="display:flex;justify-content:space-between;font-size:13px">
    <span style="color:var(--brown-light)">${label} ${extra ? `<span style="font-size:11px">${escapeHtml(extra)}</span>`:''}</span>
    <span style="font-weight:600;color:var(--brown)">${fmtMoney(perUnit)}</span>
  </div>`;
}
async function resetCalc() {
  const ok = await openConfirmModal({
    title: 'Reset calculator',
    record: 'Product Calculator',
    message: 'Reset all calculator inputs?',
    risk: 'Unsaved calculator entries will be cleared.',
    confirmLabel: 'Reset Calculator',
    tone: 'danger'
  });
  if (!ok) return;
  calcState = {
    productId: '', units: 1000, sizeOz: 16,
    ingredients: [], packaging: [],
    allergenTestPerBatch: 150, qaTestPerBatch: 0,
    laborHours: 8, laborRate: 22,
    overheadPerUnit: 0.10, caseCostPerUnit: 0.05,
    freightPerUnit: 0.08, copackFeePerUnit: 0,
    marginPct: 35
  };
  renderProductCalculator(document.getElementById('productsBody'));
}

