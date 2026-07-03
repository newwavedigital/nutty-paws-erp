/* =========================================================================
   QUALITY ASSURANCE
   - Step between Production Schedule and Shipping
   - QA uploads a COA (Certificate of Analysis); upload triggers release to Shipping
   ========================================================================= */
function renderQualityAssurance(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendQualityState.loaded && !backendQualityState.loading) {
    loadBackendQualityQueue().then(() => { if (currentPage === 'quality-assurance') router('quality-assurance'); }).catch(() => {});
  }
  const queue = state.purchaseOrders.filter(p => p.status === 'qa_review').slice().sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
  const recentActions = state.purchaseOrders
    .filter(p => p.qaSkippedAt || p.qaReleasedAt || p.coa || p.postShipmentCoa || (p.status === 'shipping' || p.status === 'completed'))
    .slice()
    .sort((a,b)=>(qualityActionTimestamp(b)||'').localeCompare(qualityActionTimestamp(a)||''))
    .slice(0, 10);
  el.innerHTML = `
    ${renderBackendQualityBanner()}
    <div class="card">
      <div class="card-header">
        <h2>POs Awaiting QA Release</h2>
        <span style="font-size:13px;color:var(--brown-light)">${queue.length} order(s)</span>
      </div>
      <div class="help-text" style="margin-bottom:8px">After production is finalized, every PO sits here until QA uploads a Certificate of Analysis (COA). Once the COA is on file, the PO can be released. If QA needs to skip the hold, the skip path still requires a reason.</div>
      ${queue.length === 0
        ? '<div class="empty">No POs awaiting QA. Newly-completed production runs will appear here.</div>'
        : queue.map(po => qaCardHtml(po)).join('')
      }
    </div>
    <div class="card">
      <div class="card-header">
        <h2>Recent QA Actions</h2>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('qa_released.csv', state.purchaseOrders.filter(p => p.qaReleasedAt || p.qaSkippedAt || p.coa || p.postShipmentCoa).map(p => ({po:p.id,customer:getCustomer(p.customerId)?.name||'',brand:p.brand||'',action:qualityActionLabel(p),coa_file:qualityFileName(p),action_time:qualityActionTimestamp(p),action_by:qualityActionActor(p),skip_reason:p.qaSkipReason||'',release_target:p.qaReleaseType||'',post_shipment_coa:p.postShipmentCoa?.name||''})))">Export CSV</button>
      </div>
      ${recentActions.length === 0
        ? '<div class="empty">No QA release, skip, or post-shipment COA history yet.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>PO</th><th>Customer</th><th>Action</th><th>COA / Post-shipment</th><th>When</th><th>By</th><th>Notes / Reason</th><th></th></tr></thead>
            <tbody>
              ${recentActions.map(p => `
                <tr>
                  <td><strong>${p.id}</strong></td>
                  <td>${escapeHtml(getCustomer(p.customerId)?.name||'')}</td>
                  <td><div><span class="pill">${escapeHtml(qualityActionLabel(p))}</span></div><div style="font-size:11px;color:var(--brown-light);margin-top:3px">${escapeHtml(qualityReleaseStatusText(p))}</div></td>
                  <td>
                    ${p.coa ? `<div>${qualityFileLinkHtml(p.coa, 'var(--orange)')}</div>` : '<div style="color:var(--brown-light);font-size:12px">No COA on file</div>'}
                    ${p.postShipmentCoa ? `<div style="margin-top:4px">${qualityFileLinkHtml(p.postShipmentCoa, 'var(--brown)')}</div>` : ((p.status === 'shipping' || p.status === 'completed') ? `<div class="file-upload" style="margin-top:6px;padding:8px"><input type="file" accept=".pdf,application/pdf,image/*" onchange="qualityPostShipmentCoaSelected(event,'${p.id}')" /><div class="file-info">Optional post-shipment COA upload.</div></div>` : '<div style="color:var(--brown-light);font-size:12px;margin-top:4px">Post-shipment COA can be attached later.</div>')}
                  </td>
                  <td>${fmtDate(qualityActionTimestamp(p)?.slice(0,10)||'')}</td>
                  <td>${escapeHtml(qualityActionActor(p))}</td>
                  <td>${escapeHtml(p.qaSkipReason || p.qaNotes || '-')}</td>
                  <td>${p.status === 'shipping' || p.status === 'completed' ? '<span style="color:var(--success);font-size:12px">Post-shipment ready</span>' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}

