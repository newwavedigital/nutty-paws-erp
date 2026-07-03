/* =========================================================================
   PICK & PACK
   ========================================================================= */
let pickPackTab = 'pos';
function setPickPackTab(t) { pickPackTab = t; renderPickPack(document.getElementById('content')); }
function nextPickPackId() {
  const nums = (state.pickPackOrders || [])
    .map(p => parseInt((p.id.match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  return 'PP-' + ((nums.length ? Math.max(...nums) : 1000) + 1);
}
function pickPackCustomers() {
  return state.customers.filter(c => c.pickPackEligible || PICK_PACK_CUSTOMER_NAMES.includes(c.name));
}
function finishedGoodsForCustomer(customerId) {
  return state.ingredients.filter(i => (i.category === 'Finished Good') && i.customerId === customerId);
}

function renderPickPack(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendPickPackState.loaded && !backendPickPackState.loading) {
    loadBackendPickPack().then(() => { if (currentPage === 'pick-pack') router('pick-pack'); }).catch(() => {});
  }
  const open = (state.pickPackOrders || []).filter(p => p.status === 'open');
  const ship = (state.pickPackOrders || []).filter(p => p.status === 'picked');
  const done = (state.pickPackOrders || []).filter(p => p.status === 'shipped');
  const openReqs = (state.productionRequests||[]).filter(r => r.status !== 'Fulfilled' && r.status !== 'Declined').length;
  el.innerHTML = `
    ${renderBackendPickPackBanner()}
    <div class="card">
      <div class="tabs">
        <button class="tab ${pickPackTab==='pos'?'active':''}" onclick="setPickPackTab('pos')">Purchase Orders <span class="tab-count">${open.length}</span></button>
        <button class="tab ${pickPackTab==='shipping'?'active':''}" onclick="setPickPackTab('shipping')">Shipping <span class="tab-count">${ship.length}</span></button>
        <button class="tab ${pickPackTab==='shipped'?'active':''}" onclick="setPickPackTab('shipped')">Shipped <span class="tab-count">${done.length}</span></button>
        <button class="tab ${pickPackTab==='requests'?'active':''}" onclick="setPickPackTab('requests')">Requested PO's <span class="tab-count">${openReqs}</span></button>
      </div>
      <div id="pickPackBody" style="margin-top:14px"></div>
    </div>
  `;
  const body = document.getElementById('pickPackBody');
  if (pickPackTab === 'pos') renderPickPackPOs(body, open);
  else if (pickPackTab === 'shipping') renderPickPackShipping(body, ship);
  else if (pickPackTab === 'requests') renderProductionRequests(body);
  else renderPickPackShipped(body, done);
}

/* ----- Requested PO's (production replenishment requests) ----- */
const PROD_REQUEST_STATUSES = ['Requested', 'Approved', 'In Production', 'Fulfilled', 'Declined'];
function prodReqStatusClass(s) {
  switch(s) {
    case 'Requested': return 'badge-pending';
    case 'Approved': return 'badge-supply';
    case 'In Production': return 'badge-prod';
    case 'Fulfilled': return 'badge-complete';
    case 'Declined': return 'badge-low';
    default: return 'badge-complete';
  }
}
function renderProductionRequests(el) {
  const reqs = (state.productionRequests||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const actionsDisabled = productionRequestActionsDisabled();
  el.innerHTML = `
    <div class="card-header">
      <h2>Requested Production Orders</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('production_requests.csv', state.productionRequests.map(r=>({id:r.id,date:r.date,distributor:getCustomer(r.customerId)?.name||'',product:state.ingredients.find(i=>i.id===r.ingredientId)?.name||'',qty_requested:r.qtyRequested,on_hand:state.ingredients.find(i=>i.id===r.ingredientId)?.stock||0,needed_by:r.neededBy,requested_by:r.requestedBy,status:r.status,notes:r.notes})))">Export CSV</button>
        <button class="btn" ${actionsDisabled ? 'disabled title="Backend automation not confirmed yet"' : 'onclick="editProductionRequest()"'}>+ Request Production</button>
      </div>
    </div>
    ${productionRequestsUnsupportedHtml()}
    <div class="help-text" style="margin-bottom:8px">Pick &amp; Pack staff can request more product to be made for <strong>Bnutty, Poochie Butter, or Wonder Bark</strong> when finished-goods inventory is running low for fulfillment.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Distributor</th><th>Product</th><th>Qty Requested</th><th>On Hand</th><th>Needed By</th><th>Requested By</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${reqs.length === 0 ? `<tr><td colspan="9" class="empty">No production requests yet.</td></tr>` :
          reqs.map(r => {
            const fg = state.ingredients.find(i=>i.id===r.ingredientId);
            const onHand = fg?.stock || 0;
            const low = onHand < r.qtyRequested;
            return `<tr>
              <td>${fmtDate(r.date)}</td>
              <td>${escapeHtml(getCustomer(r.customerId)?.name||'')}</td>
              <td><strong>${escapeHtml(fg?.name||'-')}</strong></td>
              <td>${r.qtyRequested}</td>
              <td style="${low?'color:var(--danger);font-weight:600':''}">${onHand}${low?' &#9888;':''}</td>
              <td>${fmtDate(r.neededBy)}</td>
              <td>${escapeHtml(r.requestedBy||'')}</td>
              <td>
                <select ${actionsDisabled ? 'disabled title="Backend automation not confirmed yet"' : `onchange="updateProductionRequestStatus('${r.id}', this.value)"`} style="font-size:12px;padding:4px 6px;border:1px solid var(--grey);border-radius:4px;background:var(--white)">
                  ${PROD_REQUEST_STATUSES.map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
                </select>
              </td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" ${actionsDisabled ? 'disabled title="Backend automation not confirmed yet"' : `onclick="editProductionRequest('${r.id}')"`}>Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" ${actionsDisabled ? 'disabled title="Backend automation not confirmed yet"' : `onclick="deleteProductionRequest('${r.id}')"`}>Delete</button>
              </td>
            </tr>`;
          }).join('')}
      </tbody>
    </table></div>
  `;
}

function productionRequestActionsDisabled() {
  return employeeBackendSessionActive();
}

function productionRequestsUnsupportedHtml() {
  if (!productionRequestActionsDisabled()) return '';
  return `
    <div class="inv-check" style="margin-bottom:10px">
      <strong>Requested PO's are not included in the backend automations yet.</strong>
      <div class="help-text">This Pick &amp; Pack replenishment request workflow is unsupported as of now and needs confirmation before we add it to the automation scope. Signed-in users can view existing rows only; request, status, edit, and delete actions are disabled so nothing appears saved when it is not backend-backed.</div>
    </div>
  `;
}
function editProductionRequest(id) {
  if (productionRequestActionsDisabled()) {
    failBackendRequiredWrite(null, backendPickPackState, "Requested PO's are not included in the backend automations yet. Nothing was saved locally.");
    return;
  }
  const r = (state.productionRequests||[]).find(x=>x.id===id) || { id: uid('pr'), date: new Date().toISOString().slice(0,10), customerId:'', ingredientId:'', qtyRequested:0, neededBy:'', requestedBy: state.users?.[0]?.name||'', notes:'', status:'Requested' };
  const isNew = !id;
  openModal((isNew?'Request':'Edit')+' Production', `
    <form onsubmit="event.preventDefault();saveProductionRequest('${r.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Distributor *</label>
          <select id="pr_customer" required onchange="prFgOptions()">
            <option value="">- Select -</option>
            ${pickPackCustomers().map(c=>`<option value="${c.id}" ${r.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Product (Finished Good) *</label>
          <select id="pr_fg" required>
            <option value="">- Pick distributor first -</option>
          </select>
          <div class="help-text" id="pr_onhand_help"></div>
        </div>
        <div class="form-row"><label>Quantity Requested *</label><input type="number" min="1" id="pr_qty" value="${r.qtyRequested||''}" required /></div>
        <div class="form-row"><label>Needed By</label><input type="date" id="pr_needed" value="${r.neededBy||''}" /></div>
        <div class="form-row"><label>Requested By</label><input id="pr_by" value="${escapeHtml(r.requestedBy||'')}" /></div>
        <div class="form-row"><label>Date</label><input type="date" id="pr_date" value="${r.date||''}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Reason / Notes</label>
        <textarea id="pr_notes" placeholder="e.g. Running low for upcoming Chewy order, only 2 cases left...">${escapeHtml(r.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Submit Request':'Save Changes'}</button>
      </div>
    </form>
  `);
  // populate FG dropdown for the (possibly preset) customer
  prFgOptions(r.ingredientId);
}
function prFgOptions(selectedFgId) {
  const sel = document.getElementById('pr_fg');
  const help = document.getElementById('pr_onhand_help');
  if (!sel) return;
  const customerId = document.getElementById('pr_customer').value;
  const fgs = customerId ? finishedGoodsForCustomer(customerId) : [];
  sel.innerHTML = `<option value="">${customerId ? (fgs.length?'- Select -':'No finished goods for this distributor') : '- Pick distributor first -'}</option>` +
    fgs.map(f => `<option value="${f.id}" data-stock="${f.stock||0}" ${selectedFgId===f.id?'selected':''}>${escapeHtml(f.name)} (on hand: ${f.stock||0})</option>`).join('');
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    if (help) help.textContent = opt && opt.dataset.stock !== undefined ? `Current on hand: ${opt.dataset.stock}` : '';
  };
  sel.onchange();
}
function saveProductionRequest(id, isNew) {
  if (productionRequestActionsDisabled()) {
    failBackendRequiredWrite(null, backendPickPackState, "Requested PO's are not included in the backend automations yet. Nothing was saved locally.");
    return;
  }
  const customerId = document.getElementById('pr_customer').value;
  const ingredientId = document.getElementById('pr_fg').value;
  const qty = parseInt(document.getElementById('pr_qty').value, 10) || 0;
  if (!customerId) { toast('Distributor required.'); return; }
  if (!ingredientId) { toast('Pick a product.'); return; }
  if (qty <= 0) { toast('Enter a quantity.'); return; }
  const data = {
    id, customerId, ingredientId, qtyRequested: qty,
    neededBy: document.getElementById('pr_needed').value,
    requestedBy: document.getElementById('pr_by').value,
    date: document.getElementById('pr_date').value || new Date().toISOString().slice(0,10),
    notes: document.getElementById('pr_notes').value,
    status: (state.productionRequests||[]).find(x=>x.id===id)?.status || 'Requested'
  };
  state.productionRequests = state.productionRequests || [];
  if (isNew) state.productionRequests.push(data);
  else Object.assign(state.productionRequests.find(x=>x.id===id), data);
  saveState();
  closeModal();
  pickPackTab = 'requests';
  router('pick-pack');
  toast(isNew ? 'Production request submitted.' : 'Request updated.');
}
function updateProductionRequestStatus(id, status) {
  if (productionRequestActionsDisabled()) {
    failBackendRequiredWrite(null, backendPickPackState, "Requested PO's are not included in the backend automations yet. Nothing was saved locally.");
    return;
  }
  const r = (state.productionRequests||[]).find(x=>x.id===id);
  if (!r) return;
  r.status = status;
  saveState();
  toast('Status updated.');
}
async function deleteProductionRequest(id) {
  if (productionRequestActionsDisabled()) {
    return failBackendRequiredWrite(null, backendPickPackState, "Requested PO's are not included in the backend automations yet. Nothing was saved locally.");
  }
  const ok = await openConfirmModal({
    title: 'Delete production request',
    record: id,
    message: 'Delete this production request?',
    risk: 'This removes the local production request row from Pick & Pack.',
    confirmLabel: 'Delete Request',
    tone: 'danger'
  });
  if (!ok) return;
  state.productionRequests = state.productionRequests.filter(x=>x.id!==id);
  saveState();
  router('pick-pack');
}

function renderPickPackPOs(el, pos) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Active Purchase Orders</h2>
      <div>
        <button class="btn" onclick="newPickPackPO()">+ New Pick &amp; Pack PO</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Pick &amp; Pack POs from <strong>${PICK_PACK_CUSTOMER_NAMES.join(', ')}</strong>. Inventory is checked against Finished Goods stock for that customer.</div>
    ${pos.length === 0
      ? '<div class="empty">No active pick &amp; pack POs. Click "+ New Pick &amp; Pack PO" to add one.</div>'
      : `<div class="table-wrap"><table>
          <thead><tr>
            <th>PP #</th><th>Distributor</th><th>PO #</th><th>Date Submitted</th><th>Date Needed to Ship</th><th>Items</th><th>Stock</th><th>PO File</th><th></th>
          </tr></thead>
          <tbody>
            ${pos.map(p => {
              const cust = getCustomer(p.customerId);
              const stockOk = pickPackStockCheck(p);
              const stockBadge = stockOk.ok
                ? '<span class="badge badge-prod">Available</span>'
                : `<span class="badge badge-low" title="${escapeHtml(stockOk.short.map(s=>s.item+': short '+s.shortBy).join('; '))}">Short ${stockOk.short.length}</span>`;
              return `<tr>
                <td><strong>${escapeHtml(p.id)}</strong></td>
                <td>${escapeHtml(cust?.name||'')}</td>
                <td><span class="pill">${escapeHtml(p.poNumber||'-')}</span></td>
                <td>${fmtDate(p.dateSubmitted)}</td>
                <td>${fmtDate(p.dateNeededToShip)}</td>
                <td>${p.lines.length}</td>
                <td>${stockBadge}</td>
                <td>${p.poFile
                  ? `<div style="display:flex;gap:4px"><button class="btn btn-icon btn-sm" onclick="viewPickPackPoFile('${p.id}')" title="View PO">&#128065;</button>${backendFileActionHtml(p.poFile, {
                      className: 'btn btn-icon btn-sm',
                      style: 'text-decoration:none',
                      htmlLabel: '&#11015;',
                      label: 'Download PO',
                      title: 'Download PO'
                    })}</div>`
                  : '<span style="color:var(--brown-light);font-size:12px">-</span>'
                }</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="editPickPackPO('${p.id}')">Edit</button>
                  <button class="btn btn-sm" style="background:var(--success)" ${stockOk.ok?'':''} onclick="markPickPackPicked('${p.id}')">&#10003; Mark Picked</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deletePickPackPO('${p.id}')">Delete</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`
    }
  `;
}

function renderPickPackShipping(el, list) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Picked - Ready to Ship</h2>
      <span style="font-size:13px;color:var(--brown-light)">${list.length} order(s)</span>
    </div>
    <div class="help-text" style="margin-bottom:8px">Pick &amp; Pack orders that have been picked. Choose pallet (LTL) or parcel (UPS/FedEx/USPS) shipping, fill in the details, then mark shipped.</div>
    ${list.length === 0
      ? '<div class="empty">Nothing waiting to ship. Mark a PO as Picked from the Purchase Orders tab.</div>'
      : list.map(p => pickPackShippingCardHtml(p)).join('')
    }
  `;
}

function pickPackShippingCardHtml(p) {
  const cust = getCustomer(p.customerId);
  const mode = p.shippingMode || 'pallet';
  return `
    <div class="card" style="background:var(--beige-light);border-left:4px solid var(--orange);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0">${escapeHtml(p.id)} - ${escapeHtml(cust?.name||'')}</h3>
          <div style="font-size:12px;color:var(--brown-light)">PO# ${escapeHtml(p.poNumber||'-')} &middot; Picked ${fmtDate(p.pickedAt?.slice(0,10)||'')} &middot; Need by ${fmtDate(p.dateNeededToShip)}</div>
        </div>
      </div>
      <div style="display:flex;gap:14px;margin:12px 0;flex-wrap:wrap">
        <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Total Units</div>
          <div style="font-size:18px;font-weight:700;color:var(--brown)">${p.lines.reduce((s,l)=>s+(l.qty||0),0)}</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Line Items</div>
          <div style="font-size:18px;font-weight:700;color:var(--brown)">${p.lines.length}</div>
        </div>
      </div>
      <div style="margin:10px 0">
        <strong style="color:var(--brown);font-size:13px">Shipping Mode</strong>
        <div style="display:flex;gap:14px;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="radio" name="pp_mode_${p.id}" value="pallet" ${mode==='pallet'?'checked':''} onchange="togglePickPackMode('${p.id}','pallet')" /> Pallet (LTL)
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="radio" name="pp_mode_${p.id}" value="parcel" ${mode==='parcel'?'checked':''} onchange="togglePickPackMode('${p.id}','parcel')" /> Parcel (UPS / FedEx / USPS)
          </label>
        </div>
      </div>
      <div id="pp_mode_fields_${p.id}">${pickPackModeFieldsHtml(p, mode)}</div>
      <div class="form-row" style="margin-top:10px">
        <label>Notes</label>
        <textarea id="pp_sh_notes_${p.id}" placeholder="Special handling, delivery instructions, etc.">${escapeHtml(p.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="savePickPackShippingForm('${p.id}')">Save</button>
        <button class="btn" style="background:var(--success)" onclick="markPickPackShipped('${p.id}')">&#10003; Mark Shipped</button>
      </div>
    </div>
  `;
}

function pickPackModeFieldsHtml(p, mode) {
  if (mode === 'parcel') {
    return `
      <div class="form-grid">
        <div class="form-row"><label>Carrier</label>
          <select id="pp_carrier_${p.id}">
            ${PARCEL_CARRIERS.map(c => `<option ${p.parcelCarrier===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Tracking Number</label><input id="pp_tracking_${p.id}" value="${escapeHtml(p.trackingNumber||'')}" placeholder="e.g. 1Z999AA10123456784" /></div>
        <div class="form-row"><label>Package Weight (lb)</label><input type="number" step="0.1" id="pp_pkg_weight_${p.id}" value="${p.packageWeight||''}" /></div>
      </div>
    `;
  }
  return `
    <div class="form-grid">
      <div class="form-row"><label>Carrier</label><input id="pp_lcarrier_${p.id}" value="${escapeHtml(p.carrier||'')}" placeholder="LTL carrier name" /></div>
      <div class="form-row"><label># Pallets</label><input type="number" id="pp_pal_${p.id}" value="${p.pallets||''}" /></div>
      <div class="form-row"><label>Total Weight (lb)</label><input type="number" id="pp_wt_${p.id}" value="${p.weight||''}" /></div>
      <div class="form-row"><label>BOL #</label><input id="pp_bol_${p.id}" value="${escapeHtml(p.bol||'')}" /></div>
      <div class="form-row"><label>Length (in)</label><input type="number" id="pp_l_${p.id}" value="${p.length||''}" /></div>
      <div class="form-row"><label>Width (in)</label><input type="number" id="pp_w_${p.id}" value="${p.width||''}" /></div>
      <div class="form-row"><label>Height (in)</label><input type="number" id="pp_h_${p.id}" value="${p.height||''}" /></div>
    </div>
  `;
}
function togglePickPackMode(id, mode) {
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p) return;
  p.shippingMode = mode;
  saveState();
  document.getElementById('pp_mode_fields_'+id).innerHTML = pickPackModeFieldsHtml(p, mode);
}

function renderPickPackShipped(el, list) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Shipped Pick &amp; Pack Orders</h2>
      <button class="btn btn-secondary btn-sm" onclick="exportCsv('pickpack_shipped.csv', state.pickPackOrders.filter(p=>p.status==='shipped').map(p=>({id:p.id,distributor:getCustomer(p.customerId)?.name||'',po:p.poNumber||'',shipped:p.shippedAt?.slice(0,10)||'',mode:p.shippingMode||'',carrier:p.parcelCarrier||p.carrier||'',tracking:p.trackingNumber||'',bol:p.bol||'',pallets:p.pallets||0,weight:p.weight||p.packageWeight||0})))">Export CSV</button>
    </div>
    ${list.length === 0
      ? '<div class="empty">No shipped pick &amp; pack orders yet.</div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>PP #</th><th>Distributor</th><th>PO #</th><th>Shipped</th><th>Mode</th><th>Carrier</th><th>Tracking / BOL</th><th>Weight</th></tr></thead>
          <tbody>
          ${list.map(p => {
            const cust = getCustomer(p.customerId);
            const ref = p.shippingMode==='parcel' ? (p.trackingNumber||'-') : (p.bol||'-');
            return `<tr>
              <td><strong>${escapeHtml(p.id)}</strong></td>
              <td>${escapeHtml(cust?.name||'')}</td>
              <td><span class="pill">${escapeHtml(p.poNumber||'-')}</span></td>
              <td>${fmtDate(p.shippedAt?.slice(0,10)||'')}</td>
              <td>${p.shippingMode==='parcel' ? '<span class="badge badge-shipping">Parcel</span>' : '<span class="badge badge-supply">Pallet</span>'}</td>
              <td>${escapeHtml(p.parcelCarrier || p.carrier || '-')}</td>
              <td>${escapeHtml(ref)}</td>
              <td>${(p.weight || p.packageWeight) ? (p.weight || p.packageWeight) + ' lb' : '-'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table></div>`
    }
  `;
}

// New / Edit PP PO form
function newPickPackPO() {
  pickPackPoFormHtml(null);
}
function editPickPackPO(id) {
  pickPackPoFormHtml(id);
}
let editingPickPackLines = [];
function pickPackPoFormHtml(id) {
  const isNew = !id;
  const p = id
    ? state.pickPackOrders.find(x => x.id === id)
    : { id: nextPickPackId(), customerId: '', poNumber: '', dateSubmitted: new Date().toISOString().slice(0,10), dateNeededToShip: '', poFile: null, lines: [], status: 'open', notes: '' };
  editingPickPackLines = (p.lines || []).map(l => ({ ...l }));
  openModal((isNew?'New':'Edit')+' Pick & Pack PO', `
    <form onsubmit="event.preventDefault();savePickPackPO('${p.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>PP #</label><input id="pp_id" value="${escapeHtml(p.id)}" readonly /></div>
        <div class="form-row"><label>Distributor *</label>
          <select id="pp_customer" required onchange="rerenderPickPackLines()">
            <option value="">- Select -</option>
            ${pickPackCustomers().map(c => `<option value="${c.id}" ${p.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Customer PO #</label><input id="pp_po_num" value="${escapeHtml(p.poNumber||'')}" placeholder="Their PO reference" /></div>
        <div class="form-row"><label>Date Submitted</label><input type="date" id="pp_submitted" value="${p.dateSubmitted||''}" required /></div>
        <div class="form-row"><label>Date Needed to Ship</label><input type="date" id="pp_needed" value="${p.dateNeededToShip||''}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px">
        <label>Attach PO PDF</label>
        <div class="file-upload">
          <input type="file" id="pp_file" accept=".pdf,application/pdf,image/*" onchange="pickPackFileSelected(event)" />
          <div class="file-info ${p.poFile?'has':''}" id="pp_file_info">
            ${p.poFile ? `&#128206; ${escapeHtml(p.poFile.name)} (${Math.round(p.poFile.size/1024)} KB)` : 'No file attached. PDF preferred.'}
          </div>
          ${p.poFile ? `<button type="button" class="btn btn-icon btn-sm" onclick="clearPickPackFile()">Remove</button>` : ''}
        </div>
        <input type="hidden" id="pp_file_data" value='${p.poFile ? JSON.stringify(p.poFile).replace(/'/g, "&#039;") : ""}' />
      </div>
      <div style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="color:var(--brown);font-size:13px">Line Items (Finished Goods)</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addPickPackLine()">+ Add Item</button>
        </div>
        <div id="pp_lines" style="margin-top:6px"></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Notes</label>
        <textarea id="pp_notes">${escapeHtml(p.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Create PO':'Save Changes'}</button>
      </div>
    </form>
  `);
  rerenderPickPackLines();
}
function rerenderPickPackLines() {
  const cont = document.getElementById('pp_lines');
  if (!cont) return;
  const customerId = document.getElementById('pp_customer')?.value || '';
  const fgs = customerId ? finishedGoodsForCustomer(customerId) : [];
  // If a distributor is picked but has no finished goods, show a clear callout + shortcut
  if (customerId && fgs.length === 0) {
    const custName = getCustomer(customerId)?.name || 'this distributor';
    cont.innerHTML = `
      <div style="background:#fff5e8;border-left:3px solid var(--orange);border-radius:6px;padding:12px;font-size:13px;color:var(--brown)">
        <strong>No Finished Goods are linked to ${escapeHtml(custName)} yet.</strong>
        <div style="margin-top:4px;color:var(--brown-light);font-size:12px">Pick &amp; Pack pulls from Finished Goods inventory tagged to this distributor. Add a Finished Good for ${escapeHtml(custName)} to enable line items.</div>
        <button type="button" class="btn btn-sm" style="margin-top:8px" onclick="quickAddFinishedGood('${customerId}')">+ Add Finished Good for ${escapeHtml(custName)}</button>
      </div>`;
    return;
  }
  if (editingPickPackLines.length === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--brown-light);padding:6px 0">No line items. Click "+ Add Item" to add finished goods.</div>';
    return;
  }
  cont.innerHTML = `
    <div class="po-line" style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;grid-template-columns:2fr 1fr 1fr 1fr 40px">
      <div>Finished Good</div><div>Qty</div><div>On Hand</div><div>Status</div><div></div>
    </div>
    ${editingPickPackLines.map((l, i) => {
      const ing = state.ingredients.find(x => x.id === l.ingredientId);
      const stock = ing?.stock || 0;
      const ok = stock >= l.qty;
      const status = !l.ingredientId ? '-' : ok ? '<span class="badge badge-prod">OK</span>' : `<span class="badge badge-low">Short ${(l.qty - stock).toFixed(0)}</span>`;
      return `<div class="po-line" style="grid-template-columns:2fr 1fr 1fr 1fr 40px">
        <select onchange="pickPackLineProduct(${i}, this.value)">
          <option value="">- Select Finished Good -</option>
          ${fgs.length === 0
            ? `<option disabled>${customerId ? 'No finished goods linked to this distributor' : 'Pick a distributor first'}</option>`
            : fgs.map(f => `<option value="${f.id}" ${l.ingredientId===f.id?'selected':''}>${escapeHtml(f.name)}</option>`).join('')
          }
        </select>
        <input type="number" min="1" value="${l.qty||1}" onchange="pickPackLineQty(${i}, this.value)" />
        <div style="text-align:right;font-size:13px;color:var(--brown-light)">${stock}</div>
        <div style="text-align:center">${status}</div>
        <button type="button" onclick="removePickPackLine(${i})">&times;</button>
      </div>`;
    }).join('')}
  `;
}
// Quick-create a Finished Good for a pick-pack distributor without leaving the flow
function quickAddFinishedGood(customerId) {
  const cust = getCustomer(customerId);
  const name = prompt(`New Finished Good name for ${cust?.name||'distributor'}:`);
  if (!name || !name.trim()) return;
  const stockStr = prompt('Current units on hand:', '0');
  const stock = parseFloat(stockStr) || 0;
  const fg = {
    id: uid('i'),
    name: name.trim(),
    category: 'Finished Good',
    supplierId: '',
    customerId,
    stock,
    reorderLevel: 0,
    unit: 'ea',
    cost: 0,
    leadTimeDays: 0,
    building: '',
    location: ''
  };
  state.ingredients.push(fg);
  try { saveState(); } catch(e) { state.ingredients.pop(); toast('Storage full.'); return; }
  toast(`Added "${fg.name}" to Finished Goods.`);
  // make sure there's at least one line row to fill
  if (editingPickPackLines.length === 0) editingPickPackLines.push({ ingredientId: fg.id, qty: 1 });
  rerenderPickPackLines();
}
function addPickPackLine() {
  const customerId = document.getElementById('pp_customer')?.value || '';
  if (!customerId) { toast('Pick a distributor first.'); return; }
  if (finishedGoodsForCustomer(customerId).length === 0) { toast('No Finished Goods for this distributor yet - add one first.'); rerenderPickPackLines(); return; }
  editingPickPackLines.push({ ingredientId: '', qty: 1 });
  rerenderPickPackLines();
}
function removePickPackLine(idx) {
  editingPickPackLines.splice(idx, 1);
  rerenderPickPackLines();
}
function pickPackLineProduct(idx, value) {
  editingPickPackLines[idx].ingredientId = value;
  rerenderPickPackLines();
}
function pickPackLineQty(idx, value) {
  editingPickPackLines[idx].qty = parseInt(value, 10) || 0;
  rerenderPickPackLines();
}

function pickPackFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const data = { name: f.name, type: f.type, size: f.size, dataUrl: reader.result };
    document.getElementById('pp_file_data').value = JSON.stringify(data);
    const info = document.getElementById('pp_file_info');
    info.innerHTML = `&#128206; ${escapeHtml(f.name)} (${Math.round(f.size/1024)} KB)`;
    info.classList.add('has');
  };
  reader.readAsDataURL(f);
}
function clearPickPackFile() {
  document.getElementById('pp_file_data').value = '';
  document.getElementById('pp_file').value = '';
  const info = document.getElementById('pp_file_info');
  info.textContent = 'No file attached. PDF preferred.';
  info.classList.remove('has');
}

async function savePickPackPO(id, isNew) {
  const customerId = document.getElementById('pp_customer').value;
  if (!customerId) { toast('Distributor required.'); return; }
  const lines = editingPickPackLines.filter(l => l.ingredientId && l.qty > 0);
  if (lines.length === 0) { toast('Add at least one line item.'); return; }
  let poFile = null;
  const fileDataStr = document.getElementById('pp_file_data').value;
  if (fileDataStr) { try { poFile = JSON.parse(fileDataStr); } catch(e){} }
  const data = {
    id,
    customerId,
    poNumber: document.getElementById('pp_po_num').value,
    dateSubmitted: document.getElementById('pp_submitted').value,
    dateNeededToShip: document.getElementById('pp_needed').value,
    poFile,
    lines,
    notes: document.getElementById('pp_notes').value,
    status: 'open'
  };
  if (!requireEmployeeBackendWrite(backendPickPackState)) return;
  try {
    const existing = state.pickPackOrders.find(p => p.id === id);
    const savedOrder = { ...existing, ...data };
    const backendOrderId = savedOrder._backendId || '';
    if (backendOrderId) await updateBackendPickPackOrder(savedOrder);
    else await createBackendPickPackOrder(savedOrder);
    backendPickPackState.status = 'connected';
    backendPickPackState.lastError = '';
    pickPackTab = 'pos';
    closeModal();
    router('pick-pack');
    toast(isNew ? `${id} created in backend.` : `${id} saved in backend.`);
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendPickPackState);
    router('pick-pack');
    return;
  }
}

function pickPackStockCheck(p) {
  const short = [];
  (p.lines || []).forEach(l => {
    const ing = state.ingredients.find(x => x.id === l.ingredientId);
    const stock = ing?.stock || 0;
    if (stock < l.qty) {
      short.push({ item: ing?.name || '?', shortBy: (l.qty - stock).toFixed(0) });
    }
  });
  return { ok: short.length === 0, short };
}

async function markPickPackPicked(id) {
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p) return;
  if (pickPackBackendIsConnected() && p._backendId) {
    try {
      await markBackendPickPackPicked(p);
      backendPickPackState.status = 'connected';
      backendPickPackState.lastError = '';
      pickPackTab = 'shipping';
      router('pick-pack');
      toast(`${id} picked in backend. Inventory deducted, moved to Shipping.`);
      return;
    } catch (error) {
      if (isBackendShortStockWarning(error)) {
        const shortages = error?.envelope?.error?.details?.shortages || error?.details?.shortages || [];
        const summary = shortages.map(s => `${s.itemName || s.item || s.inventoryItemId || 'Item'}: short ${s.shortQuantity ?? Math.max(0, (Number(s.requestedQuantity || 0) - Number(s.availableQuantity || 0)))}`).join('\n');
        const ok = await openConfirmModal({
          title: 'Pick with short stock',
          record: id,
          message: 'This order is short on finished-goods stock. Mark it picked anyway?',
          risk: summary || 'Finished-goods stock is short on one or more lines.',
          confirmLabel: 'Mark Picked',
          tone: 'workflow'
        });
        if (!ok) return;
        try {
          await markBackendPickPackPicked(p, { confirmShortStock: true });
          backendPickPackState.status = 'connected';
          backendPickPackState.lastError = '';
          pickPackTab = 'shipping';
          router('pick-pack');
          toast(`${id} picked in backend. Inventory deducted, moved to Shipping.`);
          return;
        } catch (retryError) {
          error = retryError;
        }
      }
      failBackendRequiredWrite(error, backendPickPackState);
      router('pick-pack');
      return;
    }
  }
  failBackendRequiredWrite(null, backendPickPackState, 'Pick & Pack picking requires backend confirmation. Nothing was saved locally.');
}

async function savePickPackShippingForm(id) {
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p) return;
  const mode = p.shippingMode || 'pallet';
  if (mode === 'parcel') {
    p.parcelCarrier = document.getElementById('pp_carrier_'+id).value;
    p.trackingNumber = document.getElementById('pp_tracking_'+id).value;
    p.packageWeight = parseFloat(document.getElementById('pp_pkg_weight_'+id).value) || 0;
  } else {
    p.carrier = document.getElementById('pp_lcarrier_'+id).value;
    p.pallets = parseInt(document.getElementById('pp_pal_'+id).value, 10) || 0;
    p.weight = parseFloat(document.getElementById('pp_wt_'+id).value) || 0;
    p.bol = document.getElementById('pp_bol_'+id).value;
    p.length = parseFloat(document.getElementById('pp_l_'+id).value) || 0;
    p.width = parseFloat(document.getElementById('pp_w_'+id).value) || 0;
    p.height = parseFloat(document.getElementById('pp_h_'+id).value) || 0;
  }
  p.notes = document.getElementById('pp_sh_notes_'+id).value;
  if (!requireEmployeeBackendWrite(backendPickPackState)) return false;
  if (!p._backendId) {
    failBackendRequiredWrite(null, backendPickPackState, 'This Pick & Pack order is not backend-backed. Nothing was saved locally.');
    return false;
  }
  try {
    await saveBackendPickPackShippingDetails(p);
    backendPickPackState.status = 'connected';
    backendPickPackState.lastError = '';
    toast('Shipping info saved to backend.');
    return true;
  } catch (error) {
    failBackendRequiredWrite(error, backendPickPackState);
    return false;
  }
}
async function markPickPackShipped(id) {
  const saved = await savePickPackShippingForm(id);
  if (!saved) return;
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p) return;
  if (p.shippingMode === 'parcel' && !p.trackingNumber) {
    const ok = await openConfirmModal({
      title: 'Ship without tracking',
      record: id,
      message: 'No tracking number is entered. Mark this parcel shipped anyway?',
      risk: 'The order will move to Shipped without a tracking reference.',
      confirmLabel: 'Mark Shipped',
      tone: 'workflow'
    });
    if (!ok) return;
  }
  if (p.shippingMode !== 'parcel' && !p.bol && !p.carrier) {
    const ok = await openConfirmModal({
      title: 'Ship with missing details',
      record: id,
      message: 'No BOL or Carrier is entered. Mark this LTL shipment shipped anyway?',
      risk: 'The order will move to Shipped without complete freight details.',
      confirmLabel: 'Mark Shipped',
      tone: 'workflow'
    });
    if (!ok) return;
  }
  if (pickPackBackendIsConnected() && p._backendId) {
    try {
      await saveBackendPickPackShippingDetails(p);
      await markBackendPickPackShipped(p);
      backendPickPackState.status = 'connected';
      backendPickPackState.lastError = '';
      pickPackTab = 'shipped';
      router('pick-pack');
      toast(`${id} marked shipped in backend.`);
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendPickPackState);
      router('pick-pack');
      return;
    }
  }
  failBackendRequiredWrite(null, backendPickPackState, 'Pick & Pack shipping requires backend confirmation. Nothing was saved locally.');
}

async function deletePickPackPO(id) {
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p) return;
  const ok = await openConfirmModal({
    title: 'Cancel Pick & Pack PO',
    record: id,
    message: 'Cancel this Pick & Pack PO in the backend?',
    risk: 'Shipped Pick & Pack POs cannot be cancelled here.',
    confirmLabel: 'Cancel PO',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendPickPackState)) return;
  if (!p._backendId) return failBackendRequiredWrite(null, backendPickPackState, 'Pick & Pack PO cancellation requires backend confirmation. Nothing was saved locally.');
  try {
    await cancelBackendPickPackOrder(p);
    backendPickPackState.status = 'connected';
    backendPickPackState.lastError = '';
    saveState();
    router('pick-pack');
    toast(`${id} cancelled in backend.`);
  } catch (error) {
    failBackendRequiredWrite(error, backendPickPackState);
  }
}

function viewPickPackPoFile(id) {
  const p = state.pickPackOrders.find(x => x.id === id);
  if (!p?.poFile) return;
  const fileId = p.poFile._backendFileId || p.poFile.fileId;
  if (fileId) {
    previewBackendFile(fileId, p.poFile.name || 'pick-pack-po', p.poFile.type || '')
      .catch(error => toast(error?.message || 'PO file could not be opened.'));
    return;
  }
  if (p.poFile.dataUrl) {
    const w = window.open(p.poFile.dataUrl, '_blank');
    if (!w) toast('Popup blocked. Allow popups to view PO.');
  }
}

