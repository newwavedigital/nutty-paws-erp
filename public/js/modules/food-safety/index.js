/* =========================================================================
   FOOD SAFETY
   ========================================================================= */
let fsTab = 'complaints';
function setFsTab(t) { fsTab = t; renderFoodSafety(document.getElementById('content')); }

function renderFoodSafety(el) {
  if (!a10DataRecordState.foodSafety.loaded && !a10DataRecordState.foodSafety.loading) {
    refreshA10DataRecordModule('foodSafety').then(() => { if (currentPage === 'food-safety') router('food-safety'); }).catch(() => {});
  }
  const tabs = [
    { id: 'complaints', label: 'Complaints & Feedback', count: state.complaints.length },
    { id: 'lots', label: 'Lot Tracking', count: state.lots.length },
    { id: 'sanitation', label: 'Sanitation Logs', count: state.sanitationLogs.length },
    { id: 'swabs', label: 'Swab Records', count: (state.swabRecords||[]).length },
    { id: 'ccp', label: 'CCP / HACCP Logs', count: state.ccpLogs.length },
    { id: 'ncr', label: 'Non-Conformance / CAPA', count: state.ncrs.length },
    { id: 'recalls', label: 'Mock Recalls', count: state.recalls.length }
  ];
  el.innerHTML = `
    ${renderA10DataRecordBanner('foodSafety')}
    <div class="card">
      <div class="tabs">
        ${tabs.map(t => `<button class="tab ${fsTab===t.id?'active':''}" onclick="setFsTab('${t.id}')">${escapeHtml(t.label)} <span class="tab-count">${t.count}</span></button>`).join('')}
      </div>
      <div id="fsBody" style="margin-top:14px"></div>
    </div>
  `;
  const body = document.getElementById('fsBody');
  if (fsTab === 'complaints') renderFsComplaints(body);
  else if (fsTab === 'lots') renderFsLots(body);
  else if (fsTab === 'sanitation') renderFsSanitation(body);
  else if (fsTab === 'swabs') renderFsSwabs(body);
  else if (fsTab === 'ccp') renderFsCcp(body);
  else if (fsTab === 'ncr') renderFsNcr(body);
  else if (fsTab === 'recalls') renderFsRecalls(body);
}

