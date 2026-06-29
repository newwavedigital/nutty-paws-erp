/* =========================================================================
   MACHINERY (Maintenance Schedule + Equipment Issues Log)
   ========================================================================= */
const MAINT_TYPES = ['Preventive', 'Predictive', 'Corrective', 'Calibration', 'Inspection'];
const MAINT_FREQUENCIES = ['One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
const MAINT_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Overdue'];
const EQUIPMENT_LIST = ['Roaster #1', 'Roaster #2', 'Grinder / Mill', 'Mixer / Blender', 'Filler #1', 'Filler #2', 'Filler #3', 'Capper', 'Labeler', 'Metal Detector - Line 1', 'Metal Detector - Line 2', 'Squeeze Pack Machine', 'Conveyor - Main', 'Palletizer', 'Boiler', 'Compressor', 'Other'];
function maintTypeColor(t) {
  switch(t) {
    case 'Preventive': return 'var(--success)';
    case 'Predictive': return 'var(--orange)';
    case 'Corrective': return 'var(--danger)';
    case 'Calibration': return '#1e6fb8';
    case 'Inspection': return 'var(--brown)';
    default: return 'var(--grey)';
  }
}
let machineryTab = 'maintenance';
function setMachineryTab(t) { machineryTab = t; renderMachinery(document.getElementById('content')); }
let maintMonth = new Date(); maintMonth.setDate(1);

function renderMachinery(el) {
  if (!a10DataRecordState.machinery.loaded && !a10DataRecordState.machinery.loading) {
    refreshA10DataRecordModule('machinery').then(() => { if (currentPage === 'machinery') router('machinery'); }).catch(() => {});
  }
  el.innerHTML = `
    ${renderA10DataRecordBanner('machinery')}
    <div class="card">
      <div class="tabs">
        <button class="tab ${machineryTab==='maintenance'?'active':''}" onclick="setMachineryTab('maintenance')">Maintenance Schedule <span class="tab-count">${(state.maintenanceEvents||[]).length}</span></button>
        <button class="tab ${machineryTab==='issues'?'active':''}" onclick="setMachineryTab('issues')">Equipment Issues Log <span class="tab-count">${(state.equipmentIssues||[]).length}</span></button>
      </div>
      <div id="machineryBody" style="margin-top:14px"></div>
    </div>
  `;
  const body = document.getElementById('machineryBody');
  if (machineryTab === 'issues') renderEquipmentIssues(body);
  else renderMaintenanceSchedule(body);
}

/* ----- Maintenance Schedule (calendar) ----- */
function renderMaintenanceSchedule(el) {
  const events = (state.maintenanceEvents||[]).slice();
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = events.filter(e => e.status !== 'Completed').sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  el.innerHTML = `
    <div class="cal-toolbar">
      <button class="btn btn-secondary btn-sm" onclick="maintNav(-1)">&laquo; Prev</button>
      <div class="cal-month-label" id="maintCalLabel"></div>
      <button class="btn btn-secondary btn-sm" onclick="maintNav(1)">Next &raquo;</button>
      <button class="btn btn-secondary btn-sm" onclick="maintToToday()">Today</button>
      <div style="flex:1"></div>
      <div class="room-legend">
        ${MAINT_TYPES.map(t=>`<span class="room-chip"><span class="room-dot" style="background:${maintTypeColor(t)}"></span>${t}</span>`).join('')}
      </div>
      <button class="btn" onclick="editMaintenanceEvent()">+ Schedule Maintenance</button>
    </div>
    <div id="maintCalendar" class="calendar"></div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h2>Upcoming &amp; Overdue Maintenance</h2>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('maintenance.csv', state.maintenanceEvents.map(e=>({equipment:e.equipment,type:e.type,date:e.date,frequency:e.frequency,technician:e.technician,est_hours:e.estimatedHours,loto:e.lotoRequired?'Yes':'No',priority:e.priority,status:e.status,tasks:e.tasks})))">Export CSV</button>
      </div>
      ${upcoming.length === 0 ? '<div class="empty">No upcoming maintenance scheduled.</div>' :
        `<div class="table-wrap"><table>
          <thead><tr><th>Equipment</th><th>Type</th><th>Date</th><th>Frequency</th><th>Technician</th><th>Est. Hrs</th><th>LOTO</th><th>Priority</th><th>Status</th><th></th></tr></thead>
          <tbody>
          ${upcoming.map(e => {
            const overdue = e.date && new Date(e.date+'T00:00:00') < today && e.status !== 'Completed';
            return `<tr>
              <td><strong>${escapeHtml(e.equipment||'')}</strong></td>
              <td><span class="room-dot" style="display:inline-block;background:${maintTypeColor(e.type)}"></span> ${escapeHtml(e.type||'')}</td>
              <td>${fmtDate(e.date)}${overdue?' <span class="badge badge-low">Overdue</span>':''}</td>
              <td>${escapeHtml(e.frequency||'')}</td>
              <td>${escapeHtml(e.technician||'')}</td>
              <td>${e.estimatedHours||'-'}</td>
              <td>${e.lotoRequired ? '<span class="badge badge-low">LOTO</span>' : '-'}</td>
              <td><span class="badge ${e.priority==='High'?'sev-high':e.priority==='Medium'?'sev-med':'sev-low'}">${escapeHtml(e.priority||'')}</span></td>
              <td><span class="badge ${e.status==='Completed'?'badge-prod':e.status==='In Progress'?'badge-pending':e.status==='Overdue'?'badge-low':'badge-supply'}">${escapeHtml(e.status||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editMaintenanceEvent('${e.id}')">Edit</button>
                ${e.status!=='Completed' ? `<button class="btn btn-icon btn-sm" onclick="completeMaintenance('${e.id}')">Complete</button>` : ''}
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteMaintenance('${e.id}')">Delete</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table></div>`
      }
    </div>
  `;
  drawMaintCalendar();
}
function maintNav(dir) { maintMonth.setMonth(maintMonth.getMonth()+dir); drawMaintCalendar(); }
function maintToToday() { maintMonth = new Date(); maintMonth.setDate(1); drawMaintCalendar(); }
function drawMaintCalendar() {
  const lbl = document.getElementById('maintCalLabel');
  if (lbl) lbl.textContent = maintMonth.toLocaleDateString('en-US', { month:'long', year:'numeric' });
  const cal = document.getElementById('maintCalendar');
  if (!cal) return;
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  const first = new Date(maintMonth.getFullYear(), maintMonth.getMonth(), 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(maintMonth.getFullYear(), maintMonth.getMonth()+1, 0).getDate();
  const prevDays = new Date(maintMonth.getFullYear(), maintMonth.getMonth(), 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const events = {};
  (state.maintenanceEvents||[]).forEach(e => {
    if (!e.date) return;
    const start = new Date(e.date+'T00:00:00');
    const end = new Date((e.endDate||e.date)+'T00:00:00');
    if (isNaN(start)||isNaN(end)) return;
    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
      const ds = d.toISOString().slice(0,10);
      (events[ds]=events[ds]||[]).push(e);
    }
  });
  const totalCells = Math.ceil((startWeekday+daysInMonth)/7)*7;
  for (let i=0;i<totalCells;i++) {
    let dayNum, mDate, muted=false;
    if (i<startWeekday) { dayNum = prevDays-startWeekday+1+i; mDate=new Date(maintMonth.getFullYear(),maintMonth.getMonth()-1,dayNum); muted=true; }
    else if (i>=startWeekday+daysInMonth) { dayNum=i-startWeekday-daysInMonth+1; mDate=new Date(maintMonth.getFullYear(),maintMonth.getMonth()+1,dayNum); muted=true; }
    else { dayNum=i-startWeekday+1; mDate=new Date(maintMonth.getFullYear(),maintMonth.getMonth(),dayNum); }
    const ds = mDate.toISOString().slice(0,10);
    const isToday = mDate.getTime()===today.getTime();
    const evts = events[ds]||[];
    html += `<div class="cal-day ${muted?'muted':''} ${isToday?'today':''}" onclick="maintDayClick('${ds}')">
      <div class="num">${dayNum}</div>
      ${evts.map(e => `<div class="cal-event" style="background:${maintTypeColor(e.type)}" onclick="event.stopPropagation();editMaintenanceEvent('${e.id}')" title="${escapeHtml(e.equipment||'')} - ${escapeHtml(e.type||'')}"><span class="cal-event-name">${escapeHtml((e.equipment||'').slice(0,18))}</span><span class="cal-event-po">${escapeHtml(e.type||'')}</span></div>`).join('')}
    </div>`;
  }
  cal.innerHTML = html;
}
function maintDayClick(ds) { editMaintenanceEvent(null, ds); }
function editMaintenanceEvent(id, presetDate) {
  const e = (state.maintenanceEvents||[]).find(x=>x.id===id) || { id: uid('mt'), equipment:'', type:'Preventive', date: presetDate || new Date().toISOString().slice(0,10), endDate:'', frequency:'Monthly', technician:'', estimatedHours:'', lotoRequired:false, priority:'Medium', tasks:'', parts:'', status:'Scheduled', completedDate:'', notes:'' };
  const isNew = !id;
  openModal((isNew?'Schedule':'Edit')+' Maintenance', `
    <form onsubmit="event.preventDefault();saveMaintenance('${e.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Equipment</label>
          <select id="mt_equipment" required>
            <option value="">- Select -</option>
            ${EQUIPMENT_LIST.map(eq=>`<option ${e.equipment===eq?'selected':''}>${escapeHtml(eq)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Maintenance Type</label>
          <select id="mt_type">${MAINT_TYPES.map(t=>`<option ${e.type===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Date</label><input type="date" id="mt_date" value="${e.date||''}" required oninput="document.getElementById('mt_enddate').min=this.value" /></div>
        <div class="form-row"><label>End Date (multi-day)</label><input type="date" id="mt_enddate" value="${e.endDate||''}" min="${e.date||''}" /></div>
        <div class="form-row"><label>Frequency</label>
          <select id="mt_freq">${MAINT_FREQUENCIES.map(f=>`<option ${e.frequency===f?'selected':''}>${f}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Assigned Technician</label><input id="mt_tech" value="${escapeHtml(e.technician||'')}" /></div>
        <div class="form-row"><label>Est. Downtime (hrs)</label><input type="number" step="0.5" min="0" id="mt_hours" value="${e.estimatedHours||''}" /></div>
        <div class="form-row"><label>Priority</label>
          <select id="mt_priority"><option ${e.priority==='Low'?'selected':''}>Low</option><option ${e.priority==='Medium'?'selected':''}>Medium</option><option ${e.priority==='High'?'selected':''}>High</option></select>
        </div>
        <div class="form-row"><label>Status</label>
          <select id="mt_status">${MAINT_STATUSES.map(st=>`<option ${e.status===st?'selected':''}>${st}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Lockout / Tagout (LOTO)</label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--grey);border-radius:5px;background:var(--white);cursor:pointer">
            <input type="checkbox" id="mt_loto" ${e.lotoRequired?'checked':''} style="width:16px;height:16px" />
            <span style="font-size:14px;color:var(--brown)">LOTO required</span>
          </label>
        </div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Tasks / Checklist</label>
        <textarea id="mt_tasks" rows="3" placeholder="e.g. Clean burners, inspect belt tension, lubricate bearings, verify calibration...">${escapeHtml(e.tasks||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Parts / Materials Needed</label>
        <input id="mt_parts" value="${escapeHtml(e.parts||'')}" placeholder="e.g. Belt, filter, gasket kit" />
      </div>
      <div class="form-row" style="margin-top:10px"><label>Notes</label>
        <textarea id="mt_notes">${escapeHtml(e.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Schedule':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveMaintenance(id, isNew) {
  const start = document.getElementById('mt_date').value;
  const end = document.getElementById('mt_enddate').value || start;
  if (end && start && end < start) { toast('End date must be on or after start date.'); return; }
  const data = {
    id,
    equipment: document.getElementById('mt_equipment').value,
    type: document.getElementById('mt_type').value,
    date: start,
    endDate: end,
    frequency: document.getElementById('mt_freq').value,
    technician: document.getElementById('mt_tech').value,
    estimatedHours: parseFloat(document.getElementById('mt_hours').value) || '',
    lotoRequired: document.getElementById('mt_loto').checked,
    priority: document.getElementById('mt_priority').value,
    status: document.getElementById('mt_status').value,
    tasks: document.getElementById('mt_tasks').value,
    parts: document.getElementById('mt_parts').value,
    notes: document.getElementById('mt_notes').value,
    completedDate: (state.maintenanceEvents||[]).find(x=>x.id===id)?.completedDate || ''
  };
  if (!data.equipment) { toast('Equipment required.'); return; }
  const existing = (state.maintenanceEvents || []).find(x=>x.id===id);
  try {
    await saveA10DataRecord('machinery', 'maintenance', { ...data, kind: 'maintenance', title: `${data.equipment} ${data.type}`.trim() }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    router('machinery');
    toast('Maintenance saved.');
  } catch (err) {
    toast(err.message || 'Maintenance could not be saved.');
  }
}
async function completeMaintenance(id) {
  const e = (state.maintenanceEvents||[]).find(x=>x.id===id);
  if (!e) return;
  try {
    await saveA10DataRecord('machinery', 'maintenance', { ...e, kind: 'maintenance', status: 'Completed', completedDate: new Date().toISOString().slice(0,10) }, { recordId: e._backendId || id });
    router('machinery');
    toast('Maintenance marked complete.');
  } catch (err) {
    toast(err.message || 'Maintenance completion could not be saved.');
  }
}
async function deleteMaintenance(id) {
  const ok = await openConfirmModal({ title: 'Delete maintenance event', record: id, message: 'Delete this maintenance event?', risk: 'This removes the local maintenance schedule row.', confirmLabel: 'Delete Event', tone: 'danger' });
  if (!ok) return;
  const row = (state.maintenanceEvents || []).find(x=>x.id===id);
  try {
    await archiveA10DataRecord('machinery', row?._backendId || id);
    router('machinery');
  } catch (err) {
    toast(err.message || 'Maintenance event could not be deleted.');
  }
}

/* ----- Equipment Issues Log (SQF) ----- */
function renderEquipmentIssues(el) {
  const issues = (state.equipmentIssues||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  el.innerHTML = `
    <div class="card-header">
      <h2>Equipment Issues Log</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('equipment_issues.csv', state.equipmentIssues.map(e=>({date:e.date,equipment:e.equipment,reported_by:e.reportedBy,severity:e.severity,food_safety_risk:e.foodSafetyRisk?'Yes':'No',risk_type:e.riskType,description:e.description,immediate_action:e.immediateAction,root_cause:e.rootCause,corrective_action:e.correctiveAction,parts:e.partsReplaced,downtime_hrs:e.downtimeHours,affected_lots:e.affectedLots,status:e.status,resolved:e.resolvedDate,verified_by:e.verifiedBy})))">Export CSV</button>
        <button class="btn" onclick="editEquipmentIssue()">+ Log Issue</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">SQF requires equipment issues that could affect food safety (metal/glass/plastic fragments, lubricant contamination, etc.) to be logged, with affected product traced and corrective action verified.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Equipment</th><th>Issue</th><th>Severity</th><th>Food Safety Risk</th><th>Affected Lots</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${issues.length === 0 ? `<tr><td colspan="8" class="empty">No equipment issues logged.</td></tr>` :
          issues.map(e => `
            <tr>
              <td>${fmtDate(e.date)}</td>
              <td><strong>${escapeHtml(e.equipment||'')}</strong></td>
              <td style="max-width:260px;font-size:12px">${escapeHtml(e.description||'')}</td>
              <td><span class="badge ${e.severity==='Critical'||e.severity==='High'?'sev-high':e.severity==='Medium'?'sev-med':'sev-low'}">${escapeHtml(e.severity||'')}</span></td>
              <td>${e.foodSafetyRisk ? `<span class="badge badge-low">&#9888; ${escapeHtml(e.riskType||'Yes')}</span>` : '<span style="font-size:12px;color:var(--brown-light)">No</span>'}</td>
              <td style="font-size:12px">${escapeHtml(e.affectedLots||'-')}</td>
              <td><span class="badge ${e.status==='Resolved'?'badge-prod':e.status==='In Progress'?'badge-pending':'badge-low'}">${escapeHtml(e.status||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editEquipmentIssue('${e.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteEquipmentIssue('${e.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table></div>
  `;
}
function editEquipmentIssue(id) {
  const e = (state.equipmentIssues||[]).find(x=>x.id===id) || { id: uid('eq'), date: new Date().toISOString().slice(0,10), equipment:'', reportedBy:'', description:'', severity:'Medium', foodSafetyRisk:false, riskType:'None', immediateAction:'', rootCause:'', correctiveAction:'', partsReplaced:'', downtimeHours:'', affectedLots:'', status:'Open', resolvedDate:'', verifiedBy:'' };
  const isNew = !id;
  const riskTypes = ['None','Metal fragment','Glass/Brittle plastic','Lubricant/Oil','Wood','Chemical','Other'];
  openModal((isNew?'Log':'Edit')+' Equipment Issue', `
    <form onsubmit="event.preventDefault();saveEquipmentIssue('${e.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Date Reported</label><input type="date" id="eq_date" value="${e.date||''}" required /></div>
        <div class="form-row"><label>Equipment</label>
          <select id="eq_equipment" required>
            <option value="">- Select -</option>
            ${EQUIPMENT_LIST.map(eq=>`<option ${e.equipment===eq?'selected':''}>${escapeHtml(eq)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Reported By</label><input id="eq_reportedby" value="${escapeHtml(e.reportedBy||'')}" /></div>
        <div class="form-row"><label>Severity</label>
          <select id="eq_severity"><option ${e.severity==='Low'?'selected':''}>Low</option><option ${e.severity==='Medium'?'selected':''}>Medium</option><option ${e.severity==='High'?'selected':''}>High</option><option ${e.severity==='Critical'?'selected':''}>Critical</option></select>
        </div>
        <div class="form-row"><label>Food Safety Risk?</label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--grey);border-radius:5px;background:var(--white);cursor:pointer">
            <input type="checkbox" id="eq_fsrisk" ${e.foodSafetyRisk?'checked':''} onchange="document.getElementById('eq_risktype_row').style.display=this.checked?'flex':'none'" style="width:16px;height:16px" />
            <span style="font-size:14px;color:var(--brown)">Could contaminate product</span>
          </label>
        </div>
        <div class="form-row" id="eq_risktype_row" style="display:${e.foodSafetyRisk?'flex':'none'}"><label>Contamination Type</label>
          <select id="eq_risktype">${riskTypes.map(t=>`<option ${e.riskType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Downtime (hrs)</label><input type="number" step="0.5" min="0" id="eq_downtime" value="${e.downtimeHours||''}" /></div>
        <div class="form-row"><label>Status</label>
          <select id="eq_status"><option ${e.status==='Open'?'selected':''}>Open</option><option ${e.status==='In Progress'?'selected':''}>In Progress</option><option ${e.status==='Resolved'?'selected':''}>Resolved</option></select>
        </div>
        <div class="form-row"><label>Resolved Date</label><input type="date" id="eq_resolved" value="${e.resolvedDate||''}" /></div>
        <div class="form-row"><label>Verified By (QA)</label><input id="eq_verifiedby" value="${escapeHtml(e.verifiedBy||'')}" /></div>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Issue Description</label>
        <textarea id="eq_description" rows="2" required>${escapeHtml(e.description||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Immediate Action Taken</label>
        <textarea id="eq_immediate" rows="2" placeholder="e.g. Line stopped, product segregated, equipment tagged out...">${escapeHtml(e.immediateAction||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Affected Lots / Products (traceability)</label>
        <input id="eq_lots" value="${escapeHtml(e.affectedLots||'')}" placeholder="Lot #s of product run on this equipment" />
      </div>
      <div class="form-row" style="margin-top:10px"><label>Root Cause</label>
        <textarea id="eq_rootcause">${escapeHtml(e.rootCause||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Corrective Action</label>
        <textarea id="eq_corrective">${escapeHtml(e.correctiveAction||'')}</textarea>
      </div>
      <div class="form-row" style="margin-top:10px"><label>Parts Replaced</label>
        <input id="eq_parts" value="${escapeHtml(e.partsReplaced||'')}" />
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Issue':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveEquipmentIssue(id, isNew) {
  const fsRisk = document.getElementById('eq_fsrisk').checked;
  const data = {
    id,
    date: document.getElementById('eq_date').value,
    equipment: document.getElementById('eq_equipment').value,
    reportedBy: document.getElementById('eq_reportedby').value,
    description: document.getElementById('eq_description').value,
    severity: document.getElementById('eq_severity').value,
    foodSafetyRisk: fsRisk,
    riskType: fsRisk ? document.getElementById('eq_risktype').value : 'None',
    immediateAction: document.getElementById('eq_immediate').value,
    rootCause: document.getElementById('eq_rootcause').value,
    correctiveAction: document.getElementById('eq_corrective').value,
    partsReplaced: document.getElementById('eq_parts').value,
    downtimeHours: parseFloat(document.getElementById('eq_downtime').value) || '',
    affectedLots: document.getElementById('eq_lots').value,
    status: document.getElementById('eq_status').value,
    resolvedDate: document.getElementById('eq_resolved').value,
    verifiedBy: document.getElementById('eq_verifiedby').value
  };
  if (!data.equipment) { toast('Equipment required.'); return; }
  const existing = (state.equipmentIssues || []).find(x=>x.id===id);
  try {
    await saveA10DataRecord('machinery', 'issue', { ...data, kind: 'issue', title: `${data.equipment} ${data.description}`.trim() }, { recordId: isNew ? null : (existing?._backendId || id) });
    closeModal();
    router('machinery');
    toast('Equipment issue saved.');
  } catch (err) {
    toast(err.message || 'Equipment issue could not be saved.');
  }
}
async function deleteEquipmentIssue(id) {
  const ok = await openConfirmModal({ title: 'Delete equipment issue', record: id, message: 'Delete this equipment issue?', risk: 'This removes the local equipment issue row.', confirmLabel: 'Delete Issue', tone: 'danger' });
  if (!ok) return;
  const row = (state.equipmentIssues || []).find(x=>x.id===id);
  try {
    await archiveA10DataRecord('machinery', row?._backendId || id);
    router('machinery');
  } catch (err) {
    toast(err.message || 'Equipment issue could not be deleted.');
  }
}

