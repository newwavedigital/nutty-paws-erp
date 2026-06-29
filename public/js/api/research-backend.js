/* =========================================================================
   FEEDBACK
   ========================================================================= */
/* =========================================================================
   RESEARCH BACKEND HELPERS
   ========================================================================= */
const RESEARCH_REQUEST_STATUSES = ['queue', 'completed', 'archived', 'all'];

function researchBackendCanAccess() {
  return !!backendAuthState.token && backendAuthState.user?.userType !== 'customer';
}

function researchBackendIsConnected() {
  return researchBackendCanAccess() && backendResearchState.status === 'connected';
}

function researchRequestBackendId(request) {
  return request?._backendId || request?.requestId || request?.rdId || request?.requestNumber || request?.id || '';
}

function researchRequestKeys(request) {
  return [...new Set([
    request?._backendId,
    request?.requestId,
    request?.rdId,
    request?.requestNumber,
    request?.id
  ].filter(Boolean).map(value => String(value)))];
}

function researchRequestMatches(localRequest, backendRequest) {
  const localKeys = researchRequestKeys(localRequest);
  return researchRequestKeys(backendRequest).some(key => localKeys.includes(key));
}

function fmtDateTime(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function normalizeResearchTimelineEntry(entry, fallbackPrefix) {
  if (!entry) return null;
  const text = entry.text || entry.note || entry.comment || entry.body || '';
  if (!text) return null;
  return {
    id: entry.id || uid(fallbackPrefix),
    text,
    ts: entry.createdAt || entry.ts || entry.timestamp || entry.submittedAt || new Date().toISOString(),
    author: entry.author || entry.createdBy || entry.actor || entry.actorUserName || entry.userName || ''
  };
}

function backendResearchRequestToLocal(record, existing = {}) {
  const status = record.status || existing.status || 'queue';
  const normalizedNotes = Array.isArray(record.workingNotes || record.notes)
    ? (record.workingNotes || record.notes).map(item => normalizeResearchTimelineEntry(item, 'rdn')).filter(Boolean)
    : (existing.notes || []);
  const normalizedComments = Array.isArray(record.postProductionComments || record.comments)
    ? (record.postProductionComments || record.comments).map(item => normalizeResearchTimelineEntry(item, 'rdc')).filter(Boolean)
    : (existing.comments || []);
  const fallbackId = record.requestId || record.rdId || record.requestNumber || record.id || existing.id || uid('rd');
  return {
    ...existing,
    _backendId: record.id || existing._backendId || '',
    id: existing.id || fallbackId,
    requestId: record.requestId || record.rdId || record.requestNumber || record.id || existing.requestId || fallbackId,
    rdId: existing.rdId || record.requestId || record.rdId || record.requestNumber || record.id || fallbackId,
    customerId: record.customerId || record.customer?.id || existing.customerId || '',
    packagingType: record.packagingType || existing.packagingType || '',
    unitsRequested: Number.isFinite(Number(record.unitsRequested))
      ? Number(record.unitsRequested)
      : (existing.unitsRequested ?? 0),
    productDescription: record.productDescription || existing.productDescription || '',
    status,
    submittedAt: record.submittedAt || record.createdAt || existing.submittedAt || new Date().toISOString(),
    completedAt: status === 'completed' ? (record.completedAt || existing.completedAt || null) : null,
    archivedAt: status === 'archived' ? (record.archivedAt || existing.archivedAt || null) : null,
    notes: normalizedNotes,
    comments: normalizedComments
  };
}

function mergeBackendResearchRequests(records) {
  const localRows = state.rdRequests || [];
  const mapped = (records || []).map(record => backendResearchRequestToLocal(
    record,
    localRows.find(local => researchRequestMatches(local, record)) || {}
  ));
  const mergedKeys = new Set();
  mapped.forEach(row => researchRequestKeys(row).forEach(key => mergedKeys.add(key)));
  const remainingLocal = localRows.filter(row => !researchRequestKeys(row).some(key => mergedKeys.has(key)));
  state.rdRequests = [...mapped, ...remainingLocal];
  backendResearchState.requests = mapped;
  try { saveState(); } catch (err) {}
  return mapped;
}

function renderBackendResearchBanner() {
  const connected = backendResearchState.status === 'connected';
  const loading = backendResearchState.loading;
  const authBlocked = !researchBackendCanAccess();
  const state = connected ? 'connected' : authBlocked ? 'auth' : loading ? 'loading' : backendResearchState.status === 'error' ? 'error' : 'local';
  const detail = connected
    ? 'R&D requests, working notes, post-production comments, completion, and archive actions are reading from protected backend records when available.'
    : authBlocked
      ? 'Sign in as an employee/admin to load and save backend research records. Local demo requests remain visible.'
      : (backendResearchState.lastError || 'Local R&D demo data remains visible while backend data is unavailable.');
  return `<div data-backend-status="research">${renderDataStateBanner({ kind: 'research', state, detail })}</div>`;
}

async function loadBackendResearchRequests(status = 'all') {
  if (!researchBackendCanAccess()) return backendResearchState.requests;
  const queryStatus = RESEARCH_REQUEST_STATUSES.includes(status) ? status : 'all';
  const records = await apiRequest(`/api/research/requests?status=${encodeURIComponent(queryStatus)}`);
  return mergeBackendResearchRequests(records || []);
}

async function loadBackendResearchRequest(requestId) {
  if (!researchBackendCanAccess()) return null;
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}`);
  mergeBackendResearchRequests([record]);
  return record;
}

async function loadBackendResearch() {
  if (!researchBackendCanAccess() || backendResearchState.loading || backendResearchState.loaded) return backendResearchState.requests;
  backendResearchState.loading = true;
  try {
    await loadBackendResearchRequests('all');
    backendResearchState.status = 'connected';
    backendResearchState.lastError = '';
    backendResearchState.loaded = true;
  } catch (error) {
    backendResearchState.status = 'error';
    backendResearchState.lastError = 'Research backend data is unavailable, so local demo R&D requests remain visible.';
    backendResearchState.loaded = true;
  } finally {
    backendResearchState.loading = false;
  }
  return backendResearchState.requests;
}

async function createBackendResearchRequest(data) {
  const record = await apiRequest('/api/research/requests', {
    method: 'POST',
    body: JSON.stringify({
      requestId: data.requestId || data.rdId || data.id || null,
      rdId: data.rdId || data.requestId || data.id || null,
      customerId: data.customerId,
      packagingType: data.packagingType,
      unitsRequested: Number(data.unitsRequested || 0),
      productDescription: data.productDescription,
      status: data.status || 'queue',
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendResearchRequests([record]);
  backendResearchState.loaded = false;
  return record;
}

async function updateBackendResearchRequest(data) {
  const requestId = researchRequestBackendId(data);
  if (!requestId) throw new Error('Backend R&D request is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      requestId: data.requestId || data.rdId || data.id || requestId,
      rdId: data.rdId || data.requestId || data.id || requestId,
      customerId: data.customerId,
      packagingType: data.packagingType,
      unitsRequested: Number(data.unitsRequested || 0),
      productDescription: data.productDescription,
      status: data.status || 'queue',
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendResearchRequests([record]);
  backendResearchState.loaded = false;
  return record;
}

async function addBackendResearchNote(request, noteText) {
  const requestId = researchRequestBackendId(request);
  if (!requestId) throw new Error('Backend R&D note is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({
      note: noteText,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  await loadBackendResearchRequest(requestId);
  backendResearchState.loaded = false;
  return record;
}

async function addBackendResearchComment(request, commentText) {
  const requestId = researchRequestBackendId(request);
  if (!requestId) throw new Error('Backend R&D comment is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      comment: commentText,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  await loadBackendResearchRequest(requestId);
  backendResearchState.loaded = false;
  return record;
}

async function completeBackendResearchRequest(request) {
  const requestId = researchRequestBackendId(request);
  if (!requestId) throw new Error('Backend R&D completion is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendResearchRequests([record]);
  backendResearchState.loaded = false;
  return record;
}

async function reopenBackendResearchRequest(request) {
  const requestId = researchRequestBackendId(request);
  if (!requestId) throw new Error('Backend R&D reopen is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendResearchRequests([record]);
  backendResearchState.loaded = false;
  return record;
}

async function archiveBackendResearchRequest(request) {
  const requestId = researchRequestBackendId(request);
  if (!requestId) throw new Error('Backend R&D archive is unavailable.');
  const record = await apiRequest(`/api/research/requests/${encodeURIComponent(requestId)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendResearchRequests([record]);
  backendResearchState.loaded = false;
  return record;
}