/* ----- Swab Records (environmental monitoring) ----- */
const SWAB_ZONES = ['Zone 1 (food contact)', 'Zone 2 (near food contact)', 'Zone 3 (processing, non-contact)', 'Zone 4 (outside processing)'];
const SWAB_TYPES = ['ATP', 'Allergen', 'Micro / APC', 'Listeria (Lm)', 'Salmonella', 'Coliform / E. coli', 'Other'];
function renderFsSwabs(el) {
  const recs = (state.swabRecords||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  el.innerHTML = `
    <div class="card-header">
      <h2>Swab Records - Environmental Monitoring</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('swab_records.csv', state.swabRecords)">Export CSV</button>
        <button class="btn" onclick="editSwab()">+ New Swab</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Environmental monitoring swabs (ATP, allergen, micro, Listeria). SQF requires a zone-based program with corrective action and re-swab on any failure.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Location</th><th>Zone</th><th>Type</th><th>Result</th><th>Limit</th><th>Status</th><th>Swabbed By</th><th></th></tr></thead>
      <tbody>
        ${recs.length === 0 ? `<tr><td colspan="9" class="empty">No swab records yet.</td></tr>` :
          recs.map(s => `
            <tr>
              <td>${fmtDate(s.date)}</td>
              <td><strong>${escapeHtml(s.location||'')}</strong></td>
              <td style="font-size:12px">${escapeHtml((s.zone||'').split(' (')[0])}</td>
              <td>${escapeHtml(s.swabType||'')}</td>
              <td>${escapeHtml(s.result||'')}</td>
              <td style="font-size:12px;color:var(--brown-light)">${escapeHtml(s.limit||'')}</td>
              <td><span class="badge ${s.resultStatus==='Pass'?'badge-prod':'badge-low'}">${escapeHtml(s.resultStatus||'')}</span></td>
              <td style="font-size:12px">${escapeHtml(s.swabbedBy||'')}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editSwab('${s.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteSwab('${s.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editSwab(id) {
  const s = (state.swabRecords||[]).find(x=>x.id===id) || { id: uid('sw'), date: new Date().toISOString().slice(0,10), location:'', zone: SWAB_ZONES[0], swabType:'ATP', result:'', limit:'', resultStatus:'Pass', swabbedBy:'', correctiveAction:'', reswabResult:'', notes:'' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' Swab Record', `
    <form onsubmit="event.preventDefault();saveSwab('${s.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date</label><input type="date" id="sw_date" value="${s.date||''}" required /></div>
        <div class="form-row"><label>Location / Site</label><input id="sw_location" value="${escapeHtml(s.location||'')}" placeholder="e.g. Filler #1 nozzle, floor drain" required /></div>
        <div class="form-row"><label>Zone</label>
          <select id="sw_zone">${SWAB_ZONES.map(z=>`<option ${s.zone===z?'selected':''}>${escapeHtml(z)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Swab Type</label>
          <select id="sw_type">${SWAB_TYPES.map(t=>`<option ${s.swabType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Result</label><input id="sw_result" value="${escapeHtml(s.result||'')}" placeholder="e.g. 12 RLU / Negative / <10 CFU" /></div>
        <div class="form-row"><label>Limit / Threshold</label><input id="sw_limit" value="${escapeHtml(s.limit||'')}" placeholder="e.g. < 30 RLU / Negative" /></div>
        <div class="form-row"><label>Pass / Fail</label>
          <select id="sw_status"><option ${s.resultStatus==='Pass'?'selected':''}>Pass</option><option ${s.resultStatus==='Fail'?'selected':''}>Fail</option></select>
        </div>
        <div class="form-row"><label>Swabbed By</label><input id="sw_by" value="${escapeHtml(s.swabbedBy||'')}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Corrective Action (if Fail)</label>
        <textarea id="sw_corrective" rows="2" placeholder="Re-clean, re-sanitize, investigate source...">${escapeHtml(s.correctiveAction||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Re-Swab Result</label>
        <input id="sw_reswab" value="${escapeHtml(s.reswabResult||'')}" placeholder="Result after corrective action" />
      </div>
      <div class="form-row" style="margin-top:10px"><label>Notes</label>
        <textarea id="sw_notes">${escapeHtml(s.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Swab':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveSwab(id, isNew) {
  const data = {
    id,
    date: document.getElementById('sw_date').value,
    location: document.getElementById('sw_location').value,
    zone: document.getElementById('sw_zone').value,
    swabType: document.getElementById('sw_type').value,
    result: document.getElementById('sw_result').value,
    limit: document.getElementById('sw_limit').value,
    resultStatus: document.getElementById('sw_status').value,
    swabbedBy: document.getElementById('sw_by').value,
    correctiveAction: document.getElementById('sw_corrective').value,
    reswabResult: document.getElementById('sw_reswab').value,
    notes: document.getElementById('sw_notes').value
  };
  const existing = (state.swabRecords || []).find(s=>s.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'swab', { ...data, kind: 'swab' }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
    toast('Swab record saved.');
  } catch (err) {
    toast(err.message || 'Swab record could not be saved.');
  }
}
async function deleteSwab(id) {
  const ok = await openConfirmModal({ title: 'Delete swab record', record: id, message: 'Delete this swab record?', risk: 'This removes the local food-safety log row.', confirmLabel: 'Delete Record', tone: 'danger' });
  if (!ok) return;
  const row = (state.swabRecords || []).find(s=>s.id===id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Swab record could not be deleted.');
  }
}

/* ----- Complaints ----- */
function renderFsComplaints(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Customer Complaints & Feedback</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('complaints.csv', state.complaints.map(c=>({...c,customer:getCustomer(c.customerId)?.name||''})))">Export CSV</button>
        <button class="btn" onclick="editComplaint()">+ New Complaint</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Date</th><th>SKU</th><th>Customer</th><th>Lot #</th><th>Type</th><th>Severity</th><th>Summary</th><th></th>
      </tr></thead>
      <tbody>
        ${state.complaints.length === 0 ? `<tr><td colspan="8" class="empty">No complaints logged.</td></tr>` :
          state.complaints.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(c => `
            <tr>
              <td>${fmtDate(c.date)}</td>
              <td><strong>${escapeHtml(c.sku||'')}</strong></td>
              <td>${escapeHtml(getCustomer(c.customerId)?.name || '-')}</td>
              <td>${escapeHtml(c.lot||'')}</td>
              <td>${escapeHtml(c.type||'')}</td>
              <td><span class="badge ${c.severity==='High'?'sev-high':c.severity==='Medium'?'sev-med':'sev-low'}">${escapeHtml(c.severity||'')}</span></td>
              <td style="max-width:340px;font-size:12px">${escapeHtml(c.summary||'')}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editComplaint('${c.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteComplaint('${c.id}')">Delete</button>
              </td>
            </tr>
          `).join('')
        }
      </tbody>
    </table></div>
  `;
}
function editComplaint(id) {
  const c = state.complaints.find(x=>x.id===id) || { id: uid('cp'), date: new Date().toISOString().slice(0,10), sku:'', customerId:'', lot:'', type:'', severity:'Low', summary:'' };
  const isNew = !id;
  const types = ['Off Flavor','Foreign Material','Packaging Defect','Allergen Concern','Mislabel','Quality - Texture','Quality - Color','Other'];
  openModal((isNew?'New':'Edit')+' Complaint', `
    <form onsubmit="event.preventDefault();saveComplaint('${c.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date</label><input type="date" id="cp_date" value="${c.date}" required /></div>
        <div class="form-row"><label>SKU</label>
          <select id="cp_sku" required>
            <option value="">- Select -</option>
            ${state.products.map(p=>`<option value="${escapeHtml(p.sku)}" ${c.sku===p.sku?'selected':''}>${escapeHtml(p.sku)} - ${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Customer</label>
          <select id="cp_customer">
            <option value="">- Select -</option>
            ${state.customers.map(cu=>`<option value="${cu.id}" ${c.customerId===cu.id?'selected':''}>${escapeHtml(cu.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Lot #</label><input id="cp_lot" value="${escapeHtml(c.lot||'')}" placeholder="e.g. L26-0098" /></div>
        <div class="form-row"><label>Complaint Type</label>
          <select id="cp_type">
            ${types.map(t=>`<option ${c.type===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Severity</label>
          <select id="cp_severity">
            <option ${c.severity==='Low'?'selected':''}>Low</option>
            <option ${c.severity==='Medium'?'selected':''}>Medium</option>
            <option ${c.severity==='High'?'selected':''}>High</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Summary</label>
        <textarea id="cp_summary" rows="5" required>${escapeHtml(c.summary||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Complaint':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveComplaint(id, isNew) {
  const data = {
    id,
    date: document.getElementById('cp_date').value,
    sku: document.getElementById('cp_sku').value,
    customerId: document.getElementById('cp_customer').value,
    lot: document.getElementById('cp_lot').value,
    type: document.getElementById('cp_type').value,
    severity: document.getElementById('cp_severity').value,
    summary: document.getElementById('cp_summary').value
  };
  const existing = (state.complaints || []).find(c=>c.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'complaint', { ...data, kind: 'complaint', title: data.summary || data.type || 'Complaint' }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
    toast('Complaint saved.');
  } catch (err) {
    toast(err.message || 'Complaint could not be saved.');
  }
}
async function deleteComplaint(id) {
  const ok = await openConfirmModal({ title: 'Delete complaint', record: id, message: 'Delete this complaint record?', risk: 'This removes the local complaint row.', confirmLabel: 'Delete Complaint', tone: 'danger' });
  if (!ok) return;
  const row = (state.complaints || []).find(c => c.id === id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Complaint could not be deleted.');
  }
}

/* ----- Lot Tracking ----- */
function foodSafetyLotsAreBackendLocked() {
  return !!backendAuthState.token;
}

function foodSafetyLotsUnavailableMessage() {
  return 'Food Safety lot tracking is not backend-backed yet. Nothing was saved locally.';
}

function foodSafetyLotsNoticeHtml() {
  if (!foodSafetyLotsAreBackendLocked()) return '';
  return `<div class="inv-check" style="margin-bottom:8px"><strong>Lot Tracking is read-only for signed-in sessions.</strong> This screen is not connected to a backend lot-tracking workflow yet, so create, edit, and delete controls are disabled until that exists.</div>`;
}

function renderFsLots(el) {
  const signedInLocked = foodSafetyLotsAreBackendLocked();
  el.innerHTML = `
    <div class="card-header">
      <h2>Lot Tracking</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('lots.csv', state.lots.map(l=>({...l,product:getProduct(l.productId)?.name||''})))">Export CSV</button>
        <button class="btn" onclick="editLot()" ${signedInLocked ? 'disabled title="Backend lot tracking workflow not connected yet"' : ''}>+ New Lot</button>
      </div>
    </div>
    ${foodSafetyLotsNoticeHtml()}
    <div class="help-text" style="margin-bottom:8px">Track every production lot for traceability. SQF requires forward and backward lot trace within 4 hours.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Lot #</th><th>Product</th><th>PO</th><th>Production Date</th><th>Qty</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.lots.length === 0 ? `<tr><td colspan="7" class="empty">No lots logged.</td></tr>` :
          state.lots.slice().sort((a,b)=>b.productionDate.localeCompare(a.productionDate)).map(l => `
            <tr>
              <td><strong>${escapeHtml(l.lotNumber)}</strong></td>
              <td>${escapeHtml(getProduct(l.productId)?.name || '-')}</td>
              <td>${escapeHtml(l.poId||'-')}</td>
              <td>${fmtDate(l.productionDate)}</td>
              <td>${l.quantity}</td>
              <td><span class="badge ${l.status==='Released'?'badge-prod':l.status==='Hold'?'badge-pending':'badge-low'}">${escapeHtml(l.status||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editLot('${l.id}')" ${signedInLocked ? 'disabled title="Backend lot tracking workflow not connected yet"' : ''}>Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteLot('${l.id}')" ${signedInLocked ? 'disabled title="Backend lot tracking workflow not connected yet"' : ''}>Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editLot(id) {
  if (foodSafetyLotsAreBackendLocked()) {
    failBackendRequiredWrite(null, a10DataRecordState.foodSafety, foodSafetyLotsUnavailableMessage());
    return;
  }
  const l = state.lots.find(x=>x.id===id) || { id: uid('lt'), lotNumber:'', productId:'', poId:'', productionDate: new Date().toISOString().slice(0,10), quantity: 0, status: 'Released' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' Lot', `
    <form onsubmit="event.preventDefault();saveLot('${l.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Lot #</label><input id="lt_num" value="${escapeHtml(l.lotNumber)}" required /></div>
        <div class="form-row"><label>Product</label>
          <select id="lt_product" required>
            <option value="">- Select -</option>
            ${state.products.map(p=>`<option value="${p.id}" ${l.productId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>PO #</label>
          <select id="lt_po">
            <option value="">- None -</option>
            ${state.purchaseOrders.map(p=>`<option value="${escapeHtml(p.id)}" ${l.poId===p.id?'selected':''}>${escapeHtml(p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Production Date</label><input type="date" id="lt_date" value="${l.productionDate}" required /></div>
        <div class="form-row"><label>Quantity</label><input type="number" id="lt_qty" value="${l.quantity}" /></div>
        <div class="form-row"><label>Status</label>
          <select id="lt_status">
            <option ${l.status==='Released'?'selected':''}>Released</option>
            <option ${l.status==='Hold'?'selected':''}>Hold</option>
            <option ${l.status==='Quarantined'?'selected':''}>Quarantined</option>
            <option ${l.status==='Recalled'?'selected':''}>Recalled</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Lot':'Save Changes'}</button>
      </div>
    </form>
  `);
}
function saveLot(id, isNew) {
  if (foodSafetyLotsAreBackendLocked()) {
    failBackendRequiredWrite(null, a10DataRecordState.foodSafety, foodSafetyLotsUnavailableMessage());
    return;
  }
  const data = {
    id,
    lotNumber: document.getElementById('lt_num').value,
    productId: document.getElementById('lt_product').value,
    poId: document.getElementById('lt_po').value,
    productionDate: document.getElementById('lt_date').value,
    quantity: parseInt(document.getElementById('lt_qty').value, 10) || 0,
    status: document.getElementById('lt_status').value
  };
  if (isNew) state.lots.push(data);
  else Object.assign(state.lots.find(l=>l.id===id), data);
  saveState();
  closeModal();
  renderFoodSafety(document.getElementById('content'));
}
async function deleteLot(id) {
  if (foodSafetyLotsAreBackendLocked()) {
    failBackendRequiredWrite(null, a10DataRecordState.foodSafety, foodSafetyLotsUnavailableMessage());
    return;
  }
  const lot = state.lots.find(l => l.id === id);
  const ok = await openConfirmModal({ title: 'Delete lot', record: lot?.lotNumber || id, message: 'Delete this lot record?', risk: 'This removes the local lot-tracking row.', confirmLabel: 'Delete Lot', tone: 'danger' });
  if (!ok) return;
  state.lots = state.lots.filter(l => l.id !== id);
  saveState();
  renderFoodSafety(document.getElementById('content'));
}

/* ----- Sanitation ----- */
function renderFsSanitation(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Sanitation Logs</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('sanitation_logs.csv', state.sanitationLogs)">Export CSV</button>
        <button class="btn" onclick="editSanitation()">+ New Log Entry</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Pre-op, post-op, and mid-shift cleaning verifications. Required for SQF Module 11.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Area</th><th>Cleaned By</th><th>Verified By</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${state.sanitationLogs.length === 0 ? `<tr><td colspan="6" class="empty">No sanitation logs.</td></tr>` :
          state.sanitationLogs.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s => `
            <tr>
              <td>${fmtDate(s.date)}</td>
              <td>${escapeHtml(s.area||'')}</td>
              <td>${escapeHtml(s.cleanedBy||'')}</td>
              <td>${escapeHtml(s.verifiedBy||'')}</td>
              <td style="font-size:12px;max-width:340px">${escapeHtml(s.notes||'')}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editSanitation('${s.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteSanitation('${s.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editSanitation(id) {
  const s = state.sanitationLogs.find(x=>x.id===id) || { id: uid('sn'), date: new Date().toISOString().slice(0,10), area:'', cleanedBy:'', verifiedBy:'', notes:'' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' Sanitation Log', `
    <form onsubmit="event.preventDefault();saveSanitation('${s.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date</label><input type="date" id="sn_date" value="${s.date}" required /></div>
        <div class="form-row"><label>Area / Room</label>
          <select id="sn_area">
            ${ROOMS.map(r=>`<option ${s.area===r?'selected':''}>${r}</option>`).join('')}
            <option ${s.area==='Warehouse'?'selected':''}>Warehouse</option>
            <option ${s.area==='Restrooms'?'selected':''}>Restrooms</option>
            <option ${s.area==='Common Areas'?'selected':''}>Common Areas</option>
          </select>
        </div>
        <div class="form-row"><label>Cleaned By</label><input id="sn_clean" value="${escapeHtml(s.cleanedBy||'')}" /></div>
        <div class="form-row"><label>Verified By</label><input id="sn_ver" value="${escapeHtml(s.verifiedBy||'')}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Notes / ATP Results</label>
        <textarea id="sn_notes">${escapeHtml(s.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Entry':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveSanitation(id, isNew) {
  const data = {
    id,
    date: document.getElementById('sn_date').value,
    area: document.getElementById('sn_area').value,
    cleanedBy: document.getElementById('sn_clean').value,
    verifiedBy: document.getElementById('sn_ver').value,
    notes: document.getElementById('sn_notes').value
  };
  const existing = (state.sanitationLogs || []).find(s=>s.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'sanitation', { ...data, kind: 'sanitation', title: `${data.area || 'Sanitation'} ${data.date || ''}`.trim() }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Sanitation log could not be saved.');
  }
}
async function deleteSanitation(id) {
  const ok = await openConfirmModal({ title: 'Delete sanitation log', record: id, message: 'Delete this sanitation log entry?', risk: 'This removes the local sanitation log row.', confirmLabel: 'Delete Log', tone: 'danger' });
  if (!ok) return;
  const row = (state.sanitationLogs || []).find(s => s.id === id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Sanitation log could not be deleted.');
  }
}

/* ----- CCP / HACCP ----- */
function renderFsCcp(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>CCP / HACCP Monitoring</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('ccp_logs.csv', state.ccpLogs)">Export CSV</button>
        <button class="btn" onclick="editCcp()">+ New CCP Log</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Critical Control Point monitoring (e.g. roaster temp, metal detector, sealer temp). Required for SQF Module 2.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>CCP / Step</th><th>Critical Limit</th><th>Measured</th><th>Result</th><th>Corrective Action</th><th></th></tr></thead>
      <tbody>
        ${state.ccpLogs.length === 0 ? `<tr><td colspan="7" class="empty">No CCP logs.</td></tr>` :
          state.ccpLogs.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(c => `
            <tr>
              <td>${fmtDate(c.date)}</td>
              <td>${escapeHtml(c.step||'')}</td>
              <td>${escapeHtml(c.criticalLimit||'')}</td>
              <td>${escapeHtml(c.measured||'')}</td>
              <td><span class="badge ${c.result==='Pass'?'badge-prod':'badge-low'}">${escapeHtml(c.result||'')}</span></td>
              <td style="font-size:12px;max-width:300px">${escapeHtml(c.correctiveAction||'')}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editCcp('${c.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteCcp('${c.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editCcp(id) {
  const c = state.ccpLogs.find(x=>x.id===id) || { id: uid('cc'), date: new Date().toISOString().slice(0,10), step:'', criticalLimit:'', measured:'', result:'Pass', correctiveAction:'' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' CCP Log', `
    <form onsubmit="event.preventDefault();saveCcp('${c.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date</label><input type="date" id="cc_date" value="${c.date}" required /></div>
        <div class="form-row"><label>CCP / Step</label>
          <select id="cc_step">
            <option ${c.step==='Roaster'?'selected':''}>Roaster</option>
            <option ${c.step==='Metal Detector'?'selected':''}>Metal Detector</option>
            <option ${c.step==='Sealer Temp'?'selected':''}>Sealer Temp</option>
            <option ${c.step==='Cold Storage'?'selected':''}>Cold Storage</option>
            <option ${c.step==='Allergen Changeover'?'selected':''}>Allergen Changeover</option>
            <option ${c.step==='Other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="form-row"><label>Critical Limit</label><input id="cc_lim" value="${escapeHtml(c.criticalLimit||'')}" /></div>
        <div class="form-row"><label>Measured Value</label><input id="cc_val" value="${escapeHtml(c.measured||'')}" /></div>
        <div class="form-row"><label>Result</label>
          <select id="cc_result">
            <option ${c.result==='Pass'?'selected':''}>Pass</option>
            <option ${c.result==='Fail'?'selected':''}>Fail</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Corrective Action (if Fail)</label>
        <textarea id="cc_corr">${escapeHtml(c.correctiveAction||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log CCP':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveCcp(id, isNew) {
  const data = {
    id,
    date: document.getElementById('cc_date').value,
    step: document.getElementById('cc_step').value,
    criticalLimit: document.getElementById('cc_lim').value,
    measured: document.getElementById('cc_val').value,
    result: document.getElementById('cc_result').value,
    correctiveAction: document.getElementById('cc_corr').value
  };
  const existing = (state.ccpLogs || []).find(c=>c.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'ccp', { ...data, kind: 'ccp', title: `${data.step || 'CCP'} ${data.date || ''}`.trim() }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'CCP log could not be saved.');
  }
}
async function deleteCcp(id) {
  const ok = await openConfirmModal({ title: 'Delete CCP log', record: id, message: 'Delete this CCP / HACCP log entry?', risk: 'This removes the local CCP log row.', confirmLabel: 'Delete Log', tone: 'danger' });
  if (!ok) return;
  const row = (state.ccpLogs || []).find(c => c.id === id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'CCP log could not be deleted.');
  }
}

/* ----- Non-Conformance / CAPA ----- */
function renderFsNcr(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Non-Conformance &amp; Corrective Action</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('ncrs.csv', state.ncrs)">Export CSV</button>
        <button class="btn" onclick="editNcr()">+ New NCR</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Track every non-conformance through root cause and corrective action. Required for SQF Module 2.5.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Issue</th><th>Root Cause</th><th>Corrective Action</th><th>Owner</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.ncrs.length === 0 ? `<tr><td colspan="7" class="empty">No non-conformances logged.</td></tr>` :
          state.ncrs.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(n => `
            <tr>
              <td>${fmtDate(n.date)}</td>
              <td style="font-size:12px;max-width:240px">${escapeHtml(n.issue||'')}</td>
              <td style="font-size:12px;max-width:200px">${escapeHtml(n.rootCause||'')}</td>
              <td style="font-size:12px;max-width:240px">${escapeHtml(n.correctiveAction||'')}</td>
              <td>${escapeHtml(n.owner||'')}</td>
              <td><span class="badge ${n.status==='Closed'?'badge-prod':n.status==='Open'?'badge-low':'badge-pending'}">${escapeHtml(n.status||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editNcr('${n.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteNcr('${n.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editNcr(id) {
  const n = state.ncrs.find(x=>x.id===id) || { id: uid('nc'), date: new Date().toISOString().slice(0,10), issue:'', rootCause:'', correctiveAction:'', owner:'', status:'Open' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' Non-Conformance', `
    <form onsubmit="event.preventDefault();saveNcr('${n.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date</label><input type="date" id="nc_date" value="${n.date}" required /></div>
        <div class="form-row"><label>Owner</label><input id="nc_owner" value="${escapeHtml(n.owner||'')}" /></div>
        <div class="form-row"><label>Status</label>
          <select id="nc_status">
            <option ${n.status==='Open'?'selected':''}>Open</option>
            <option ${n.status==='In Progress'?'selected':''}>In Progress</option>
            <option ${n.status==='Closed'?'selected':''}>Closed</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Issue Description</label>
        <textarea id="nc_issue" required>${escapeHtml(n.issue||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Root Cause</label>
        <textarea id="nc_rc">${escapeHtml(n.rootCause||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Corrective Action</label>
        <textarea id="nc_ca">${escapeHtml(n.correctiveAction||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log NCR':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveNcr(id, isNew) {
  const data = {
    id,
    date: document.getElementById('nc_date').value,
    issue: document.getElementById('nc_issue').value,
    rootCause: document.getElementById('nc_rc').value,
    correctiveAction: document.getElementById('nc_ca').value,
    owner: document.getElementById('nc_owner').value,
    status: document.getElementById('nc_status').value
  };
  const existing = (state.ncrs || []).find(n=>n.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'ncr', { ...data, kind: 'ncr', title: data.issue || 'Non-Conformance' }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'NCR could not be saved.');
  }
}
async function deleteNcr(id) {
  const ok = await openConfirmModal({ title: 'Delete NCR', record: id, message: 'Delete this non-conformance / CAPA record?', risk: 'This removes the local NCR row.', confirmLabel: 'Delete NCR', tone: 'danger' });
  if (!ok) return;
  const row = (state.ncrs || []).find(n => n.id === id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'NCR could not be deleted.');
  }
}

/* ----- Mock Recalls ----- */
function renderFsRecalls(el) {
  el.innerHTML = `
    <div class="card-header">
      <h2>Mock Recall Exercises</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('mock_recalls.csv', state.recalls.map(r=>({...r,product:getProduct(r.productId)?.name||''})))">Export CSV</button>
        <button class="btn" onclick="editRecall()">+ New Mock Recall</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">SQF requires at least one mock recall per year. Goal: trace forward + backward in &lt; 4 hours with 100% accuracy.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Lot</th><th>Product</th><th>Distribution Trace</th><th>Time (min)</th><th>Result</th><th></th></tr></thead>
      <tbody>
        ${state.recalls.length === 0 ? `<tr><td colspan="7" class="empty">No mock recalls logged.</td></tr>` :
          state.recalls.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r => `
            <tr>
              <td>${fmtDate(r.date)}</td>
              <td>${escapeHtml(r.lot||'')}</td>
              <td>${escapeHtml(getProduct(r.productId)?.name||'-')}</td>
              <td style="font-size:12px;max-width:280px">${escapeHtml(r.distributionTrace||'')}</td>
              <td>${r.timeMinutes||0}</td>
              <td><span class="badge ${r.result==='Pass'?'badge-prod':'badge-low'}">${escapeHtml(r.result||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editRecall('${r.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteRecall('${r.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editRecall(id) {
  const r = state.recalls.find(x=>x.id===id) || { id: uid('rc'), date: new Date().toISOString().slice(0,10), lot:'', productId:'', distributionTrace:'', timeMinutes: 0, result: 'Pass' };
  const isNew = !id;
  openModal((isNew?'New':'Edit')+' Mock Recall', `
    <form onsubmit="event.preventDefault();saveRecall('${r.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Exercise Date</label><input type="date" id="rc_date" value="${r.date}" required /></div>
        <div class="form-row"><label>Lot #</label><input id="rc_lot" value="${escapeHtml(r.lot||'')}" required /></div>
        <div class="form-row"><label>Product</label>
          <select id="rc_product">
            <option value="">- Select -</option>
            ${state.products.map(p=>`<option value="${p.id}" ${r.productId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Time to Complete (minutes)</label><input type="number" id="rc_time" value="${r.timeMinutes||0}" /></div>
        <div class="form-row"><label>Result</label>
          <select id="rc_result">
            <option ${r.result==='Pass'?'selected':''}>Pass</option>
            <option ${r.result==='Fail'?'selected':''}>Fail</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Distribution Trace (customers, cases, dates)</label>
        <textarea id="rc_dist" rows="4">${escapeHtml(r.distributionTrace||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Recall':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveRecall(id, isNew) {
  const data = {
    id,
    date: document.getElementById('rc_date').value,
    lot: document.getElementById('rc_lot').value,
    productId: document.getElementById('rc_product').value,
    distributionTrace: document.getElementById('rc_dist').value,
    timeMinutes: parseInt(document.getElementById('rc_time').value, 10) || 0,
    result: document.getElementById('rc_result').value
  };
  const existing = (state.recalls || []).find(r=>r.id===id);
  try {
    await saveA10DataRecord('foodSafety', 'recall', { ...data, kind: 'recall', title: data.lot || 'Mock Recall' }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Mock recall could not be saved.');
  }
}
async function deleteRecall(id) {
  const ok = await openConfirmModal({ title: 'Delete mock recall', record: id, message: 'Delete this mock recall record?', risk: 'This removes the local mock recall row.', confirmLabel: 'Delete Recall', tone: 'danger' });
  if (!ok) return;
  const row = (state.recalls || []).find(r => r.id === id);
  try {
    await archiveA10DataRecord('foodSafety', row?._backendId || id);
    renderFoodSafety(document.getElementById('content'));
  } catch (err) {
    toast(err.message || 'Mock recall could not be deleted.');
  }
}

