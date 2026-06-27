/* =========================================================================
   PURCHASE ORDERS
   ========================================================================= */
let poTab = 'open';
function setPoTab(t) { poTab = t; renderPurchaseOrders(document.getElementById('content')); }

function renderPurchaseOrders(el) {
  ensureBackendPurchaseOrdersLoaded();
  const all = state.purchaseOrders.slice().sort((a,b)=>(b.poDate || '').localeCompare(a.poDate || ''));
  const open = all.filter(p => p.status !== 'completed');
  const completed = all.filter(p => p.status === 'completed');
  const pos = poTab === 'completed' ? completed : open;

  el.innerHTML = `
    <div class="card">
      <div class="tabs">
        <button class="tab ${poTab==='open'?'active':''}" onclick="setPoTab('open')">Open PO's <span class="tab-count">${open.length}</span></button>
        <button class="tab ${poTab==='completed'?'active':''}" onclick="setPoTab('completed')">Completed PO's <span class="tab-count">${completed.length}</span></button>
      </div>
      ${renderBackendStatusBanner('purchase-orders')}
      <div class="card-header" style="margin-top:14px">
        <h2>${poTab==='completed' ? 'Completed Purchase Orders' : 'Open Purchase Orders'}</h2>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="exportPOs()">Export CSV</button>
          ${poTab==='open' ? `<button class="btn" onclick="newPO()">+ New Purchase Order</button>` : ''}
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead>
          <tr>
            <th>PO #</th><th>Brand</th><th>Customer</th><th>PO Date</th><th>Requested</th>
            <th>Items</th><th>Total</th><th>PO File</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${pos.length === 0 ? `<tr><td colspan="10" class="empty">${poTab==='completed' ? 'No completed POs yet. POs that are shipped from the Shipping page appear here.' : 'No open purchase orders.'}</td></tr>` :
            pos.map(p => `
              <tr>
                <td><strong>${p.id}</strong></td>
                <td>${p.brand ? `<span class="pill">${escapeHtml(p.brand)}</span>` : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
                <td>${escapeHtml(getCustomer(p.customerId)?.name || '')}</td>
                <td>${fmtDate(p.poDate)}</td>
                <td>${fmtDate(p.requestedDate)}</td>
                <td>${p.lines.length}</td>
                <td>${fmtMoney(p.lines.reduce((s,l)=>s+l.qty*l.price,0))}</td>
                <td>${poFileLinkHtml(p)}</td>
                <td>${statusBadge(p.status)}</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="viewPO('${p.id}')">View</button>
                  <button class="btn btn-icon btn-sm" onclick="printPO('${p.id}')">Print</button>
                  ${p.status === 'pending' || p.status === 'in_supply_chain' ? `<button class="btn btn-icon btn-sm" onclick="editPO('${p.id}')">Edit</button>` : ''}
                  ${p.status === 'pending' || p.status === 'in_supply_chain' ? `<button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deletePO('${p.id}')">Delete</button>` : ''}
                </td>
              </tr>
            `).join('')
          }
        </tbody>
      </table></div>
    </div>
  `;
}

function exportPOs() {
  const rows = state.purchaseOrders.map(p => ({
    PO: p.id,
    Brand: p.brand || '',
    Customer: getCustomer(p.customerId)?.name || '',
    PO_Date: p.poDate,
    Requested_Date: p.requestedDate,
    Status: p.status,
    Items: p.lines.length,
    Units: p.lines.reduce((s,l)=>s+l.qty,0),
    Total: p.lines.reduce((s,l)=>s+l.qty*l.price,0).toFixed(2),
    Production_Date: p.productionDate || '',
    Production_Room: p.productionRoom || ''
  }));
  exportCsv('purchase_orders.csv', rows);
}

function poFileLinkHtml(po) {
  if (!po?.poFile) return '<span style="color:var(--brown-light);font-size:12px">-</span>';
  const file = po.poFile;
  const label = escapeHtml(file.name.length > 18 ? file.name.slice(0, 16) + '..' : file.name);
  if (file._backendFileId) {
    return `<button class="portal-download-btn" onclick="downloadBackendFile('${file._backendFileId}', '${escapeAttr(file.name)}')" title="${escapeHtml(file.name)}">Download file</button>`;
  }
  return `<a class="portal-download-btn" href="${file.dataUrl}" download="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}">Download file</a>`;
}

function poFileDetailHtml(po) {
  if (!po?.poFile) return '';
  const file = po.poFile;
  if (file._backendFileId) {
    return `<div style="margin-top:8px"><button class="btn btn-icon btn-sm" onclick="downloadBackendFile('${file._backendFileId}', '${escapeAttr(file.name)}')">File: ${escapeHtml(file.name)}</button></div>`;
  }
  return `<div style="margin-top:8px"><a href="${file.dataUrl}" download="${escapeHtml(file.name)}" style="color:var(--orange);font-size:13px">File: ${escapeHtml(file.name)}</a></div>`;
}

function escapeAttr(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function poFormHtml(po) {
  const isNew = !po;
  po = po || { id: nextPoId(), brand: '', customerId: '', poDate: new Date().toISOString().slice(0,10), requestedDate: '', notes: '', lines: [], poFile: null };
  return `
    <form id="poForm" onsubmit="event.preventDefault(); savePO(${isNew}, '${po.id}')">
      <div class="form-grid">
        <div class="form-row">
          <label>PO #</label>
          <input id="po_id" value="${escapeHtml(po.id)}" ${isNew ? '' : 'readonly'} />
        </div>
        <div class="form-row">
          <label>Brand *</label>
          <select id="po_brand" required>
            <option value="">- Select Brand -</option>
            ${BRANDS.map(b => `<option value="${escapeHtml(b)}" ${po.brand===b?'selected':''}>${escapeHtml(b)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Customer</label>
          <select id="po_customer" required>
            <option value="">- Select -</option>
            ${state.customers.map(c => `<option value="${c.id}" ${po.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>PO Date</label>
          <input type="date" id="po_date" value="${po.poDate}" required />
        </div>
        <div class="form-row">
          <label>Requested Ship Date</label>
          <input type="date" id="po_requested" value="${po.requestedDate || ''}" />
        </div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <label>Attach PO PDF</label>
        <div class="file-upload">
          <input type="file" id="po_file" accept=".pdf,application/pdf,image/*" onchange="poFileSelected(event)" />
          <div class="file-info ${po.poFile?'has':''}" id="po_file_info">
            ${po.poFile ? `&#128206; ${escapeHtml(po.poFile.name)} (${Math.round(po.poFile.size/1024)} KB)` : 'No file attached. PDF preferred.'}
          </div>
          ${po.poFile ? `<button type="button" class="btn btn-icon btn-sm" onclick="clearPoFile()">Remove</button>` : ''}
        </div>
        <input type="hidden" id="po_file_data" value='${po.poFile ? JSON.stringify(po.poFile).replace(/'/g, "&#039;") : ""}' />
      </div>
      <div style="margin-top:18px">
        <label style="font-weight:600;color:var(--brown);font-size:13px">Line Items</label>
        <div class="po-line" style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
          <div>Product</div><div>Qty</div><div>Unit Price</div><div>Subtotal</div><div></div>
        </div>
        <div id="poLines">
          ${po.lines.map((l,i) => poLineHtml(l, i)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="addPoLine()" style="margin-top:8px">+ Add Line</button>
      </div>
      <div class="form-row" style="margin-top:14px">
        <label>Notes</label>
        <textarea id="po_notes">${escapeHtml(po.notes || '')}</textarea>
      </div>
      <div id="poTotal" style="margin-top:12px;text-align:right;font-weight:700;color:var(--brown);font-size:16px">Total: $0.00</div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew ? 'Submit PO &rarr; Supply Chain' : 'Save Changes'}</button>
      </div>
    </form>
  `;
}
function poLineHtml(line, idx) {
  return `
    <div class="po-line" data-idx="${idx}">
      <select onchange="poLineProductChange(${idx})">
        <option value="">- Select Product -</option>
        ${state.products.map(p => `<option value="${p.id}" data-price="${p.price}" ${line.productId===p.id?'selected':''}>${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join('')}
      </select>
      <input type="number" min="1" value="${line.qty || 1}" onchange="recalcPoTotal()" />
      <input type="number" step="0.01" min="0" value="${(line.price ?? 0).toFixed(2)}" onchange="recalcPoTotal()" />
      <div class="line-sub" style="text-align:right;font-weight:600;color:var(--brown)">$0.00</div>
      <button type="button" onclick="removePoLine(${idx})">&times;</button>
    </div>
  `;
}
function addPoLine() {
  const cont = document.getElementById('poLines');
  const idx = cont.children.length;
  const div = document.createElement('div');
  div.innerHTML = poLineHtml({ productId: '', qty: 1, price: 0 }, idx);
  cont.appendChild(div.firstElementChild);
  recalcPoTotal();
}
function removePoLine(idx) {
  const lines = document.querySelectorAll('#poLines .po-line');
  if (lines[idx]) lines[idx].remove();
  recalcPoTotal();
}
function poLineProductChange(idx) {
  const row = document.querySelectorAll('#poLines .po-line')[idx];
  if (!row) return;
  const sel = row.querySelector('select');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.price) {
    row.querySelectorAll('input')[1].value = parseFloat(opt.dataset.price).toFixed(2);
  }
  recalcPoTotal();
}
function recalcPoTotal() {
  let total = 0;
  document.querySelectorAll('#poLines .po-line').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const qty = parseFloat(inputs[0].value) || 0;
    const price = parseFloat(inputs[1].value) || 0;
    const sub = qty * price;
    total += sub;
    row.querySelector('.line-sub').textContent = fmtMoney(sub);
  });
  const tot = document.getElementById('poTotal');
  if (tot) tot.textContent = 'Total: ' + fmtMoney(total);
}
function newPO() {
  if (state.products.length === 0) {
    toast('Add a customer/product first.');
    return;
  }
  if (state.customers.length === 0) {
    toast('Add a customer first.');
    return;
  }
  openModal('New Purchase Order', poFormHtml(null));
  setTimeout(() => { addPoLine(); recalcPoTotal(); }, 30);
}
function editPO(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  openModal('Edit ' + id, poFormHtml(po));
  setTimeout(recalcPoTotal, 30);
}
function poFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  pendingPoFile = f;
  const reader = new FileReader();
  reader.onload = () => {
    const data = { name: f.name, type: f.type, size: f.size, dataUrl: reader.result };
    document.getElementById('po_file_data').value = JSON.stringify(data);
    const info = document.getElementById('po_file_info');
    info.innerHTML = `&#128206; ${escapeHtml(f.name)} (${Math.round(f.size/1024)} KB)`;
    info.classList.add('has');
  };
  reader.readAsDataURL(f);
}
function clearPoFile() {
  pendingPoFile = null;
  document.getElementById('po_file_data').value = '';
  document.getElementById('po_file').value = '';
  const info = document.getElementById('po_file_info');
  info.textContent = 'No file attached. PDF preferred.';
  info.classList.remove('has');
}

async function savePO(isNew, oldId) {
  const id = document.getElementById('po_id').value.trim();
  const brand = document.getElementById('po_brand').value;
  const customerId = document.getElementById('po_customer').value;
  const poDate = document.getElementById('po_date').value;
  const requestedDate = document.getElementById('po_requested').value;
  const notes = document.getElementById('po_notes').value;
  if (!brand) { toast('Brand required.'); return; }
  if (!customerId) { toast('Customer required.'); return; }

  let poFile = null;
  const fileDataStr = document.getElementById('po_file_data').value;
  if (fileDataStr) { try { poFile = JSON.parse(fileDataStr); } catch(e){} }

  const lines = [];
  document.querySelectorAll('#poLines .po-line').forEach(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    if (sel.value && parseFloat(inputs[0].value) > 0) {
      lines.push({ productId: sel.value, qty: parseInt(inputs[0].value, 10), price: parseFloat(inputs[1].value) });
    }
  });
  if (!lines.length) { toast('At least one line item required.'); return; }

  const localPo = {
    id, brand, customerId, poDate, requestedDate, notes, lines,
    status: 'in_supply_chain',
    productionDate: null, productionRoom: null, shipping: null,
    poFile, _pendingUploadFile: pendingPoFile, scOverrides: {}
  };

  if (!requireBackendWriteSession(backendApiState)) return;

  if (isNew) {
    try {
      await createBackendPurchaseOrder(localPo);
      pendingPoFile = null;
      toast(`${id} submitted to Supply Chain through backend.`);
      closeModal();
      router(currentPage);
      return;
    } catch (error) {
      markBackendUnavailable(error);
      failBackendRequiredWrite(error, backendApiState);
      return;
    }
  }

  if (!isNew) {
    const existing = state.purchaseOrders.find(p => p.id === oldId);
    if (!existing?._backendId) return failBackendRequiredWrite(null, backendApiState, 'This purchase order is not backend-backed. Nothing was saved locally.');
    try {
      await updateBackendPurchaseOrder({ ...existing, ...localPo, _backendId: existing._backendId });
      pendingPoFile = null;
      toast(`${id} updated through backend.`);
      closeModal();
      router(currentPage);
      return;
    } catch (error) {
      markBackendUnavailable(error);
      failBackendRequiredWrite(error, backendApiState);
      return;
    }
  }
}

async function deletePO(id) {
  const ok = await openConfirmModal({
    title: 'Delete purchase order',
    record: id,
    message: 'Delete this purchase order from the current workspace?',
    risk: 'This removes the PO from the visible workflow. Approved, production, shipping, and completed POs should not be removed through ordinary entry.',
    confirmLabel: 'Delete PO',
    tone: 'danger'
  });
  if (!ok) return;
  state.purchaseOrders = state.purchaseOrders.filter(p => p.id !== id);
  saveState();
  router(currentPage);
  toast(`${id} deleted.`);
}
async function viewPO(id) {
  let po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  if (po._backendId && backendApiState.status !== 'local') {
    try {
      po = await readBackendPurchaseOrder(po);
    } catch (error) {
      markBackendUnavailable(error);
      toast('Backend detail unavailable ? showing local copy.');
    }
  }
  const cust = getCustomer(po.customerId);
  const total = po.lines.reduce((s,l)=>s+l.qty*l.price,0);
  openModal(`${po.id} - ${escapeHtml(cust?.name || '')}`, `
    <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Brand / Customer</div>
        <div>${po.brand ? `<span class="pill">${escapeHtml(po.brand)}</span>` : ''}</div>
        <div style="font-weight:600;margin-top:2px">${escapeHtml(cust?.name || '')}</div>
        <div style="font-size:12px;color:var(--brown-light)">${escapeHtml(cust?.address || '')}</div>
        ${poFileDetailHtml(po)}
      </div>
      <div>
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">PO Date</div>
        <div>${fmtDate(po.poDate)}</div>
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;margin-top:6px">Requested</div>
        <div>${fmtDate(po.requestedDate)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Status</div>
        <div style="margin-top:4px">${statusBadge(po.status)}</div>
        ${po.productionDate ? `<div style="font-size:12px;margin-top:6px">Production: ${fmtDate(po.productionDate)}${po.productionEndDate && po.productionEndDate !== po.productionDate ? ' &rarr; ' + fmtDate(po.productionEndDate) : ''} <span class="room-dot" style="display:inline-block;background:${roomColor(po.productionRoom)};vertical-align:middle"></span> ${escapeHtml(po.productionRoom || '')}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
      <button class="btn btn-icon btn-sm" onclick="editProductionValues('${po.id}')">&#9998; Edit Units / Cases / Lot #</button>
    </div>
    <table>
      <thead><tr><th>Product</th><th>SKU</th><th>Ordered</th><th>Units Produced</th><th>Cases Produced</th><th>Lot #</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${po.lines.map(l => {
          const p = getProduct(l.productId);
          const units = (typeof l.actualQty === 'number') ? l.actualQty : '<span style="color:var(--brown-light)">-</span>';
          const cases = (typeof l.casesProduced === 'number') ? l.casesProduced : '<span style="color:var(--brown-light)">-</span>';
          const lot = l.lotNumber ? `<span class="pill">${escapeHtml(l.lotNumber)}</span>` : '<span style="color:var(--brown-light)">-</span>';
          return `<tr>
            <td>${escapeHtml(p?.name || '-')}</td>
            <td>${escapeHtml(p?.sku || '')}</td>
            <td>${l.qty}</td>
            <td>${units}</td>
            <td>${cases}</td>
            <td>${lot}</td>
            <td>${fmtMoney(l.price)}</td>
            <td>${fmtMoney(l.qty * l.price)}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr><th colspan="7" style="text-align:right">Total</th><th>${fmtMoney(total)}</th></tr>
      </tfoot>
    </table>
    ${po.notes ? `<div class="inv-check" style="margin-top:14px"><strong>Notes:</strong> ${escapeHtml(po.notes)}</div>` : ''}
    ${(Array.isArray(po.materialsUsed) && po.materialsUsed.length) ? `
      <div style="margin-top:14px">
        <div style="font-size:12px;font-weight:700;color:var(--brown);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Materials Used &nbsp;<span style="font-weight:400;text-transform:none;color:${(po.wasteLossPct||0)>7?'var(--danger)':'var(--brown-light)'}">Waste Loss: ${(po.wasteLossPct>=0?'+':'')+(po.wasteLossPct||0)}%</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Theoretical</th><th>Actual Used</th><th>Lot #</th></tr></thead>
          <tbody>
            ${po.materialsUsed.map(m => {
              const ing = getIngredient(m.ingredientId);
              return `<tr>
                <td>${escapeHtml(ing?.name||'-')} <span class="pill">${escapeHtml(m.category||'')}</span></td>
                <td>${(m.theoretical||0).toFixed(2)} ${escapeHtml(ing?.unit||'')}</td>
                <td>${(m.actual||0).toFixed(2)} ${escapeHtml(ing?.unit||'')}</td>
                <td>${m.lot ? '<span class="pill">'+escapeHtml(m.lot)+'</span>' : '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    ` : ''}
    ${po.completionNotes ? `<div class="inv-check ok" style="margin-top:14px"><strong>Production Notes:</strong> ${escapeHtml(po.completionNotes)}</div>` : ''}
    ${po.coa ? `<div class="inv-check ok" style="margin-top:14px"><strong>COA:</strong> <a href="${po.coa.dataUrl}" download="${escapeHtml(po.coa.name)}" style="color:var(--orange);text-decoration:none">&#128206; ${escapeHtml(po.coa.name)}</a> <span style="font-size:11px;color:var(--brown-light)">uploaded ${fmtDate(po.coa.uploadedAt?.slice(0,10)||'')} by ${escapeHtml(po.coa.uploadedBy||'-')}</span></div>` : ''}
    ${po.qaNotes ? `<div class="inv-check" style="margin-top:14px"><strong>QA Notes:</strong> ${escapeHtml(po.qaNotes)}</div>` : ''}
    ${(po.productionDate && po.status !== 'completed' && !po.productionFinalized) ? `
      <div style="margin-top:14px;padding:14px;background:#e8f4e2;border-left:4px solid var(--success);border-radius:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;color:var(--brown);font-size:14px">Production complete?</div>
          <div style="font-size:12px;color:var(--brown-light)">Marks the PO as done, deducts inventory, and sends it to Quality Assurance for COA upload before shipping.</div>
        </div>
        <button class="btn" style="background:var(--success);font-size:14px;padding:10px 18px" onclick="markCompleted('${po.id}')">&#10003; Mark Complete &rarr; QA</button>
      </div>
    ` : ''}
    <div class="form-actions" style="flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-icon" onclick="printFormulaForPO('${po.id}')">Print Formula</button>
      <button class="btn btn-icon" onclick="printSpecSheetForPO('${po.id}')">Print Spec Sheet</button>
      <button class="btn btn-dark" onclick="printPO('${po.id}')">Print PO</button>
    </div>
  `);
}

function printFormulaForPO(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const cust = getCustomer(po.customerId);
  // gather formula per product on the PO
  const blocks = po.lines.map(line => {
    const p = getProduct(line.productId);
    if (!p) return '';
    const bom = (state.boms || {})[p.id] || [];
    if (bom.length === 0) {
      return `
        <h2>${escapeHtml(p.name)} <span style="font-weight:400;color:#8B5E3C">(${escapeHtml(p.sku)})</span></h2>
        <p style="color:#8B5E3C;font-style:italic">No formula on file for this product.</p>
      `;
    }
    const totalPct = bom.reduce((s, b) => s + (b.pct || 0), 0);
    return `
      <h2>${escapeHtml(p.name)} <span style="font-weight:400;color:#8B5E3C">(${escapeHtml(p.sku)})</span></h2>
      <div style="font-size:13px;color:#5C3A21;margin-bottom:8px">${p.size ? `Unit size: ${p.size}${escapeHtml(p.sizeUnit||'oz')} &middot; ` : ''}Production room: ${escapeHtml(p.room||'-')}</div>
      <table>
        <thead><tr><th>Ingredient / Packaging</th><th style="text-align:right">%</th></tr></thead>
        <tbody>
          ${bom.map(b => {
            const ing = getIngredient(b.ingredientId);
            if (!ing) return '';
            return `<tr>
              <td>${escapeHtml(ing.name)}</td>
              <td style="text-align:right"><strong>${(b.pct||0).toFixed(2)}%</strong></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr><th style="text-align:right">Total</th><th style="text-align:right">${totalPct.toFixed(2)}%</th></tr>
        </tfoot>
      </table>
    `;
  }).join('<hr style="margin:24px 0;border:none;border-top:1px solid #C9BFAE" />');

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Formula - ${po.id}</title>
    <style>
      body{font-family:Helvetica,Arial,sans-serif;padding:36px;color:#1A1A1A}
      h1{color:#5C3A21;margin:0 0 4px}
      h2{color:#5C3A21;margin:18px 0 8px;font-size:18px}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #E07B2A;padding-bottom:12px;margin-bottom:18px}
      .label{font-size:11px;color:#8B5E3C;text-transform:uppercase;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
      th{background:#F5E9D3;text-align:left;padding:8px;border-bottom:2px solid #5C3A21}
      td{padding:8px;border-bottom:1px solid #E9E2D2}
      tfoot th{background:#5C3A21;color:#fff}
    </style></head><body>
    <div class="head">
      <div>
        <h1>Production Formula</h1>
        <div style="color:#8B5E3C">${po.id} &middot; ${escapeHtml(cust?.name||'')}${po.brand ? ' &middot; '+escapeHtml(po.brand) : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="label">Production Date</div>
        <div>${fmtDate(po.productionDate)}</div>
        <div class="label" style="margin-top:6px">Room</div>
        <div>${escapeHtml(po.productionRoom||'-')}</div>
      </div>
    </div>
    ${blocks}
    <p style="margin-top:30px;color:#8B5E3C;font-size:12px">Generated for production use. Verify against current spec sheet before each batch.</p>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

function printSpecSheetForPO(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const cust = getCustomer(po.customerId);
  if (!cust) { toast('No customer linked to this PO.'); return; }
  const sheet = cust.specSheet;
  if (!sheet || !sheet.dataUrl) {
    toast('No spec sheet on file for ' + (cust.name || 'this customer') + '. Upload one on the Customers page.');
    return;
  }
  // open the file in a new tab - browser handles PDF/image/etc display + print
  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups to print.'); return; }
  const isPdf = (sheet.type && sheet.type.includes('pdf')) || /\.pdf$/i.test(sheet.name||'');
  const isImg = (sheet.type && sheet.type.startsWith('image/'));
  if (isPdf) {
    w.document.write(`
      <html><head><title>Spec Sheet &mdash; ${escapeHtml(cust.name||'')}</title></head>
      <body style="margin:0">
        <embed src="${sheet.dataUrl}" type="application/pdf" width="100%" style="height:100vh" />
        <script>setTimeout(()=>window.print(), 600);<\/script>
      </body></html>
    `);
  } else if (isImg) {
    w.document.write(`
      <html><head><title>Spec Sheet &mdash; ${escapeHtml(cust.name||'')}</title>
      <style>body{margin:0;padding:24px;text-align:center;font-family:Helvetica,Arial,sans-serif}img{max-width:100%}</style>
      </head><body>
        <h2 style="color:#5C3A21;margin:0 0 12px">Spec Sheet &mdash; ${escapeHtml(cust.name||'')}</h2>
        <img src="${sheet.dataUrl}" alt="${escapeHtml(sheet.name||'spec sheet')}" />
        <script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>
      </body></html>
    `);
  } else {
    // fallback: trigger download
    const a = document.createElement('a');
    a.href = sheet.dataUrl;
    a.download = sheet.name || 'spec-sheet';
    document.body.appendChild(a); a.click(); a.remove();
    w.close();
    toast('Spec sheet downloaded - open and print from your viewer.');
    return;
  }
  w.document.close();
}

function printPO(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const cust = getCustomer(po.customerId);
  const total = po.lines.reduce((s,l)=>s+l.qty*l.price,0);
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${po.id}</title>
    <style>
      body{font-family:Helvetica,Arial,sans-serif;padding:36px;color:#1A1A1A}
      h1{color:#5C3A21;margin:0 0 4px}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #E07B2A;padding-bottom:12px;margin-bottom:18px}
      .meta{display:flex;justify-content:space-between;margin:14px 0}
      .meta div{font-size:13px}
      .label{font-size:11px;color:#8B5E3C;text-transform:uppercase;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#F5E9D3;text-align:left;padding:8px;border-bottom:2px solid #5C3A21}
      td{padding:8px;border-bottom:1px solid #E9E2D2}
      tfoot th{background:#5C3A21;color:#fff;text-align:right}
      tfoot th:last-child{text-align:left}
    </style></head><body>
    <div class="head">
      <div>
        <h1>Nut House</h1>
        <div style="color:#8B5E3C">Peanut Butter & Dog Treat Co.</div>
      </div>
      <div style="text-align:right">
        <h1>PURCHASE ORDER</h1>
        <div style="font-weight:600">${po.id}</div>
        <div>${fmtDate(po.poDate)}</div>
      </div>
    </div>
    <div class="meta">
      <div>
        <div class="label">Bill / Ship To</div>
        <div style="font-weight:600">${escapeHtml(cust?.name||'')}</div>
        <div>${escapeHtml(cust?.address||'')}</div>
        <div>${escapeHtml(cust?.contact||'')}</div>
        <div>${escapeHtml(cust?.email||'')} ${escapeHtml(cust?.phone||'')}</div>
      </div>
      <div style="text-align:right">
        <div class="label">Requested Ship Date</div>
        <div>${fmtDate(po.requestedDate)}</div>
        <div class="label" style="margin-top:6px">Status</div>
        <div>${(po.status||'').replace(/_/g,' ')}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${po.lines.map(l => {
          const p = getProduct(l.productId);
          return `<tr><td>${escapeHtml(p?.sku||'')}</td><td>${escapeHtml(p?.name||'')}</td><td>${l.qty}</td><td>${fmtMoney(l.price)}</td><td>${fmtMoney(l.qty*l.price)}</td></tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr><th colspan="4">Total</th><th>${fmtMoney(total)}</th></tr></tfoot>
    </table>
    ${po.notes ? `<p style="margin-top:18px"><strong>Notes:</strong> ${escapeHtml(po.notes)}</p>` : ''}
    <p style="margin-top:30px;color:#8B5E3C;font-size:12px">Thank you for your business!</p>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