function qualityFileLinkHtml(file, color = 'var(--orange)', label = '') {
  const name = file?.name || file?.fileName || label || 'file';
  return backendFileActionHtml(file, {
    style: `color:${color};text-decoration:none;background:none;border:none;padding:0;font:inherit;cursor:pointer`,
    htmlLabel: `&#128206; ${escapeHtml(name)}`,
    unavailableHtml: `<span style="color:var(--brown-light);font-size:12px">&#128206; ${escapeHtml(name)} unavailable</span>`
  });
}

function qaCardHtml(po) {
  const cust = getCustomer(po.customerId);
  const dayCount = (po.productionDate && po.productionEndDate)
    ? Math.round((new Date(po.productionEndDate) - new Date(po.productionDate)) / 86400000) + 1
    : 1;
  const lots = (po.lines || []).filter(l => l.lotNumber).map(l => `<span class="pill">${escapeHtml(l.lotNumber)}</span>`).join('');
  return `
    <div class="card" style="background:var(--beige-light);border-left:4px solid var(--orange);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0">${po.id} - ${escapeHtml(cust?.name||'')}</h3>
          <div style="font-size:12px;color:var(--brown-light);margin-top:2px">
            ${po.brand ? '<span class="pill">'+escapeHtml(po.brand)+'</span> ' : ''}
            Produced ${fmtDate(po.productionDate)}${po.productionEndDate && po.productionEndDate !== po.productionDate ? ' &rarr; ' + fmtDate(po.productionEndDate) : ''} &middot; ${dayCount} day${dayCount===1?'':'s'} &middot; Room: ${escapeHtml(po.productionRoom||'-')}
          </div>
        </div>
        <div>${statusBadge(po.status)}</div>
      </div>
      <div style="display:flex;gap:14px;margin:12px 0;flex-wrap:wrap">
        <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Units Produced</div>
          <div style="font-size:18px;font-weight:700;color:var(--brown)">${poTotalUnits(po) || '-'}</div>
        </div>
        <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
          <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Cases</div>
          <div style="font-size:18px;font-weight:700;color:var(--brown)">${poTotalCases(po) || '-'}</div>
        </div>
        ${lots ? `<div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px"><div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Lots</div><div style="margin-top:3px">${lots}</div></div>` : ''}
      </div>
      <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:8px;padding:12px 14px;margin-top:8px">
        <div style="font-size:13px;font-weight:600;color:var(--brown);margin-bottom:6px">Certificate of Analysis (COA)</div>
        ${po.coa
          ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span style="font-size:13px">${qualityFileLinkHtml(po.coa, 'var(--orange)')} <span style="color:var(--brown-light)">(${Math.round((po.coa.size||0)/1024)} KB)</span></span>
              <div style="font-size:11px;color:var(--brown-light)">Uploaded ${fmtDate(po.coa.uploadedAt?.slice(0,10)||'')} by ${escapeHtml(po.coa.uploadedBy||'-')}</div>
            </div>`
          : `<div class="file-upload">
              <input type="file" id="coa_input_${po.id}" accept=".pdf,application/pdf,image/*" onchange="qualityCoaFileSelected(event,'${po.id}')" />
              <div class="file-info" id="coa_info_${po.id}">No COA uploaded yet.</div>
            </div>`
        }
      </div>
      <div class="form-row" style="margin-top:10px">
        <label>QA Notes (optional)</label>
        <textarea id="qa_notes_${po.id}" placeholder="Anything QA wants logged about this batch...">${escapeHtml(po.qaNotes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-icon" onclick="viewPO('${po.id}')">View PO Detail</button>
        <button class="btn btn-secondary" onclick="qualitySaveNotes('${po.id}')">Save Notes</button>
        <button class="btn btn-secondary" onclick="openQualitySkipModal('${po.id}')">Skip QA</button>
        ${po.coa
          ? `<button class="btn" style="background:var(--success)" onclick="qualityReleasePo('${po.id}')">&#10003; Release to ${escapeHtml(qualityReleaseTargetStatus(po).replace(/_/g, ' '))}</button>`
          : `<button class="btn" disabled title="Upload a COA first">Release to ${escapeHtml(qualityReleaseTargetStatus(po).replace(/_/g, ' '))}</button>`
        }
      </div>
    </div>
  `;
}

async function qualityCoaFileSelected(e, poId) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  try {
    if (qualityBackendIsConnected() && qualityPurchaseOrderBackendId(po)) {
      await uploadBackendQualityCoa(qualityPurchaseOrderBackendId(po), file);
      const files = await loadBackendPurchaseOrderFiles(qualityPurchaseOrderBackendId(po));
      const coa = (files || []).find(item => item.fileCategory === 'coa') || null;
      if (!coa) throw new Error('Uploaded COA could not be confirmed from backend file metadata.');
      po.coa = mapBackendFileToPrototype(coa);
      backendQualityState.loaded = false;
    } else {
      failBackendRequiredWrite(null, backendQualityState, 'QA COA uploads require backend confirmation. Nothing was saved locally.');
      return;
    }
    toast('COA uploaded. Ready to release.');
    renderQualityAssurance(document.getElementById('content'));
  } catch (error) {
    toast(error.message || 'COA upload failed.');
  } finally {
    e.target.value = '';
  }
}

async function qualityPostShipmentCoaSelected(e, poId) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  try {
    const saved = await persistQualityPostShipmentCoa(poId, file);
    if (!saved) return;
    toast('Post-shipment COA attached.');
    renderQualityAssurance(document.getElementById('content'));
  } catch (error) {
    toast(error.message || 'Post-shipment COA upload failed.');
  } finally {
    e.target.value = '';
  }
}

async function qualitySaveNotes(poId) {
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  if (!qualityBackendIsConnected() || !qualityPurchaseOrderBackendId(po)) {
    failBackendRequiredWrite(null, backendQualityState, 'QA notes require backend confirmation. Nothing was saved locally.');
    return;
  }
  try {
    await saveBackendQualityNotes(po, getQualityNotesValue(poId));
    backendQualityState.status = 'connected';
    backendQualityState.lastError = '';
    toast('QA notes saved to backend.');
    router('quality-assurance');
  } catch (error) {
    failBackendRequiredWrite(error, backendQualityState);
  }
}

async function qualityReleasePo(poId) {
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  if (!po.coa) { toast('Upload a COA first.'); return; }
  try {
    const saved = await persistQualityRelease(po);
    if (!saved) return;
    const target = qualityReleaseTargetStatus(po).replace(/_/g, ' ');
    toast(`${poId} released to ${target}.`);
    router('quality-assurance');
  } catch (error) {
    backendQualityState.status = 'error';
    backendQualityState.lastError = 'Quality release failed. The change was not applied.';
    toast(error.message || backendQualityState.lastError);
  }
}

function openQualitySkipModal(poId) {
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  openModal(`Skip QA - ${escapeHtml(po.id)}`, `
    <div style="display:grid;gap:12px">
      <div style="font-size:13px;color:var(--brown)">QA skip is allowed, but a reason is required so the record stays auditable.</div>
      <div class="form-row">
        <label>Skip Reason</label>
        <textarea id="qa_skip_reason_${po.id}" placeholder="Explain why QA is being skipped..." required></textarea>
      </div>
      <div class="form-row">
        <label>QA Notes (optional)</label>
        <textarea id="qa_skip_notes_${po.id}" placeholder="Any additional QA notes...">${escapeHtml(po.qaNotes||'')}</textarea>
      </div>
      <div class="form-actions" style="justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-workflow" onclick="qualitySubmitSkip('${po.id}')">Skip QA</button>
      </div>
    </div>
  `);
}

async function qualitySubmitSkip(poId) {
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  const reason = getQualitySkipReasonValue(poId);
  const notes = (document.getElementById(`qa_skip_notes_${poId}`)?.value || '').trim();
  if (!reason) {
    toast('Skip reason is required.');
    return;
  }
  try {
    const saved = await persistQualitySkip(poId);
    if (!saved) return;
    toast(`${po.id} skipped QA with a required reason.`);
    closeModal();
    router('quality-assurance');
  } catch (error) {
    backendQualityState.status = 'error';
    backendQualityState.lastError = 'Quality skip failed. The change was not applied.';
    toast(error.message || backendQualityState.lastError);
  }
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    qualityCoaFileSelected,
    qualityPostShipmentCoaSelected,
    qualitySaveNotes,
    qualityReleasePo,
    openQualitySkipModal,
    qualitySubmitSkip
  });
}

