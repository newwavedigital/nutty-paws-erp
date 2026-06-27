/* =========================================================================
   RESEARCH & DEVELOPMENT
   - Submit a request (Customer, Packaging Type, Units Requested, Product Description)
   - Queue tab lists active requests, Completed tab lists finished ones
   - Each request supports working Notes (during R&D) and post-Production Comments
   - "Mark Complete" moves a request to the Completed tab
   ========================================================================= */
let rdTab = 'Queue';
function setRdTab(t) { rdTab = t; renderRD(document.getElementById('content')); }

function nextRdId() {
  let maxNum = 0;
  (state.rdRequests || []).forEach(r => {
    const m = (r.rdId || '').match(/RD-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  return 'RD-' + String(maxNum + 1).padStart(4, '0');
}

function rdTabsHtml() {
  const qN = (state.rdRequests || []).filter(r => r.status !== 'completed' && r.status !== 'archived').length;
  const cN = (state.rdRequests || []).filter(r => r.status === 'completed').length;
  return `<div class="tabs" style="margin-bottom:14px">
    <button class="tab ${rdTab==='Queue'?'active':''}" onclick="setRdTab('Queue')">Queue <span class="tab-count">${qN}</span></button>
    <button class="tab ${rdTab==='Completed'?'active':''}" onclick="setRdTab('Completed')">Completed <span class="tab-count">${cN}</span></button>
  </div>`;
}

function renderRD(el) {
  if (researchBackendCanAccess() && !backendResearchState.loaded && !backendResearchState.loading) {
    loadBackendResearch().then(() => {
      if (currentPage === 'rd') renderRD(document.getElementById('content'));
    }).catch(() => {});
  }
  const isCompleted = rdTab === 'Completed';
  const list = (state.rdRequests || [])
    .filter(r => r.status !== 'archived' && (isCompleted ? r.status === 'completed' : r.status !== 'completed'))
    .slice()
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Research &amp; Development</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('rd_requests.csv', (state.rdRequests||[]).map(r=>({rd_id:r.rdId,customer:getCustomer(r.customerId)?.name||'',packaging:r.packagingType,units:r.unitsRequested,description:r.productDescription,status:r.status,submitted:(r.submittedAt||'').slice(0,10),completed:(r.completedAt||'').slice(0,10)})))">Export CSV</button>
          <button class="btn" onclick="editRdRequest()">+ New R&amp;D Request</button>
        </div>
      </div>
      <div style="background:var(--beige-light);padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:12px;color:var(--brown)">
        Submit a product or packaging concept for R&amp;D. Active requests sit in the <strong>Queue</strong> tab; mark complete to move them to <strong>Completed</strong>. Archived requests stay hidden until reopened. Each request supports working <strong>Notes</strong> (during R&amp;D) and post-production <strong>Comments</strong>.
      </div>
      ${renderBackendResearchBanner()}
      ${rdTabsHtml()}
      ${list.length === 0
        ? `<div class="empty">${isCompleted ? 'No completed R&D requests yet.' : 'No active R&D requests. Click "+ New R&D Request" to add one.'}</div>`
        : list.map(r => rdCardHtml(r, isCompleted)).join('')
      }
    </div>
  `;
}

function rdCardHtml(r, isCompleted) {
  const cust = getCustomer(r.customerId);
  const submitted = r.submittedAt ? fmtDate(r.submittedAt.slice(0,10)) : '-';
  const completed = r.completedAt ? fmtDate(r.completedAt.slice(0,10)) : '';
  const statusBadge = r.status === 'archived'
    ? `<span class="badge badge-complete">Archived</span>`
    : isCompleted
      ? `<span class="badge badge-prod">Completed</span>`
      : `<span class="badge badge-pending">In Queue</span>`;
  const notes = (r.notes || []).slice().sort((a,b) => (a.ts||'').localeCompare(b.ts||''));
  const comments = (r.comments || []).slice().sort((a,b) => (a.ts||'').localeCompare(b.ts||''));

  return `
    <div style="border:1px solid var(--grey-light);border-radius:8px;padding:14px;margin-bottom:14px;background:var(--white)">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-weight:700;color:var(--brown)">${escapeHtml(r.rdId||r.requestId||r.id||'')} &middot; ${escapeHtml(cust?.name || '-')}</div>
          <div style="font-size:12px;color:var(--brown-light);margin-top:2px">
            Submitted ${submitted}${completed ? ' &middot; Completed ' + completed : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${statusBadge}
          <button class="btn btn-icon btn-sm" onclick="editRdRequest('${r.id}')">Edit</button>
          ${isCompleted
            ? `<button class="btn btn-icon btn-sm" onclick="reopenRdRequest('${r.id}')">Reopen</button>`
            : `<button class="btn btn-sm" onclick="completeRdRequest('${r.id}')">Mark Complete</button>`
          }
          <button class="btn btn-icon btn-sm" onclick="archiveRdRequest('${r.id}')">Archive</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;background:var(--beige-light);padding:10px;border-radius:6px;margin-bottom:12px">
        <div><div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Packaging Type</div><div style="font-weight:600">${escapeHtml(r.packagingType || '-')}</div></div>
        <div><div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Units Requested</div><div style="font-weight:600">${escapeHtml(String(r.unitsRequested ?? '-'))}</div></div>
        <div><div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Status</div><div style="font-weight:600">${escapeHtml((r.status || 'queue').replace(/_/g, ' '))}</div></div>
      </div>

      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;margin-bottom:4px">Product Description</div>
        <div style="white-space:pre-wrap;font-size:14px;color:var(--black);background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 10px">${escapeHtml(r.productDescription || '-')}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;margin-bottom:6px">Notes (during R&amp;D)</div>
          <div style="min-height:30px;margin-bottom:8px">
            ${notes.length === 0
              ? '<div style="font-size:12px;color:var(--brown-light)">No notes yet.</div>'
              : notes.map(n => `
                  <div style="background:var(--beige-light);border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px">
                    <div style="font-size:10px;color:var(--brown-light)">${fmtDateTime(n.ts)}${n.author ? ` &middot; ${escapeHtml(n.author)}` : ''}</div>
                    <div style="white-space:pre-wrap">${escapeHtml(n.text||'')}</div>
                  </div>`).join('')
            }
          </div>
          <div style="display:flex;gap:6px">
            <input id="rd_note_${r.id}" type="text" placeholder="Add a note..." style="flex:1" />
            <button class="btn btn-secondary btn-sm" onclick="addRdNote('${r.id}')">Add Note</button>
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;margin-bottom:6px">Post-Production Comments</div>
          <div style="min-height:30px;margin-bottom:8px">
            ${comments.length === 0
              ? '<div style="font-size:12px;color:var(--brown-light)">No comments yet.</div>'
              : comments.map(c => `
                  <div style="background:#f4f1ea;border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px">
                    <div style="font-size:10px;color:var(--brown-light)">${fmtDateTime(c.ts)}${c.author ? ` &middot; ${escapeHtml(c.author)}` : ''}</div>
                    <div style="white-space:pre-wrap">${escapeHtml(c.text||'')}</div>
                  </div>`).join('')
            }
          </div>
          <div style="display:flex;gap:6px">
            <input id="rd_cmt_${r.id}" type="text" placeholder="Add a comment..." style="flex:1" />
            <button class="btn btn-secondary btn-sm" onclick="addRdComment('${r.id}')">Add Comment</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function editRdRequest(id) {
  const isNew = !id;
  const newRdId = isNew ? nextRdId() : '';
  const localRequest = isNew
    ? { id: newRdId, requestId: newRdId, rdId: newRdId, customerId: '', packagingType: '', unitsRequested: '', productDescription: '', submittedAt: new Date().toISOString(), status: 'queue', notes: [], comments: [], completedAt: null, archivedAt: null }
    : (state.rdRequests || []).find(x => x.id === id);
  if (!localRequest) return;
  let r = localRequest;
  if (!isNew && researchBackendIsConnected()) {
    const requestId = researchRequestBackendId(localRequest);
    if (requestId) {
      try {
        await loadBackendResearchRequest(requestId);
        r = (state.rdRequests || []).find(x => x._backendId === requestId || x.id === requestId || x.rdId === requestId || x.requestId === requestId) || localRequest;
      } catch (error) {
        backendResearchState.status = 'error';
        backendResearchState.lastError = 'Research request details are unavailable right now, so the local demo record remains editable.';
      }
    }
  }
  const custOpts = state.customers.map(c => `<option value="${c.id}" ${c.id===r.customerId?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
  const pkgSuggest = ['8oz jar','16oz jar','Squeeze pouch 1.15oz','Squeeze pouch 32oz','Tub','Stick pack','Bulk pail','Bag-in-box','Other'];
  const datalistOpts = pkgSuggest.map(p => `<option value="${escapeHtml(p)}">`).join('');
  openModal(isNew ? `New R&D Request - ${r.rdId}` : `Edit ${r.rdId}`, `
    <div class="form-grid">
      <div class="form-row">
        <label>R&amp;D ID</label>
        <input type="text" value="${escapeHtml(r.rdId)}" disabled />
      </div>
      <div class="form-row">
        <label>Customer</label>
        <select id="rd_customer">
          <option value="">- Pick a customer -</option>
          ${custOpts}
        </select>
      </div>
      <div class="form-row">
        <label>Packaging Type</label>
        <input type="text" id="rd_packaging" list="rd_pkg_list" value="${escapeHtml(r.packagingType||'')}" placeholder="e.g. 8oz jar, squeeze pouch, tub..." />
        <datalist id="rd_pkg_list">${datalistOpts}</datalist>
      </div>
      <div class="form-row">
        <label>Units Requested</label>
        <input type="number" id="rd_units" min="0" step="1" value="${escapeHtml(String(r.unitsRequested ?? ''))}" />
      </div>
      <div class="form-row">
        <label>Product Description</label>
        <textarea id="rd_desc" rows="5" placeholder="Describe the product concept, formulation goals, target attributes...">${escapeHtml(r.productDescription||'')}</textarea>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveRdRequest('${r.id}', ${isNew})">${isNew ? 'Submit Request' : 'Save Changes'}</button>
    </div>
  `);
}

async function saveRdRequest(id, isNew) {
  const customerId = document.getElementById('rd_customer').value;
  if (!customerId) { toast('Customer is required.'); return; }
  const packagingType = (document.getElementById('rd_packaging').value || '').trim();
  if (!packagingType) { toast('Packaging Type is required.'); return; }
  const unitsRaw = document.getElementById('rd_units').value;
  const unitsRequested = unitsRaw === '' ? '' : parseInt(unitsRaw, 10);
  if (unitsRaw === '' || isNaN(unitsRequested) || unitsRequested <= 0) { toast('Units Requested must be greater than 0.'); return; }
  const productDescription = (document.getElementById('rd_desc').value || '').trim();
  if (!productDescription) { toast('Product Description is required.'); return; }

  const current = (state.rdRequests || []).find(x => x.id === id) || {};
  const rdId = isNew ? nextRdId() : (current.rdId || current.requestId || current.id || id);
  const requestId = current.requestId || rdId;
  const data = {
    id: isNew ? rdId : id,
    requestId,
    rdId,
    customerId,
    packagingType,
    unitsRequested,
    productDescription,
    submittedAt: current.submittedAt || new Date().toISOString(),
    status: current.status || 'queue',
    notes: current.notes || [],
    comments: current.comments || [],
    completedAt: current.completedAt || null,
    archivedAt: current.archivedAt || null
  };

  if (!requireEmployeeBackendWrite(backendResearchState)) return;
  try {
    if (isNew) await createBackendResearchRequest(data);
    else await updateBackendResearchRequest(data);
    backendResearchState.status = 'connected';
    backendResearchState.lastError = '';
    backendResearchState.loaded = false;
    closeModal();
    rdTab = 'Queue';
    router('rd');
    toast(isNew ? 'R&D request submitted to backend.' : 'R&D request updated in backend.');
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendResearchState);
    rdTab = 'Queue';
    router('rd');
    return;
  }
}

async function addRdNote(id) {
  const inp = document.getElementById('rd_note_'+id);
  const text = (inp?.value || '').trim();
  if (!text) { toast('Type a note first.'); return; }
  const r = (state.rdRequests || []).find(x => x.id === id);
  if (!r) return;
  if (researchBackendIsConnected() && researchRequestBackendId(r)) {
    try {
      await addBackendResearchNote(r, text);
      backendResearchState.status = 'connected';
      backendResearchState.lastError = '';
      backendResearchState.loaded = false;
      router('rd');
      toast('R&D note saved to backend.');
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendResearchState);
      router('rd');
      return;
    }
  }
  failBackendRequiredWrite(null, backendResearchState, 'R&D notes require backend confirmation. Nothing was saved locally.');
}

async function addRdComment(id) {
  const inp = document.getElementById('rd_cmt_'+id);
  const text = (inp?.value || '').trim();
  if (!text) { toast('Type a comment first.'); return; }
  const r = (state.rdRequests || []).find(x => x.id === id);
  if (!r) return;
  if (researchBackendIsConnected() && researchRequestBackendId(r)) {
    try {
      await addBackendResearchComment(r, text);
      backendResearchState.status = 'connected';
      backendResearchState.lastError = '';
      backendResearchState.loaded = false;
      router('rd');
      toast('R&D comment saved to backend.');
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendResearchState);
      router('rd');
      return;
    }
  }
  failBackendRequiredWrite(null, backendResearchState, 'R&D comments require backend confirmation. Nothing was saved locally.');
}

async function completeRdRequest(id) {
  const r = (state.rdRequests || []).find(x => x.id === id);
  if (!r) return;
  const ok = await openConfirmModal({
    title: 'Complete R&D request',
    record: r.rdId,
    message: 'Move this R&D request to the Completed tab?',
    risk: 'The request can be reopened later if work resumes.',
    confirmLabel: 'Mark Complete',
    tone: 'workflow'
  });
  if (!ok) return;
  if (researchBackendIsConnected() && researchRequestBackendId(r)) {
    try {
      await completeBackendResearchRequest(r);
      backendResearchState.status = 'connected';
      backendResearchState.lastError = '';
      backendResearchState.loaded = false;
      rdTab = 'Completed';
      router('rd');
      toast(`${r.rdId} marked complete in backend.`);
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendResearchState);
      rdTab = 'Completed';
      router('rd');
      return;
    }
  }
  failBackendRequiredWrite(null, backendResearchState, 'R&D status changes require backend confirmation. Nothing was saved locally.');
}

async function reopenRdRequest(id) {
  const r = (state.rdRequests || []).find(x => x.id === id);
  if (!r) return;
  const ok = await openConfirmModal({
    title: 'Reopen R&D request',
    record: r.rdId,
    message: 'Move this R&D request back to the active Queue?',
    risk: 'This makes it active again for follow-up work.',
    confirmLabel: 'Reopen',
    tone: 'workflow'
  });
  if (!ok) return;
  if (researchBackendIsConnected() && researchRequestBackendId(r)) {
    try {
      await reopenBackendResearchRequest(r);
      backendResearchState.status = 'connected';
      backendResearchState.lastError = '';
      backendResearchState.loaded = false;
      rdTab = 'Queue';
      router('rd');
      toast(`${r.rdId} reopened in backend.`);
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendResearchState);
      rdTab = 'Queue';
      router('rd');
      return;
    }
  }
  failBackendRequiredWrite(null, backendResearchState, 'R&D status changes require backend confirmation. Nothing was saved locally.');
}

async function archiveRdRequest(id) {
  const r = (state.rdRequests || []).find(x => x.id === id);
  if (!r) return;
  const ok = await openConfirmModal({
    title: 'Archive R&D request',
    record: r.rdId,
    message: 'Archive this R&D request?',
    risk: 'Archived requests stay hidden from Queue and Completed until reopened.',
    confirmLabel: 'Archive Request',
    tone: 'workflow'
  });
  if (!ok) return;
  if (researchBackendIsConnected() && researchRequestBackendId(r)) {
    try {
      await archiveBackendResearchRequest(r);
      backendResearchState.status = 'connected';
      backendResearchState.lastError = '';
      backendResearchState.loaded = false;
      router('rd');
      toast(`${r.rdId} archived in backend.`);
      return;
    } catch (error) {
      failBackendRequiredWrite(error, backendResearchState);
      router('rd');
      return;
    }
  }
  failBackendRequiredWrite(null, backendResearchState, 'R&D status changes require backend confirmation. Nothing was saved locally.');
}

