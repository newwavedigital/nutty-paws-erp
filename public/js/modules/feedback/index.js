const FEEDBACK_TYPES = ['Bug / Error', 'Feature Request', 'General Feedback', 'Question'];
const FEEDBACK_STATUSES = ['Open', 'Reviewed', 'In Progress', 'Resolved', "Won't Do"];
let pendingFeedbackFile = null;
function feedbackStatusClass(s) {
  switch(s) {
    case 'Open': return 'badge-low';
    case 'Reviewed': return 'badge-supply';
    case 'In Progress': return 'badge-pending';
    case 'Resolved': return 'badge-prod';
    case "Won't Do": return 'badge-complete';
    default: return 'badge-complete';
  }
}
function renderFeedback(el) {
  if (!a10DataRecordState.feedback.loaded && !a10DataRecordState.feedback.loading) {
    refreshA10DataRecordModule('feedback').then(() => { if (currentPage === 'feedback') router('feedback'); }).catch(() => {});
  }
  const items = (state.feedback || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  el.innerHTML = `
    ${renderA10DataRecordBanner('feedback')}
    <div class="card">
      <div class="card-header">
        <h2>Submit Feedback</h2>
      </div>
      <div class="help-text" style="margin-bottom:10px">Submit a bug report, feature request, or any general feedback. Submissions are saved here so the team can review and respond.</div>
      <form onsubmit="event.preventDefault();submitFeedback()">
        <div class="form-grid">
          <div class="form-row"><label>Your Name</label><input id="fb_name" value="${escapeHtml(state.users?.[0]?.name||'')}" required /></div>
          <div class="form-row"><label>Email</label><input type="email" id="fb_email" value="${escapeHtml(state.users?.[0]?.email||'')}" /></div>
          <div class="form-row"><label>Type</label>
            <select id="fb_type">
              ${FEEDBACK_TYPES.map(t => `<option>${escapeHtml(t)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Title</label><input id="fb_title" required placeholder="Short summary" /></div>
        </div>
        <div class="form-row" style="margin-top:14px">
          <label>Description</label>
          <textarea id="fb_desc" rows="5" required placeholder="Describe the issue, idea, or feedback in as much detail as possible. If reporting a bug, include the steps to reproduce."></textarea>
        </div>
        <div class="form-row" style="margin-top:14px">
          <label>Attach File (optional)</label>
          <div class="file-upload">
            <input type="file" id="fb_file_input" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" onchange="feedbackFileSelected(event)" />
            <div class="file-info" id="fb_file_info">Screenshots help a lot for bug reports. Max 5 MB.</div>
            <button type="button" class="btn btn-icon btn-sm" id="fb_file_clear" onclick="clearFeedbackFile()" style="display:none">Remove</button>
          </div>
          <input type="hidden" id="fb_file_data" value="" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="resetFeedbackForm()">Clear</button>
          <button type="submit" class="btn">Submit Feedback</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Submitted Feedback</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('feedback.csv', state.feedback||[])">Export CSV</button>
          <span style="font-size:13px;color:var(--brown-light);align-self:center">${items.length} submission(s)</span>
        </div>
      </div>
      ${items.length === 0
        ? '<div class="empty">No feedback submitted yet.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr>
              <th>Date</th><th>Submitted By</th><th>Type</th><th>Title</th><th>Attachment</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              ${items.map(f => `
                <tr>
                  <td>${fmtDate(f.date)}</td>
                  <td>
                    <div>${escapeHtml(f.submittedBy||'-')}</div>
                    ${f.email ? `<div style="font-size:11px;color:var(--brown-light)">${escapeHtml(f.email)}</div>` : ''}
                  </td>
                  <td><span class="pill">${escapeHtml(f.type||'')}</span></td>
                  <td><strong>${escapeHtml(f.title||'')}</strong></td>
                  <td>${f.attachment
                    ? `<a href="${f.attachment.fileId ? '/api/files/'+encodeURIComponent(f.attachment.fileId)+'/download' : (f.attachment.dataUrl || '#')}" download="${escapeHtml(f.attachment.name)}" style="color:var(--orange);font-size:12px;text-decoration:none">&#128206; ${escapeHtml(f.attachment.name.length>16?f.attachment.name.slice(0,14)+'..':f.attachment.name)}</a>`
                    : '<span style="font-size:12px;color:var(--brown-light)">-</span>'
                  }</td>
                  <td>
                    <select onchange="updateFeedbackStatus('${f.id}', this.value)" style="font-size:12px;padding:4px 6px;border:1px solid var(--grey);border-radius:4px;background:var(--white)">
                      ${FEEDBACK_STATUSES.map(s => `<option ${f.status===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
                    </select>
                  </td>
                  <td class="row-actions">
                    <button class="btn btn-icon btn-sm" onclick="viewFeedback('${f.id}')">View</button>
                    <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteFeedback('${f.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}
function feedbackFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  pendingFeedbackFile = f;
  document.getElementById('fb_file_data').value = JSON.stringify({ name: f.name, type: f.type, size: f.size });
  const info = document.getElementById('fb_file_info');
  info.innerHTML = `&#128206; ${escapeHtml(f.name)} (${Math.round(f.size/1024)} KB)`;
  info.classList.add('has');
  document.getElementById('fb_file_clear').style.display = 'inline-flex';
}
function clearFeedbackFile() {
  pendingFeedbackFile = null;
  document.getElementById('fb_file_data').value = '';
  document.getElementById('fb_file_input').value = '';
  const info = document.getElementById('fb_file_info');
  info.textContent = 'Screenshots help a lot for bug reports. Max 5 MB.';
  info.classList.remove('has');
  document.getElementById('fb_file_clear').style.display = 'none';
}
function resetFeedbackForm() {
  document.getElementById('fb_title').value = '';
  document.getElementById('fb_desc').value = '';
  clearFeedbackFile();
}
async function submitFeedback() {
  let attachment = null;
  const fileDataStr = document.getElementById('fb_file_data').value;
  if (fileDataStr) { try { attachment = JSON.parse(fileDataStr); } catch(e){} }
  const data = {
    id: uid('fb'),
    date: new Date().toISOString().slice(0,10),
    submittedBy: document.getElementById('fb_name').value,
    email: document.getElementById('fb_email').value,
    type: document.getElementById('fb_type').value,
    title: document.getElementById('fb_title').value,
    description: document.getElementById('fb_desc').value,
    attachment,
    status: 'Open',
    submittedAt: new Date().toISOString()
  };
  try {
    let saved = await saveA10DataRecord('feedback', feedbackKindForType(data.type), data);
    if (pendingFeedbackFile) {
      const uploaded = await uploadA10FileReference('feedback', saved.id, 'feedback_attachment', pendingFeedbackFile);
      saved = await saveA10DataRecord('feedback', feedbackKindForType(data.type), {
        ...data,
        attachment: { name: pendingFeedbackFile.name, type: pendingFeedbackFile.type, size: pendingFeedbackFile.size, fileId: uploaded.id },
        fileIds: [uploaded.id]
      }, { recordId: saved.id });
      pendingFeedbackFile = null;
    }
    router('feedback');
    toast('Thanks! Feedback submitted.');
  } catch (err) {
    toast(err.message || 'Feedback could not be saved to the backend.');
  }
}
function feedbackKindForType(type) {
  if (type === 'Bug / Error') return 'bug';
  if (type === 'Feature Request') return 'feature';
  return 'general';
}
async function updateFeedbackStatus(id, status) {
  const f = (state.feedback || []).find(x => x.id === id);
  if (!f) return;
  try {
    await saveA10DataRecord('feedback', feedbackKindForType(f.type), { ...f, status }, { recordId: f._backendId || id });
    toast('Status updated.');
  } catch (err) {
    toast(err.message || 'Feedback status could not be saved.');
    router('feedback');
  }
}
async function deleteFeedback(id) {
  const ok = await openConfirmModal({
    title: 'Delete feedback',
    record: id,
    message: 'Delete this feedback submission?',
    risk: 'This removes the local feedback record.',
    confirmLabel: 'Delete Feedback',
    tone: 'danger'
  });
  if (!ok) return;
  const feedback = (state.feedback || []).find(f => f.id === id);
  try {
    await archiveA10DataRecord('feedback', feedback?._backendId || id);
    router('feedback');
  } catch (err) {
    toast(err.message || 'Feedback could not be deleted from the backend.');
  }
}
function viewFeedback(id) {
  const f = (state.feedback || []).find(x => x.id === id);
  if (!f) return;
  openModal(escapeHtml(f.title || 'Feedback'), `
    <div style="margin-bottom:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:600">${escapeHtml(f.submittedBy||'-')}</div>
        ${f.email ? `<div style="font-size:12px;color:var(--brown-light)">${escapeHtml(f.email)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase">Submitted</div>
        <div>${fmtDate(f.date)}</div>
      </div>
    </div>
    <div style="margin-bottom:10px">
      <span class="pill">${escapeHtml(f.type||'')}</span>
      <span class="badge ${feedbackStatusClass(f.status)}" style="margin-left:6px">${escapeHtml(f.status||'')}</span>
    </div>
    <div style="background:var(--beige-light);padding:14px;border-radius:6px;white-space:pre-wrap;font-size:14px;color:var(--black)">${escapeHtml(f.description||'')}</div>
    ${f.attachment ? `
      <div style="margin-top:14px">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600;margin-bottom:6px">Attachment</div>
        ${f.attachment.type && f.attachment.type.startsWith('image/')
          ? `<a href="${f.attachment.fileId ? '/api/files/'+encodeURIComponent(f.attachment.fileId)+'/download' : (f.attachment.dataUrl || '#')}" target="_blank" style="display:inline-block">${f.attachment.dataUrl ? `<img src="${f.attachment.dataUrl}" alt="${escapeHtml(f.attachment.name)}" style="max-width:100%;max-height:300px;border:1px solid var(--grey-light);border-radius:6px" />` : '&#128206; '+escapeHtml(f.attachment.name)}</a><div style="font-size:12px;color:var(--brown-light);margin-top:4px">${escapeHtml(f.attachment.name)} (${Math.round(f.attachment.size/1024)} KB)</div><div style="margin-top:6px"><a href="${f.attachment.fileId ? '/api/files/'+encodeURIComponent(f.attachment.fileId)+'/download' : (f.attachment.dataUrl || '#')}" download="${escapeHtml(f.attachment.name)}" class="btn btn-icon btn-sm" style="text-decoration:none">&#11015; Download</a></div>`
          : `<a href="${f.attachment.fileId ? '/api/files/'+encodeURIComponent(f.attachment.fileId)+'/download' : (f.attachment.dataUrl || '#')}" download="${escapeHtml(f.attachment.name)}" class="btn btn-icon btn-sm" style="text-decoration:none">&#128206; ${escapeHtml(f.attachment.name)} (${Math.round(f.attachment.size/1024)} KB)</a>`
        }
      </div>
    ` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

