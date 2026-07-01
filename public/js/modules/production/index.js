/* =========================================================================
   PRODUCTION SCHEDULE (calendar)
   ========================================================================= */
const ROOMS = ['Squeeze Pack', 'Bnutty', 'Main', 'Dog House'];
function roomColor(r) {
  switch(r) {
    case 'Squeeze Pack': return 'var(--room-squeeze)';
    case 'Bnutty': return 'var(--room-bnutty)';
    case 'Main': return 'var(--room-main)';
    case 'Dog House': return 'var(--room-doghouse)';
    default: return 'var(--grey)';
  }
}
let calMonth = new Date(); calMonth.setDate(1);

let prodTab = 'Schedule';
function setProdTab(t) { prodTab = t; renderProduction(document.getElementById('content')); }
function productionTabsHtml() {
  return `<div class="tabs" style="margin-bottom:14px">
    <button class="tab ${prodTab==='Schedule'?'active':''}" onclick="setProdTab('Schedule')">Schedule</button>
    <button class="tab ${prodTab==='Production Log'?'active':''}" onclick="setProdTab('Production Log')">Production Log <span class="tab-count">${(state.productionLog||[]).length}</span></button>
  </div>`;
}
function renderProduction(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendProductionState.loaded && !backendProductionState.loading) {
    loadBackendProduction().then(() => { if (currentPage === 'production') router('production'); });
  }
  if (prodTab === 'Production Log') { el.innerHTML = productionTabsHtml() + renderBackendProductionBanner() + productionLogInnerHtml(); return; }
  const unscheduled = state.purchaseOrders.filter(p => p.status === 'approved_for_production' && !p.productionDate);
  const active = state.purchaseOrders.filter(p => p.productionDate && p.status !== 'qa_review' && p.status !== 'shipping' && p.status !== 'completed');
  el.innerHTML = `
    ${productionTabsHtml()}
    ${renderBackendProductionBanner()}
    <div class="card">
      <div class="cal-toolbar">
        <button class="btn btn-secondary btn-sm" onclick="calNav(-1)">&laquo; Prev</button>
        <div class="cal-month-label" id="calLabel"></div>
        <button class="btn btn-secondary btn-sm" onclick="calNav(1)">Next &raquo;</button>
        <button class="btn btn-secondary btn-sm" onclick="calToToday()">Today</button>
        <div style="flex:1"></div>
      </div>
      <div id="calendar" class="calendar"></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2>Active Production Runs</h2>
        <span style="font-size:13px;color:var(--brown-light)">${active.length} scheduled</span>
      </div>
      <div class="help-text" style="margin-bottom:8px">All POs currently scheduled on the calendar. Click <strong>Mark Complete</strong> to deduct inventory and send the PO to Quality Assurance for COA upload before shipping.</div>
      ${active.length === 0
        ? '<div class="empty">No active production runs. Schedule an approved PO from the calendar or the list below.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>PO #</th><th>Brand / Customer</th><th>Room</th><th>Dates</th><th>Units</th><th></th></tr></thead>
            <tbody>
            ${active.map(p => {
              const sameDay = !p.productionEndDate || p.productionEndDate === p.productionDate;
              const dates = sameDay
                ? fmtDate(p.productionDate)
                : `${fmtDate(p.productionDate)} &rarr; ${fmtDate(p.productionEndDate)}`;
              return `<tr>
                <td><strong>${p.id}</strong></td>
                <td>${p.brand ? `<span class="pill">${escapeHtml(p.brand)}</span> ` : ''}${escapeHtml(getCustomer(p.customerId)?.name||'')}</td>
                <td><span class="room-dot" style="display:inline-block;background:${roomColor(p.productionRoom)};vertical-align:middle"></span> ${escapeHtml(p.productionRoom||'-')}</td>
                <td>${dates}</td>
                <td>${p.lines.reduce((s,l)=>s+l.qty,0)}</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="editProductionEvent('${p.id}')">Edit</button>
                  <button class="btn btn-icon btn-sm" onclick="viewPO('${p.id}')">View PO</button>
                  <button class="btn btn-sm" style="background:var(--success)" onclick="markCompleted('${p.id}')">&#10003; Mark Complete</button>
                </td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
    <div class="card">
      <div class="card-header">
        <h2>Awaiting Scheduling</h2>
        <span style="font-size:13px;color:var(--brown-light)">${unscheduled.length} approved order(s)</span>
      </div>
      ${unscheduled.length === 0
        ? '<div class="empty">No approved POs are waiting to be scheduled.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>PO #</th><th>Customer</th><th>Items</th><th>Suggested Room</th><th></th></tr></thead>
            <tbody>
            ${unscheduled.map(p => {
              const rooms = [...new Set(p.lines.map(l => getProduct(l.productId)?.room).filter(Boolean))];
              return `<tr>
                <td><strong>${p.id}</strong></td>
                <td>${escapeHtml(getCustomer(p.customerId)?.name||'')}</td>
                <td>${p.lines.reduce((s,l)=>s+l.qty,0)} units (${p.lines.length} SKUs)</td>
                <td>${rooms.map(r=>`<span class="pill"><span class="room-dot" style="display:inline-block;background:${roomColor(r)};vertical-align:middle"></span> ${escapeHtml(r)}</span>`).join(' ')}</td>
                <td><button class="btn btn-sm" onclick="schedulePO('${p.id}')">Schedule</button></td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
  drawCalendar();
}

/* =========================================================================
   PRODUCTION LOG - auto-generated when a run is finalized (Mark Complete ->
   QA). Read-only history of everything produced and consumed per PO.
   ========================================================================= */
function nextProductionLogId() {
  const nums = (state.productionLog || [])
    .map(r => parseInt((String(r.logId || '').match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return 'PRD-' + next;
}
// Record (or refresh) a production-log entry for a PO. Idempotent per PO.
function logProduction(po) {
  state.productionLog = state.productionLog || [];
  const existing = state.productionLog.find(l => l.poId === po.id);
  if (existing) {
    Object.assign(existing, productionLogRecord(po, existing.logId), { id: existing.id });
  } else {
    state.productionLog.push(productionLogRecord(po, nextProductionLogId()));
  }
}
function productionLogInnerHtml() {
  const rows = (state.productionLog || []).slice().sort((a,b) => (b.completedAt||'').localeCompare(a.completedAt||''));
  const headers = ['Log ID','PO #','Production Date','Customer','Brand','Room','Units Produced','Waste %','Completed',''];
  return `
    <div class="card">
      <div class="card-header">
        <h2>Production Log</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('production_log.csv', (state.productionLog||[]).map(r=>({log_id:r.logId,po:r.poId,production_date:r.productionDate,customer:getCustomer(r.customerId)?.name||'',brand:r.brand,room:r.room,units_produced:(r.lines||[]).reduce((s,l)=>s+(l.produced||0),0),waste_pct:r.wasteLossPct,completed:(r.completedAt||'').slice(0,10)})))">Export CSV</button>
        </div>
      </div>
      <div style="background:var(--beige-light);padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:12px;color:var(--brown)">
        Auto-generated history of finished production runs. An entry is created here automatically when a run is marked complete and sent to Quality Assurance. Click <strong>View</strong> for the full breakdown of finished goods and materials used.
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="${headers.length}" class="empty">No production runs logged yet. Mark a run complete on the Schedule tab to create one.</td></tr>` :
            rows.map(r => {
              const sameDay = !r.productionEndDate || r.productionEndDate === r.productionDate;
              const dates = sameDay ? fmtDate(r.productionDate) : `${fmtDate(r.productionDate)} &rarr; ${fmtDate(r.productionEndDate)}`;
              const units = (r.lines||[]).reduce((s,l)=>s+(l.produced||0),0);
              const w = r.wasteLossPct||0;
              return `<tr>
                <td><strong>${escapeHtml(r.logId||'')}</strong></td>
                <td>${escapeHtml(r.poId||'-')}</td>
                <td>${dates}</td>
                <td>${escapeHtml(getCustomer(r.customerId)?.name||'-')}</td>
                <td>${r.brand?'<span class="pill">'+escapeHtml(r.brand)+'</span>':'-'}</td>
                <td>${escapeHtml(r.room||'-')}</td>
                <td>${units}</td>
                <td><strong style="color:${w>7?'var(--danger)':(w>0?'#a0470c':'var(--success)')}">${(w>=0?'+':'')+w}%</strong></td>
                <td>${r.completedAt?fmtDate(r.completedAt.slice(0,10)):'-'}</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="viewProductionLog('${r.id}')">View</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteProductionLog('${r.id}')">Delete</button>
                </td>
              </tr>`;
            }).join('')
          }
        </tbody>
      </table></div>
    </div>
  `;
}
function viewProductionLog(id) {
  const r = (state.productionLog || []).find(x => x.id === id);
  if (!r) return;
  const po = (state.purchaseOrders || []).find(p => p.id === r.poId || p._backendId === r.poId);
  const productionRunId = r._backendProductionRunId || po?._backendProductionRunId;
  const sameDay = !r.productionEndDate || r.productionEndDate === r.productionDate;
  const dates = sameDay ? fmtDate(r.productionDate) : `${fmtDate(r.productionDate)} &rarr; ${fmtDate(r.productionEndDate)}`;
  const w = r.wasteLossPct||0;
  const fgRows = (r.lines||[]).map(l => {
    const p = getProduct(l.productId);
    return `<tr>
      <td><strong>${escapeHtml(p?.sku||'')}</strong><div style="font-size:12px;color:var(--brown-light)">${escapeHtml(p?.name||'')}</div></td>
      <td>${l.ordered}</td><td>${l.produced}</td><td>${l.cases||0}</td>
      <td>${l.lot?'<span class="pill">'+escapeHtml(l.lot)+'</span>':'-'}</td>
    </tr>`;
  }).join('');
  const matRows = (r.materials||[]).map(m => {
    const ing = getIngredient(m.ingredientId);
    const wpct = m.theoretical > 0 ? ((m.actual - m.theoretical) / m.theoretical) * 100 : 0;
    const prod = m.productId ? getProduct(m.productId) : null;
    return `<tr>
      <td>${escapeHtml(ing?.name||'')}${prod?` <span style="font-size:11px;color:var(--brown-light)">(${escapeHtml(prod.sku||'')})</span>`:''}</td>
      <td>${escapeHtml(m.category||'')}</td>
      <td>${(m.theoretical||0).toFixed(2)}</td>
      <td>${(m.actual||0).toFixed(2)}</td>
      <td style="color:${wpct>7?'var(--danger)':(wpct>0?'#a0470c':'var(--success)')}">${(wpct>=0?'+':'')+wpct.toFixed(1)}%</td>
      <td>${m.lot?'<span class="pill">'+escapeHtml(m.lot)+'</span>':'-'}</td>
    </tr>`;
  }).join('');
  openModal(`Production Log - ${escapeHtml(r.logId||'')}`, `
    <div style="margin-bottom:10px">
      <strong>${escapeHtml(getCustomer(r.customerId)?.name||'')}</strong>
      <div style="font-size:12px;color:var(--brown-light)">${r.brand?escapeHtml(r.brand)+' &middot; ':''}PO ${escapeHtml(r.poId||'')} &middot; Production: ${dates} &middot; Room: ${escapeHtml(r.room||'-')}</div>
      <div style="font-size:12px;color:var(--brown-light)">Completed: ${r.completedAt?fmtDate(r.completedAt.slice(0,10)):'-'} &middot; Overall waste loss: <strong style="color:${w>7?'var(--danger)':(w>0?'#a0470c':'var(--success)')}">${(w>=0?'+':'')+w}%</strong></div>
    </div>
    <h4 style="margin:14px 0 6px;color:var(--brown)">Finished Goods Produced</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>SKU / Product</th><th>Ordered</th><th>Produced</th><th>Cases</th><th>Lot #</th></tr></thead>
      <tbody>${fgRows || '<tr><td colspan="5" class="empty">-</td></tr>'}</tbody>
    </table></div>
    <h4 style="margin:16px 0 6px;color:var(--brown)">Materials Used</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Theoretical</th><th>Actual</th><th>Waste %</th><th>Lot #</th></tr></thead>
      <tbody>${matRows || '<tr><td colspan="6" class="empty">-</td></tr>'}</tbody>
    </table></div>
    ${r.notes ? `<div style="margin-top:14px"><div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;margin-bottom:4px">Production Notes</div><div style="background:var(--beige-light);padding:10px 14px;border-radius:6px;white-space:pre-wrap;font-size:13px">${escapeHtml(r.notes)}</div></div>` : ''}
    <div class="form-actions">
      ${productionRunId ? `<button class="btn btn-secondary" onclick="reopenProductionForCorrection('${r.id}')">Reopen for Correction</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

async function reopenProductionForCorrection(logId) {
  const log = (state.productionLog || []).find(r => r.id === logId);
  if (!log) return;
  const po = (state.purchaseOrders || []).find(p => p.id === log.poId || p._backendId === log.poId);
  const productionRunId = log._backendProductionRunId || po?._backendProductionRunId;
  const reason = window.prompt('Reason for reopening this finalized production run?');
  if (!reason || !reason.trim()) return;
  if (!productionRunId || !requireEmployeeBackendWrite(backendProductionState, 'Production correction reopen requires backend confirmation. Nothing was saved locally.')) {
    if (productionRunId) return;
    failBackendRequiredWrite(null, backendProductionState, 'Production correction reopen requires backend confirmation. Nothing was saved locally.');
    return;
  }
  try {
    await reopenBackendProductionRun(productionRunId, reason.trim());
    backendProductionState.status = 'connected';
  } catch (error) {
    backendProductionState.status = 'error';
    backendProductionState.lastError = 'Production backend correction reopen failed.';
    toast(error.message || backendProductionState.lastError);
    return;
  }
  if (po) {
    po.productionFinalized = false;
    po.status = 'in_production';
    po.completionNotes = reason.trim();
  }
  saveState();
  closeModal();
  toast(`${log.poId || 'Production run'} reopened for production correction.`);
  router('production');
}
async function deleteProductionLog(id) {
  if (employeeBackendSessionActive()) {
    return failBackendRequiredWrite(null, backendProductionState, 'Production log delete requires backend archive support. Nothing was saved locally.');
  }
  const ok = await openConfirmModal({
    title: 'Delete production log',
    record: id,
    message: 'Delete this production log entry?',
    risk: 'This does not affect the related PO.',
    confirmLabel: 'Delete Log',
    tone: 'danger'
  });
  if (!ok) return;
  state.productionLog = (state.productionLog || []).filter(x => x.id !== id);
  saveState();
  router('production');
  toast('Production log entry deleted.');
}
function calNav(dir) {
  calMonth.setMonth(calMonth.getMonth() + dir);
  drawCalendar();
}
function calToToday() {
  calMonth = new Date(); calMonth.setDate(1);
  drawCalendar();
}
function drawCalendar() {
  document.getElementById('calLabel').textContent =
    calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cal = document.getElementById('calendar');
  if (!cal) return;
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');

  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate();
  const prevDays = new Date(calMonth.getFullYear(), calMonth.getMonth(), 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // build a map of date -> events; multi-day POs appear on every day in their range
  const events = {};
  state.purchaseOrders.forEach(p => {
    if (!p.productionDate) return;
    const start = new Date(p.productionDate + 'T00:00:00');
    const endStr = p.productionEndDate || p.productionDate;
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(start) || isNaN(end)) return;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
      const dStr = d.toISOString().slice(0,10);
      const totalDays = Math.round((end - start) / 86400000) + 1;
      const dayIdx = Math.round((d - start) / 86400000) + 1;
      let position = 'single';
      if (totalDays > 1) {
        if (dayIdx === 1) position = 'start';
        else if (dayIdx === totalDays) position = 'end';
        else position = 'middle';
      }
      (events[dStr] = events[dStr] || []).push({ po: p, position, dayIdx, totalDays });
    }
  });

  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    let dayNum, mDate, muted = false;
    if (i < startWeekday) {
      dayNum = prevDays - startWeekday + 1 + i;
      mDate = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, dayNum);
      muted = true;
    } else if (i >= startWeekday + daysInMonth) {
      dayNum = i - startWeekday - daysInMonth + 1;
      mDate = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, dayNum);
      muted = true;
    } else {
      dayNum = i - startWeekday + 1;
      mDate = new Date(calMonth.getFullYear(), calMonth.getMonth(), dayNum);
    }
    const dStr = mDate.toISOString().slice(0,10);
    const isToday = mDate.getTime() === today.getTime();
    const evts = events[dStr] || [];
    html += `<div class="cal-day ${muted?'muted':''} ${isToday?'today':''}" onclick="dayClick('${dStr}')">
      <div class="num">${dayNum}</div>
      ${evts.map(({po, position, dayIdx, totalDays}) => {
        const cust = getCustomer(po.customerId);
        const custName = cust?.name || '(no customer)';
        const titleAttr = `${escapeHtml(po.id)} - ${escapeHtml(custName)} (${escapeHtml(po.productionRoom||'')}) Day ${dayIdx} of ${totalDays}`;
        let nameLine = escapeHtml(custName);
        let poLine = escapeHtml(po.id);
        if (totalDays > 1) {
          if (position === 'start') { nameLine = '&#9654; ' + nameLine; }
          else if (position === 'end') { nameLine += ' &#9632;'; }
          else if (position === 'middle') { nameLine = '... ' + nameLine; poLine = escapeHtml(po.id) + ' (cont.)'; }
        }
        const styleParts = [`background:${roomColor(po.productionRoom)}`];
        if (position === 'start') styleParts.push('border-radius:3px 0 0 3px');
        else if (position === 'end') styleParts.push('border-radius:0 3px 3px 0');
        else if (position === 'middle') styleParts.push('border-radius:0');
        return `<div class="cal-event" style="${styleParts.join(';')}" onclick="event.stopPropagation();editProductionEvent('${po.id}')" title="${titleAttr}"><span class="cal-event-name">${nameLine}</span><span class="cal-event-po">${poLine}</span></div>`;
      }).join('')}
    </div>`;
  }
  cal.innerHTML = html;
}
function dayClick(dStr) {
  const unsched = state.purchaseOrders.filter(p => p.status === 'approved_for_production');
  if (unsched.length === 0) {
    toast('No approved POs to schedule. Approve some in Supply Chain.');
    return;
  }
  openModal('Schedule Production - starting ' + fmtDate(dStr), `
    <p>Select a PO to schedule starting <strong>${fmtDate(dStr)}</strong>. Set an end date if production runs more than one day.</p>
    <table>
      <thead><tr><th>PO</th><th>Customer</th><th>Units</th><th>Room</th><th>End Date</th><th></th></tr></thead>
      <tbody>
      ${unsched.map(p => {
        const rooms = [...new Set(p.lines.map(l=>getProduct(l.productId)?.room).filter(Boolean))];
        return `<tr>
          <td><strong>${p.id}</strong></td>
          <td>${escapeHtml(getCustomer(p.customerId)?.name||'')}</td>
          <td>${p.lines.reduce((s,l)=>s+l.qty,0)}</td>
          <td>
            <select id="room_${p.id}">
              ${ROOMS.map(r=>`<option ${rooms.includes(r)?'selected':''}>${r}</option>`).join('')}
            </select>
          </td>
          <td><input type="date" id="end_${p.id}" value="${dStr}" min="${dStr}" style="font-size:12px;padding:4px" /></td>
          <td><button class="btn btn-sm" onclick="confirmSchedule('${p.id}','${dStr}')">Schedule</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  `);
}
async function confirmSchedule(poId, dStr) {
  const po = state.purchaseOrders.find(p => p.id === poId);
  if (!po) return;
  const room = document.getElementById('room_'+poId)?.value || ROOMS[0];
  const endDate = document.getElementById('end_'+poId)?.value || dStr;
  if (endDate < dStr) { toast('End date must be on or after the start date.'); return; }
  if (!requireEmployeeBackendWrite(backendProductionState)) return;
  if (!po._backendId) return failBackendRequiredWrite(null, backendProductionState, 'This production order is not backend-backed. Nothing was saved locally.');
  try {
    await scheduleBackendProductionRun(po, dStr, endDate, room);
    backendProductionState.status = 'connected';
    backendProductionState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendProductionState);
    return;
  }
  po.productionDate = dStr;
  po.productionEndDate = endDate;
  po.productionRoom = room;
  po.status = 'in_production';
  saveState();
  closeModal();
  const days = Math.round((new Date(endDate) - new Date(dStr)) / 86400000) + 1;
  toast(`${poId} scheduled in ${room} (${days} day${days===1?'':'s'}).`);
  router('production');
}
function schedulePO(id) {
  // open modal asking for date and room
  const po = state.purchaseOrders.find(p => p.id === id);
  const rooms = [...new Set(po.lines.map(l=>getProduct(l.productId)?.room).filter(Boolean))];
  const today = new Date().toISOString().slice(0,10);
  openModal('Schedule ' + id, `
    <div class="form-grid">
      <div class="form-row">
        <label>Start Date</label>
        <input type="date" id="sched_date" value="${today}" oninput="document.getElementById('sched_end').min=this.value" />
      </div>
      <div class="form-row">
        <label>End Date</label>
        <input type="date" id="sched_end" value="${today}" min="${today}" />
        <div class="help-text">Same as start for single-day runs.</div>
      </div>
      <div class="form-row">
        <label>Production Room</label>
        <select id="sched_room">${ROOMS.map(r=>`<option ${rooms.includes(r)?'selected':''}>${r}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="doSchedule('${id}')">Confirm Schedule</button>
    </div>
  `);
}
async function doSchedule(id) {
  const d = document.getElementById('sched_date').value;
  const e = document.getElementById('sched_end').value || d;
  const r = document.getElementById('sched_room').value;
  if (e < d) { toast('End date must be on or after the start date.'); return; }
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!requireEmployeeBackendWrite(backendProductionState)) return;
  if (!po?._backendId) return failBackendRequiredWrite(null, backendProductionState, 'This production order is not backend-backed. Nothing was saved locally.');
  try {
    await scheduleBackendProductionRun(po, d, e, r);
    backendProductionState.status = 'connected';
    backendProductionState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendProductionState);
    return;
  }
  po.productionDate = d;
  po.productionEndDate = e;
  po.productionRoom = r;
  po.status = 'in_production';
  saveState();
  closeModal();
  const days = Math.round((new Date(e) - new Date(d)) / 86400000) + 1;
  toast(`${id} scheduled in ${r} (${days} day${days===1?'':'s'}).`);
  router('production');
}
function canMarkComplete(po) {
  // show on every scheduled PO except ones already fully completed
  return !!po.productionDate && po.status !== 'completed' && !po.productionFinalized;
}
function editProductionEvent(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const startDate = po.productionDate || '';
  const endDate = po.productionEndDate || po.productionDate || '';
  const dayCount = (startDate && endDate) ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1 : 1;
  const showComplete = canMarkComplete(po);
  openModal(`${po.id} - Production`, `
    <div style="margin-bottom:10px">
      <strong>${escapeHtml(getCustomer(po.customerId)?.name||'')}</strong>
      <div style="font-size:12px;color:var(--brown-light)">${po.lines.reduce((s,l)=>s+l.qty,0)} units &middot; ${dayCount} day${dayCount===1?'':'s'} &middot; Status: ${po.status.replace(/_/g,' ')}</div>
    </div>
    ${showComplete ? `
      <div style="margin:14px 0;padding:14px;background:#e8f4e2;border-left:4px solid var(--success);border-radius:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;color:var(--brown);font-size:14px">Production complete?</div>
          <div style="font-size:12px;color:var(--brown-light)">Marks the PO as done, deducts inventory, and sends it to Quality Assurance for COA upload before shipping.</div>
        </div>
        <button class="btn" style="background:var(--success);font-size:14px;padding:10px 18px" onclick="markCompleted('${po.id}')">&#10003; Mark Complete &rarr; QA</button>
      </div>
    ` : ''}
    <div class="form-grid">
      <div class="form-row">
        <label>Start Date</label>
        <input type="date" id="ev_date" value="${startDate}" oninput="document.getElementById('ev_end').min=this.value" />
      </div>
      <div class="form-row">
        <label>End Date</label>
        <input type="date" id="ev_end" value="${endDate}" min="${startDate}" />
      </div>
      <div class="form-row">
        <label>Production Room</label>
        <select id="ev_room">${ROOMS.map(r=>`<option ${po.productionRoom===r?'selected':''}>${r}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-actions" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <button class="btn btn-icon" onclick="viewPO('${po.id}')">View PO Detail</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        <button class="btn btn-dark" onclick="saveEventEdit('${po.id}')">Save Schedule</button>
      </div>
    </div>
  `);
}
async function saveEventEdit(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  const start = document.getElementById('ev_date').value;
  const end = document.getElementById('ev_end').value || start;
  if (end < start) { toast('End date must be on or after the start date.'); return; }
  const room = document.getElementById('ev_room').value;
  if (!requireEmployeeBackendWrite(backendProductionState)) return;
  if (!po?._backendId) return failBackendRequiredWrite(null, backendProductionState, 'This production order is not backend-backed. Nothing was saved locally.');
  try {
    await scheduleBackendProductionRun(po, start, end, room);
    backendProductionState.status = 'connected';
    backendProductionState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendProductionState);
    return;
  }
  po.productionDate = start;
  po.productionEndDate = end;
  po.productionRoom = room;
  saveState();
  closeModal();
  toast(`${id} updated.`);
  router('production');
}
function nextLotNumber() {
  const yr = new Date().getFullYear().toString().slice(-2);
  const existing = (state.lots || []).map(l => {
    const m = (l.lotNumber || '').match(new RegExp(`^L${yr}-(\\d+)$`));
    return m ? parseInt(m[1], 10) : 0;
  }).filter(n => !isNaN(n));
  const next = (existing.length ? Math.max(...existing) : 0) + 1;
  return `L${yr}-${String(next).padStart(4, '0')}`;
}

let completionMaterials = { ingredients: [], packaging: [] };
let completionPoId = null;
function markCompleted(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  completionPoId = id;
  // Build material list from BOM.
  //  - Ingredients are AGGREGATED across the whole PO (shared raw materials).
  //  - Packaging is tracked PER SKU / production line, since each SKU has its own
  //    jars, lids, labels, cases, etc. and is deducted from inventory per SKU.
  const theo = poTheoretical(po);
  completionMaterials = { ingredients: [], packaging: [] };
  Object.keys(theo).forEach(ingId => {
    const ing = getIngredient(ingId);
    if (!ing) return;
    if (ing.category !== 'Packaging') {
      completionMaterials.ingredients.push({ ingredientId: ingId });
    }
  });
  // Packaging: one entry per (line, packaging ingredient), in line order.
  po.lines.forEach((line, li) => {
    const bom = state.boms[line.productId] || [];
    bom.forEach(b => {
      const ing = getIngredient(b.ingredientId);
      if (ing && ing.category === 'Packaging') {
        completionMaterials.packaging.push({ lineIndex: li, productId: line.productId, ingredientId: b.ingredientId });
      }
    });
  });
  openModal(`Complete Production - ${po.id}`, `
    <div style="margin-bottom:10px">
      <strong>${escapeHtml(getCustomer(po.customerId)?.name||'')}</strong>
      <div style="font-size:12px;color:var(--brown-light)">${po.brand ? escapeHtml(po.brand)+' &middot; ' : ''}Production: ${fmtDate(po.productionDate)}${po.productionEndDate && po.productionEndDate !== po.productionDate ? ' &rarr; ' + fmtDate(po.productionEndDate) : ''} &middot; Room: ${escapeHtml(po.productionRoom||'-')}</div>
    </div>
    <div style="background:var(--beige-light);padding:10px;border-radius:6px;margin-bottom:14px;font-size:12px;color:var(--brown)">
      Enter the <strong>units &amp; cases produced</strong> with lot #s, then the <strong>actual ingredients &amp; packaging used</strong> with their lot #s. Waste loss % is calculated from theoretical vs. actual. <strong>All fields are required</strong> before you can move to QA.
    </div>

    <h4 style="margin:0 0 6px;color:var(--brown)">Finished Goods</h4>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>SKU / Product</th><th style="width:80px">Ordered</th><th style="width:100px">Units Produced</th><th style="width:100px">Cases</th><th style="width:150px">Lot #</th>
      </tr></thead>
      <tbody>
        ${po.lines.map((l, i) => {
          const p = getProduct(l.productId);
          const units = (typeof l.actualQty === 'number') ? l.actualQty : l.qty;
          const cases = (typeof l.casesProduced === 'number') ? l.casesProduced : '';
          const lot = l.lotNumber || nextLotNumber();
          return `<tr>
            <td><div><strong>${escapeHtml(p?.sku || '')}</strong></div><div style="font-size:12px;color:var(--brown-light)">${escapeHtml(p?.name || '')}</div></td>
            <td>${l.qty}</td>
            <td><input type="number" min="0" id="comp_qty_${i}" value="${units}" oninput="recomputeCompletion('${po.id}')" style="width:100%;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /></td>
            <td><input type="number" min="0" id="comp_cases_${i}" value="${cases}" placeholder="0" oninput="recomputeCompletion('${po.id}')" style="width:100%;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /></td>
            <td><div style="display:flex;gap:4px"><input type="text" id="comp_lot_${i}" value="${escapeHtml(lot)}" oninput="recomputeCompletion('${po.id}')" style="flex:1;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /><button type="button" class="btn btn-icon btn-sm" title="Generate next lot #" onclick="document.getElementById('comp_lot_${i}').value='${nextLotNumber()}';recomputeCompletion('${po.id}');">&#8635;</button></div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>

    <h4 style="margin:16px 0 6px;color:var(--brown)">Ingredients Used</h4>
    <div id="cm_ingredients">${completionMaterialRowsHtml('ingredients')}</div>

    <h4 style="margin:16px 0 6px;color:var(--brown)">Packaging Used <span style="font-size:11px;font-weight:400;color:var(--brown-light)">- by SKU</span></h4>
    <div id="cm_packaging">${completionPackagingRowsHtml()}</div>

    <div id="comp_waste" style="margin-top:14px"></div>
    <div id="comp_impact" style="margin-top:10px"></div>

    <div class="form-row" style="margin-top:14px">
      <label>Production Notes (optional)</label>
      <textarea id="comp_notes" placeholder="Anything operations / QA should know about this run..."></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" id="comp_confirm_btn" style="background:var(--success)" onclick="finalizeMarkComplete('${po.id}')">&#10003; Confirm &amp; Move to Quality Assurance</button>
    </div>
  `);
  setTimeout(() => recomputeCompletion(po.id), 30);
}
function completionMaterialRowsHtml(kind) {
  const list = completionMaterials[kind];
  if (!list.length) return '<div style="font-size:12px;color:var(--brown-light);padding:6px 2px">None on this formula.</div>';
  const grid = 'grid-template-columns:2fr 1fr 1fr 0.8fr 1.3fr';
  return `
    <div class="po-line" style="${grid};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Item</div><div>Theoretical</div><div>Actual Used</div><div>Waste %</div><div>Lot #</div>
    </div>
    ${list.map((m, i) => {
      const ing = getIngredient(m.ingredientId);
      return `<div class="po-line" style="${grid}">
        <div style="font-size:13px">${escapeHtml(ing?.name||'')} <span style="color:var(--brown-light);font-size:11px">(${escapeHtml(ing?.unit||'')})</span></div>
        <div data-theo="${kind}_${i}" style="text-align:right;font-size:13px;color:var(--brown-light)">-</div>
        <input type="number" min="0" step="0.01" id="cm_${kind}_qty_${i}" oninput="recomputeCompletion()" style="padding:6px 8px;border:1px solid var(--grey);border-radius:4px" />
        <div data-waste="${kind}_${i}" style="text-align:right;font-size:13px;font-weight:600">-</div>
        <input type="text" id="cm_${kind}_lot_${i}" value="${escapeHtml(ing?.lotNumber||'')}" placeholder="Lot #" oninput="recomputeCompletion()" style="padding:6px 8px;border:1px solid var(--grey);border-radius:4px" />
      </div>`;
    }).join('')}
  `;
}
// Packaging rows grouped under a header for each SKU / production line.
function completionPackagingRowsHtml() {
  const list = completionMaterials.packaging;
  if (!list.length) return '<div style="font-size:12px;color:var(--brown-light);padding:6px 2px">No packaging on this formula.</div>';
  const grid = 'grid-template-columns:2fr 1fr 1fr 0.8fr 1.3fr';
  let html = '';
  let lastLine = -1;
  list.forEach((m, i) => {
    const ing = getIngredient(m.ingredientId);
    if (m.lineIndex !== lastLine) {
      const p = getProduct(m.productId);
      html += `<div style="margin:${lastLine === -1 ? '4px' : '14px'} 0 6px;padding:6px 10px;background:var(--beige-light);border-radius:6px">
        <strong style="color:var(--brown);font-size:13px">${escapeHtml(p?.sku || '')}</strong>
        <span style="font-size:12px;color:var(--brown-light)"> - ${escapeHtml(p?.name || '')}</span>
      </div>
      <div class="po-line" style="${grid};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
        <div>Packaging Item</div><div>Theoretical</div><div>Actual Used</div><div>Waste %</div><div>Lot #</div>
      </div>`;
      lastLine = m.lineIndex;
    }
    html += `<div class="po-line" style="${grid}">
      <div style="font-size:13px">${escapeHtml(ing?.name||'')} <span style="color:var(--brown-light);font-size:11px">(${escapeHtml(ing?.unit||'')})</span></div>
      <div data-theo="packaging_${i}" style="text-align:right;font-size:13px;color:var(--brown-light)">-</div>
      <input type="number" min="0" step="0.01" id="cm_packaging_qty_${i}" oninput="recomputeCompletion()" style="padding:6px 8px;border:1px solid var(--grey);border-radius:4px" />
      <div data-waste="packaging_${i}" style="text-align:right;font-size:13px;font-weight:600">-</div>
      <input type="text" id="cm_packaging_lot_${i}" value="${escapeHtml(ing?.lotNumber||'')}" placeholder="Lot #" oninput="recomputeCompletion()" style="padding:6px 8px;border:1px solid var(--grey);border-radius:4px" />
    </div>`;
  });
  return html;
}
// Live recompute: theoretical material need from current units, waste %, downstream warnings, and confirm-enable
function recomputeCompletion(poId) {
  const po = state.purchaseOrders.find(p => p.id === (poId || completionPoId));
  // current units produced per line
  const unitsByLine = po ? po.lines.map((l,i) => {
    const inp = document.getElementById('comp_qty_'+i);
    const v = inp ? parseFloat(inp.value) : NaN;
    return isNaN(v) ? l.qty : v;
  }) : [];
  // theoretical per material.
  //  - Ingredients (lineIndex omitted): sum over ALL lines of BOM qty ƒ- unitsProduced[line]
  //  - Packaging (lineIndex given): just that one SKU/line's BOM qty ƒ- unitsProduced[line]
  function theoForMaterial(ingId, lineIndex) {
    if (!po) return 0;
    if (lineIndex !== undefined && lineIndex !== null) {
      const l = po.lines[lineIndex];
      if (!l) return 0;
      const entry = (state.boms[l.productId] || []).find(b => b.ingredientId === ingId);
      return entry ? entry.qty * (unitsByLine[lineIndex] || 0) : 0;
    }
    let t = 0;
    po.lines.forEach((l, idx) => {
      const bom = state.boms[l.productId] || [];
      const entry = bom.find(b => b.ingredientId === ingId);
      if (entry) t += entry.qty * (unitsByLine[idx] || 0);
    });
    return t;
  }
  let totalTheo = 0, totalActual = 0, allFilled = true;
  // FG required fields
  if (po) po.lines.forEach((l,i) => {
    const q = document.getElementById('comp_qty_'+i);
    const lot = document.getElementById('comp_lot_'+i);
    if (!q || q.value === '' || !lot || !lot.value.trim()) allFilled = false;
  });
  ['ingredients','packaging'].forEach(kind => {
    completionMaterials[kind].forEach((m, i) => {
      const theo = kind === 'packaging' ? theoForMaterial(m.ingredientId, m.lineIndex) : theoForMaterial(m.ingredientId);
      const theoEl = document.querySelector(`[data-theo="${kind}_${i}"]`);
      const ing = getIngredient(m.ingredientId);
      if (theoEl) theoEl.textContent = theo.toFixed(2) + ' ' + (ing?.unit||'');
      const qtyInp = document.getElementById(`cm_${kind}_qty_${i}`);
      const lotInp = document.getElementById(`cm_${kind}_lot_${i}`);
      // Pre-fill Actual Used (the amount deducted from inventory) with theoretical PLUS the
      // planning waste buffer, so the default deduction already allocates for waste loss.
      // The operator can override with the real measured amount.
      if (qtyInp && qtyInp.value === '' && qtyInp.dataset.touched !== '1' && theo > 0) {
        qtyInp.value = (theo * PLANNING_LOSS_FACTOR).toFixed(2);
      }
      if (qtyInp) qtyInp.addEventListener('input', () => { qtyInp.dataset.touched = '1'; }, { once: true });
      const actual = qtyInp ? (parseFloat(qtyInp.value)||0) : 0;
      const wasteEl = document.querySelector(`[data-waste="${kind}_${i}"]`);
      if (wasteEl) {
        const wpct = theo > 0 ? ((actual - theo) / theo) * 100 : 0;
        wasteEl.textContent = (wpct>=0?'+':'') + wpct.toFixed(1) + '%';
        wasteEl.style.color = wpct > 7 ? 'var(--danger)' : (wpct > 0 ? '#a0470c' : 'var(--success)');
      }
      totalTheo += theo; totalActual += actual;
      if (!qtyInp || qtyInp.value === '' || !lotInp || !lotInp.value.trim()) allFilled = false;
    });
  });
  // overall waste
  const wasteEl = document.getElementById('comp_waste');
  if (wasteEl) {
    const overallWaste = totalTheo > 0 ? ((totalActual - totalTheo) / totalTheo) * 100 : 0;
    wasteEl.innerHTML = `<div style="background:var(--white);border:1px solid var(--grey-light);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div><span style="font-size:12px;color:var(--brown-light)">Total Theoretical</span> <strong style="color:var(--brown)">${totalTheo.toFixed(2)}</strong></div>
      <div><span style="font-size:12px;color:var(--brown-light)">Total Actual Used</span> <strong style="color:var(--brown)">${totalActual.toFixed(2)}</strong></div>
      <div><span style="font-size:12px;color:var(--brown-light)">Overall Waste Loss</span> <strong style="color:${overallWaste>7?'var(--danger)':(overallWaste>0?'#a0470c':'var(--success)')};font-size:16px">${(overallWaste>=0?'+':'')+overallWaste.toFixed(1)}%</strong></div>
    </div>`;
  }
  // confirm button enable/disable
  const btn = document.getElementById('comp_confirm_btn');
  if (btn) {
    btn.disabled = !allFilled;
    btn.title = allFilled ? '' : 'Fill in every units/lot, ingredient and packaging field first';
    btn.style.opacity = allFilled ? '1' : '0.55';
  }
  // downstream impact warning (uses planning allocations)
  if (po) {
    const simulated = { ...po, lines: po.lines.map((l, i) => ({ ...l, actualQty: unitsByLine[i] })) };
    const downstream = downstreamShortageOnFinalize(simulated);
    const target = document.getElementById('comp_impact');
    if (target) {
      target.innerHTML = downstream.length === 0 ? '' : `<div style="background:#fcd7d3;border-left:4px solid var(--danger);padding:10px 14px;border-radius:6px">
        <strong style="color:var(--danger)">&#9888; Downstream Impact: this run leaves other scheduled POs short</strong>
        <div style="font-size:12px;color:var(--brown);margin-top:6px">${downstream.map(d => `<div><strong>${escapeHtml(d.ingredient.name)}</strong> short ${d.short.toFixed(2)} ${escapeHtml(d.ingredient.unit||'')} - ${d.affected.map(p=>escapeHtml(p.id)).join(', ')}</div>`).join('')}</div>
      </div>`;
    }
  }
}

async function finalizeMarkComplete(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  // collect units + cases + lot per line
  let anyMissingLot = false;
  const draftLines = po.lines.map((l, i) => {
    const qty = parseFloat(document.getElementById('comp_qty_'+i).value);
    const cases = parseFloat(document.getElementById('comp_cases_'+i).value);
    const lot = (document.getElementById('comp_lot_'+i).value || '').trim();
    const actualQty = isNaN(qty) ? l.qty : qty;
    const casesProduced = isNaN(cases) ? 0 : cases;
    if (!lot) anyMissingLot = true;
    return {
      ...l,
      actualQty,
      casesProduced,
      lotNumber: lot
    };
  });
  // collect material usage + lots + compute theoretical and waste
  const completionNotes = (document.getElementById('comp_notes')?.value || '').trim();
  const draftPO = {
    ...po,
    lines: draftLines,
    completionNotes,
    shipping: po.shipping || { bol: '', proNumber: '', carrier: '', pallets: 0, weight: 0, length: 0, width: 0, height: 0, freightClass: '', notes: '' }
  };
  const materialsUsed = [];
  let totalTheo = 0, totalActual = 0, anyMaterialMissing = false;
  function theoForMaterial(ingId, lineIndex) {
    // Packaging passes a lineIndex (per SKU); ingredients sum across all lines.
    if (lineIndex !== undefined && lineIndex !== null) {
      const l = draftPO.lines[lineIndex];
      if (!l) return 0;
      const entry = (state.boms[l.productId] || []).find(b => b.ingredientId === ingId);
      return entry ? entry.qty * (typeof l.actualQty === 'number' ? l.actualQty : l.qty) : 0;
    }
    let t = 0;
    draftPO.lines.forEach(l => {
      const bom = state.boms[l.productId] || [];
      const entry = bom.find(b => b.ingredientId === ingId);
      if (entry) t += entry.qty * (typeof l.actualQty === 'number' ? l.actualQty : l.qty);
    });
    return t;
  }
  ['ingredients','packaging'].forEach(kind => {
    completionMaterials[kind].forEach((m, i) => {
      const qtyEl = document.getElementById(`cm_${kind}_qty_${i}`);
      const lotEl = document.getElementById(`cm_${kind}_lot_${i}`);
      const actual = qtyEl ? parseFloat(qtyEl.value) : NaN;
      const lot = lotEl ? lotEl.value.trim() : '';
      const theo = kind === 'packaging' ? theoForMaterial(m.ingredientId, m.lineIndex) : theoForMaterial(m.ingredientId);
      if (isNaN(actual) || actual === '' || !lot) anyMaterialMissing = true;
      const a = isNaN(actual) ? 0 : actual;
      const entry = { ingredientId: m.ingredientId, category: kind === 'packaging' ? 'Packaging' : 'Ingredient', theoretical: theo, actual: a, lot };
      if (kind === 'packaging') { entry.productId = m.productId; entry.lineIndex = m.lineIndex; }
      materialsUsed.push(entry);
      totalTheo += theo; totalActual += a;
    });
  });
  if (anyMissingLot) { toast('Every SKU needs a Lot #.'); return; }
  if (anyMaterialMissing) { toast('Enter Actual Used and a Lot # for every ingredient and packaging item.'); return; }

  draftPO.materialsUsed = materialsUsed;
  draftPO.wasteLossPct = totalTheo > 0 ? +(((totalActual - totalTheo) / totalTheo) * 100).toFixed(2) : 0;

  if (!requireEmployeeBackendWrite(backendProductionState)) return;
  if (!po._backendProductionRunId) return failBackendRequiredWrite(null, backendProductionState, 'This production run is not backend-backed. Nothing was saved locally.');

  // Final downstream check
  const downstream = downstreamShortageOnFinalize(draftPO);
  if (downstream.length > 0) {
    const summary = downstream.map(d => `* ${d.ingredient.name}: short ${d.short.toFixed(2)} ${d.ingredient.unit||''} (${d.affected.map(p=>p.id).join(', ')})`).join('\n');
    const ok = await openConfirmModal({
      title: 'Confirm production completion',
      record: id,
      message: 'Completing this run will leave other scheduled POs short.',
      risk: summary,
      confirmLabel: 'Complete Anyway',
      tone: 'workflow'
    });
    if (!ok) return;
  }
  try {
    await finalizeBackendProductionRun(draftPO);
    backendProductionState.status = 'connected';
    backendProductionState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendProductionState);
    return;
  }

  const alreadyDeducted = po.status === 'shipping' || po.status === 'completed';
  // sync material lot #s back to inventory items only after backend completion succeeds
  materialsUsed.forEach(m => {
    const ing = getIngredient(m.ingredientId);
    if (ing && m.lot) ing.lotNumber = m.lot;
  });
  if (!alreadyDeducted) {
    po.lines = draftLines.map(line => ({ ...line }));
    po.materialsUsed = materialsUsed.map(material => ({ ...material }));
    po.wasteLossPct = draftPO.wasteLossPct;
    po.completionNotes = completionNotes;
    po.shipping = draftPO.shipping;
    consumeInventory(po);
    // Auto-add to Finished Goods inventory ONLY for our own brands (Bnutty, Poochie Butter).
    // Nut House Co-Packing and Dilly's are made for other customers, so they don't stock to FG.
    if (FG_TRACKED_BRANDS.includes(po.brand)) {
      po.lines.forEach(line => {
        const product = getProduct(line.productId);
        if (!product) return;
        const fg = ensureFinishedGoodForProduct(product, po.brand);
        if (fg) fg.stock = (fg.stock || 0) + (typeof line.actualQty === 'number' ? line.actualQty : (line.qty || 0));
      });
    }
  }

  // auto-create lot records on Food Safety Lot Tracking
  state.lots = state.lots || [];
  po.lines.forEach(l => {
    if (!l.lotNumber) return;
    const existing = state.lots.find(x => x.lotNumber === l.lotNumber);
    if (existing) {
      // update existing
      existing.productId = l.productId;
      existing.poId = po.id;
      existing.productionDate = po.productionDate;
      existing.quantity = l.actualQty;
      existing.status = existing.status || 'Released';
    } else {
      state.lots.push({
        id: uid('lt'),
        lotNumber: l.lotNumber,
        productId: l.productId,
        poId: po.id,
        productionDate: po.productionDate,
        quantity: l.actualQty,
        status: 'Released'
      });
    }
  });

  // Production finalized -> goes to QA Review (not directly to Shipping). Already-shipped/completed POs stay where they are.
  if (po.status !== 'shipping' && po.status !== 'completed') po.status = 'qa_review';
  po.productionFinalized = true;
  po.completedAt = new Date().toISOString();
  po.shipping = po.shipping || { bol: '', proNumber: '', carrier: '', pallets: 0, weight: 0, length: 0, width: 0, height: 0, freightClass: '', notes: '' };
  logProduction(po); // auto-create / refresh the Production Log entry

  saveState();
  closeModal();
  const fgBump = !alreadyDeducted && FG_TRACKED_BRANDS.includes(po.brand) ? `, ${po.brand} FG stock added` : '';
  toast(`${id} completed. Waste loss ${(po.wasteLossPct>=0?'+':'')+po.wasteLossPct}%${alreadyDeducted ? '' : ', inventory updated'}${fgBump}. Logged to Production Log. Awaiting QA.`);
  router('quality-assurance');
}

// Edit Actual / Lot # AFTER production has been finalized - adjusts saved values + lot tracking
function editProductionValues(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  openModal(`Edit Production Values - ${po.id}`, `
    <div style="margin-bottom:10px">
      <strong>${escapeHtml(getCustomer(po.customerId)?.name||'')}</strong>
      <div style="font-size:12px;color:var(--brown-light)">${po.brand ? escapeHtml(po.brand)+' &middot; ' : ''}${po.productionDate ? 'Production: '+fmtDate(po.productionDate) : ''}</div>
    </div>
    <div style="background:var(--beige-light);padding:10px;border-radius:6px;margin-bottom:14px;font-size:12px;color:var(--brown)">
      Adjust the units produced, cases produced, or lot # for each SKU. Lot Tracking on the Food Safety page is updated automatically. <strong>Note:</strong> editing here does not auto-adjust inventory - if quantities changed significantly, manually adjust ingredient stock on the Inventory page.
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>SKU / Product</th>
        <th style="width:80px">Ordered</th>
        <th style="width:110px">Units Produced</th>
        <th style="width:110px">Cases Produced</th>
        <th style="width:160px">Lot #</th>
      </tr></thead>
      <tbody>
        ${po.lines.map((l, i) => {
          const p = getProduct(l.productId);
          const units = (typeof l.actualQty === 'number') ? l.actualQty : l.qty;
          const cases = (typeof l.casesProduced === 'number') ? l.casesProduced : '';
          const lot = l.lotNumber || '';
          return `<tr>
            <td>
              <div><strong>${escapeHtml(p?.sku || '')}</strong></div>
              <div style="font-size:12px;color:var(--brown-light)">${escapeHtml(p?.name || '')}</div>
            </td>
            <td>${l.qty}</td>
            <td><input type="number" min="0" id="ev_qty_${i}" value="${units}" style="width:100%;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /></td>
            <td><input type="number" min="0" id="ev_cases_${i}" value="${cases}" placeholder="0" style="width:100%;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /></td>
            <td>
              <div style="display:flex;gap:4px">
                <input type="text" id="ev_lot_${i}" value="${escapeHtml(lot)}" placeholder="Lot #" style="flex:1;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" />
                <button type="button" class="btn btn-icon btn-sm" title="Generate next lot #" onclick="document.getElementById('ev_lot_${i}').value='${nextLotNumber()}';">&#8635;</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveProductionValues('${po.id}')">Save Changes</button>
    </div>
  `);
}

function saveProductionValues(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  if (employeeBackendSessionActive()) {
    failBackendRequiredWrite(null, backendProductionState, 'Production value edits require backend correction support. Nothing was saved locally.');
    return;
  }
  state.lots = state.lots || [];
  let changed = 0;
  po.lines.forEach((l, i) => {
    const newQty = parseFloat(document.getElementById('ev_qty_'+i).value);
    const newCases = parseFloat(document.getElementById('ev_cases_'+i).value);
    const newLot = (document.getElementById('ev_lot_'+i).value || '').trim();
    const oldLot = l.lotNumber || '';
    const oldActual = l.actualQty;
    const oldCases = l.casesProduced;
    if (!isNaN(newQty)) l.actualQty = newQty;
    l.casesProduced = isNaN(newCases) ? 0 : newCases;
    l.lotNumber = newLot;

    if (oldActual !== l.actualQty || oldCases !== l.casesProduced || oldLot !== newLot) changed++;

    // sync Lot Tracking entries
    if (oldLot && oldLot !== newLot) {
      // user renamed the lot - update existing entry by old lot # (if found) or by PO+product
      const existing = state.lots.find(x => x.lotNumber === oldLot && x.poId === po.id);
      if (existing) {
        if (newLot) {
          existing.lotNumber = newLot;
          existing.quantity = l.actualQty;
          existing.productionDate = po.productionDate;
        } else {
          // lot # cleared - drop the lot record
          state.lots = state.lots.filter(x => x !== existing);
        }
      } else if (newLot) {
        // no prior entry, add fresh
        state.lots.push({
          id: uid('lt'),
          lotNumber: newLot,
          productId: l.productId,
          poId: po.id,
          productionDate: po.productionDate,
          quantity: l.actualQty,
          status: 'Released'
        });
      }
    } else if (newLot) {
      // lot # unchanged or first time set - make sure a record exists
      let existing = state.lots.find(x => x.lotNumber === newLot && x.poId === po.id);
      if (!existing) {
        state.lots.push({
          id: uid('lt'),
          lotNumber: newLot,
          productId: l.productId,
          poId: po.id,
          productionDate: po.productionDate,
          quantity: l.actualQty,
          status: 'Released'
        });
      } else {
        existing.quantity = l.actualQty;
        existing.productionDate = po.productionDate;
      }
    }
  });
  saveState();
  closeModal();
  // re-open the View PO so they see the updated values
  viewPO(id);
  toast(changed ? `${id} updated.` : 'No changes.');
}

