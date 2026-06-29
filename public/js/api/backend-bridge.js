/* =========================================================================
   BACKEND API BRIDGE - Phase 2A targeted PO/auth wiring
   ========================================================================= */
async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  let envelope = null;
  try { envelope = await response.json(); } catch (err) {}

  if (!response.ok || !envelope || envelope.ok !== true) {
    const message = envelope?.error?.message || `Backend request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.envelope = envelope;
    throw error;
  }

  backendApiState.status = 'connected';
  backendApiState.lastError = '';
  return envelope.data;
}

async function apiFormRequest(path, formData, options = {}) {
  const response = await fetch(path, {
    ...options,
    method: options.method || 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  let envelope = null;
  try { envelope = await response.json(); } catch (err) {}

  if (!response.ok || !envelope || envelope.ok !== true) {
    const message = envelope?.error?.message || `Backend request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.envelope = envelope;
    throw error;
  }

  backendApiState.status = 'connected';
  backendApiState.lastError = '';
  return envelope.data;
}

const A10_DATA_RECORD_MODULES = {
  suppliers: {
    path: '/api/suppliers',
    cacheKey: 'a10_suppliers',
    stateKeys: ['suppliers'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, name: record.payload?.name || record.title || '' }),
    apply(records) { state.suppliers = records.map(this.toLocal); }
  },
  contentLibrary: {
    path: '/api/content-library',
    cacheKey: 'a10_content_library',
    stateKeys: ['libraryFolders', 'libraryFiles'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, name: record.payload?.name || record.title || '' }),
    apply(records) {
      const rows = records.map(this.toLocal);
      state.libraryFolders = rows.filter(row => row.kind === 'folder');
      state.libraryFiles = rows.filter(row => row.kind === 'file');
    }
  },
  teamChat: {
    path: '/api/team-chat',
    cacheKey: 'a10_team_chat',
    stateKeys: ['channels', 'messages'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, name: record.payload?.name || record.title || '', text: record.payload?.text || record.title || '' }),
    apply(records) {
      const rows = records.map(this.toLocal);
      state.channels = rows.filter(row => row.kind === 'channel');
      state.messages = rows.filter(row => row.kind === 'message');
    }
  },
  foodSafety: {
    path: '/api/food-safety',
    cacheKey: 'a10_food_safety',
    stateKeys: ['complaints', 'sanitationLogs', 'swabRecords', 'ccpLogs', 'ncrs', 'recalls'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, title: record.payload?.title || record.title || '' }),
    apply(records) {
      const rows = records.map(this.toLocal);
      state.complaints = rows.filter(row => row.kind === 'complaint');
      state.sanitationLogs = rows.filter(row => row.kind === 'sanitation');
      state.swabRecords = rows.filter(row => row.kind === 'swab');
      state.ccpLogs = rows.filter(row => row.kind === 'ccp');
      state.ncrs = rows.filter(row => row.kind === 'ncr');
      state.recalls = rows.filter(row => row.kind === 'recall');
    }
  },
  machinery: {
    path: '/api/machinery',
    cacheKey: 'a10_machinery',
    stateKeys: ['maintenanceEvents', 'equipmentIssues'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, title: record.payload?.title || record.title || '' }),
    apply(records) {
      const rows = records.map(this.toLocal);
      state.maintenanceEvents = rows.filter(row => row.kind === 'maintenance');
      state.equipmentIssues = rows.filter(row => row.kind === 'issue');
    }
  },
  feedback: {
    path: '/api/feedback',
    cacheKey: 'a10_feedback',
    stateKeys: ['feedback'],
    toLocal: record => ({ ...(record.payload || {}), id: record.id, _backendId: record.id, title: record.payload?.title || record.title || '' }),
    apply(records) { state.feedback = records.map(this.toLocal); }
  }
};

const a10DataRecordState = Object.fromEntries(Object.keys(A10_DATA_RECORD_MODULES).map(moduleName => [
  moduleName,
  { status: 'idle', loading: false, loaded: false, lastError: '' }
]));

function hydrateA10DataRecordCaches() {
  Object.entries(A10_DATA_RECORD_MODULES).forEach(([moduleName, config]) => {
    const cached = hydrateWorkingModuleFromCache(config.cacheKey);
    if (cached) {
      config.apply(cached.records || []);
      a10DataRecordState[moduleName].status = 'stale';
    }
  });
}

async function refreshA10DataRecordModule(moduleName, options = {}) {
  const config = A10_DATA_RECORD_MODULES[moduleName];
  if (!config) return [];
  const moduleState = a10DataRecordState[moduleName];
  if (moduleState.loading) return workingStore.modules[config.cacheKey]?.records || [];
  moduleState.loading = true;
  moduleState.status = 'loading';
  moduleState.lastError = '';
  try {
    const records = await refreshWorkingModuleFromBackend(
      config.cacheKey,
      () => apiRequest(config.path),
      { force: options.force ?? true, ttlMs: DEFAULT_CACHE_TTLS.workflow }
    );
    config.apply(records.records || []);
    moduleState.status = 'connected';
    moduleState.loaded = true;
    return records.records || [];
  } catch (error) {
    const cached = hydrateWorkingModuleFromCache(config.cacheKey);
    if (cached) config.apply(cached.records || []);
    moduleState.status = cached ? 'stale' : 'error';
    moduleState.lastError = error?.message || 'Backend data is unavailable.';
    return cached?.records || [];
  } finally {
    moduleState.loading = false;
  }
}

function a10RecordKindForPayload(payload, fallback) {
  return payload.kind || fallback || 'general';
}

function a10RecordTitle(payload, fallback = '') {
  return payload.name || payload.title || payload.equipment || payload.description || payload.text || fallback || 'Untitled record';
}

async function saveA10DataRecord(moduleName, kind, payload, options = {}) {
  const config = A10_DATA_RECORD_MODULES[moduleName];
  if (!config) throw new Error(`Unknown data-record module: ${moduleName}`);
  const existingId = Object.prototype.hasOwnProperty.call(options, 'recordId')
    ? options.recordId
    : (payload._backendId || null);
  const body = {
    kind: a10RecordKindForPayload(payload, kind),
    title: a10RecordTitle(payload, kind),
    payload: { ...payload, kind: a10RecordKindForPayload(payload, kind) },
    fileIds: Array.isArray(payload.fileIds) ? payload.fileIds : []
  };
  delete body.payload._backendId;
  const saved = existingId
    ? await apiRequest(`${config.path}/${encodeURIComponent(existingId)}`, { method: 'PATCH', body: JSON.stringify(body) })
    : await apiRequest(config.path, { method: 'POST', body: JSON.stringify(body) });
  await refreshA10DataRecordModule(moduleName, { force: true });
  return saved;
}

async function archiveA10DataRecord(moduleName, recordId) {
  const config = A10_DATA_RECORD_MODULES[moduleName];
  if (!config) throw new Error(`Unknown data-record module: ${moduleName}`);
  await apiRequest(`${config.path}/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  await refreshA10DataRecordModule(moduleName, { force: true });
}

async function uploadA10FileReference(ownerType, ownerId, fileCategory, file) {
  const form = new FormData();
  form.append('ownerType', ownerType);
  form.append('ownerId', ownerId);
  form.append('fileCategory', fileCategory);
  form.append('file', file);
  return apiFormRequest('/api/files', form);
}

function renderA10DataRecordBanner(moduleName) {
  const moduleState = a10DataRecordState[moduleName] || {};
  const stateKind = moduleState.status === 'connected'
    ? 'connected'
    : moduleState.status === 'loading'
      ? 'loading'
      : moduleState.status === 'stale'
        ? 'local'
        : 'auth';
  const detail = moduleState.status === 'connected'
    ? 'This screen is reading D1 records.'
    : moduleState.status === 'stale'
      ? 'Backend data is unavailable. Showing stale backend-confirmed cache only.'
      : moduleState.status === 'loading'
        ? 'Loading protected backend records.'
        : 'Sign in as an employee/admin to load and save backend records.';
  return renderDataStateBanner({ kind: moduleName, state: stateKind, detail });
}

hydrateA10DataRecordCaches();

function markBackendUnavailable(error) {
  backendApiState.status = 'local';
  backendApiState.lastError = error?.message || 'Backend unavailable';
}

function failBackendRequiredWrite(error, stateRef = null, fallbackMessage = 'Backend save failed. Nothing was saved locally.') {
  const message = error?.message || fallbackMessage;
  if (stateRef) {
    stateRef.status = error ? 'error' : 'auth';
    stateRef.lastError = message;
  }
  toast(message);
  return false;
}

function requireBackendWriteSession(stateRef = null, message = 'Sign in before saving. Nothing was saved locally.') {
  if (backendAuthState.token && backendAuthState.user) return true;
  return failBackendRequiredWrite(null, stateRef, message);
}

function requireEmployeeBackendWrite(stateRef = null, message = 'Sign in as an employee or admin before saving. Nothing was saved locally.') {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer') return true;
  return failBackendRequiredWrite(null, stateRef, message);
}

function renderBackendStatusBanner(context = 'purchase-orders') {
  const connected = backendApiState.status === 'connected';
  const loading = backendApiState.loadingPurchaseOrders;
  const authWaiting = backendApiState.lastError === 'Authentication is required';
  return renderDataStateBanner({
    kind: context,
    state: connected ? 'connected' : loading ? 'loading' : authWaiting ? 'auth' : 'local',
    detail: connected
      ? 'This screen is reading protected backend records when available.'
      : authWaiting
        ? 'Sign in from Account Management to connect this screen to protected backend data.'
        : 'Offline preview is visible. Sign in to load and save protected backend records.'
  });
}

function setStitchModal(enabled = true) {
  const modal = document.querySelector('.modal');
  if (modal) modal.className = enabled ? 'modal stitch-modal' : 'modal';
}

function opsMetric(label, value, tone = '') {
  return `<div class="ops-metric ${tone}"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(String(value))}</span></div>`;
}

function renderPageShellHeader(title, kicker = '', actions = '') {
  return `<div class="ops-header">
    <div>
      ${kicker ? `<div class="ops-kicker">${escapeHtml(kicker)}</div>` : ''}
      <h2 class="ops-title">${escapeHtml(title)}</h2>
    </div>
    ${actions ? `<div class="ops-actions">${actions}</div>` : ''}
  </div>`;
}

function renderDataStateBanner({ kind = 'screen', state = 'local', detail = '' } = {}) {
  if (state === 'connected') return '';
  const config = {
    loading: ['Checking backend...', '', 'var(--orange)'],
    auth: ['Sign in required', '', 'var(--orange)'],
    error: ['Backend unavailable', 'bad', 'var(--danger)'],
    local: ['Offline preview', '', 'var(--orange)']
  }[state] || ['Offline preview', '', 'var(--orange)'];
  return `<div class="inv-check ${config[1]}" data-backend-status="${escapeAttr(kind)}" style="border-left-color:${config[2]}">
    <strong>${escapeHtml(config[0])}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail || 'Offline preview is visible until protected backend records load.')}</div>
  </div>`;
}

function renderOpsPanel({ title = '', kicker = '', actions = '', body = '', className = '' } = {}) {
  return `<section class="ops-panel ${escapeAttr(className)}">
    ${renderPageShellHeader(title, kicker, actions)}
    <div class="ops-panel-body">${body}</div>
  </section>`;
}

function renderOpsToolbar(options = {}) {
  return opsToolbarHtml(options);
}

function renderEmptyState(title, detail = '', action = '') {
  return `<div class="ops-empty">
    <strong>${escapeHtml(title)}</strong>
    ${detail ? `<div>${escapeHtml(detail)}</div>` : ''}
    ${action ? `<div style="margin-top:12px">${action}</div>` : ''}
  </div>`;
}

function renderStatusBadge(label, tone = 'info') {
  const cls = tone === 'danger' ? 'badge-low' : tone === 'ok' ? 'badge-prod' : tone === 'warn' ? 'badge-pending' : 'badge-shipping';
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderActionButtons(actions = []) {
  return `<div class="row-actions">${actions.map(action => {
    const tone = action.tone === 'danger' ? 'btn-danger' : action.tone === 'workflow' ? 'btn-workflow' : action.tone === 'secondary' ? 'btn-secondary' : 'btn-icon';
    const small = action.small === false ? '' : ' btn-sm';
    const disabled = action.disabled ? ' disabled' : '';
    const title = action.title ? ` title="${escapeAttr(action.title)}"` : '';
    return `<button class="btn ${tone}${small}"${title}${disabled} onclick="${escapeAttr(action.onclick || '')}">${escapeHtml(action.label || '')}</button>`;
  }).join('')}</div>`;
}

function setButtonLoading(buttonOrId, isLoading, loadingLabel = 'Saving...') {
  const button = typeof buttonOrId === 'string' ? document.getElementById(buttonOrId) : buttonOrId;
  if (!button) return;
  if (isLoading) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = loadingLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    delete button.dataset.originalLabel;
  }
}

function renderInlineFieldError(id, message = '') {
  return `<div class="field-error" id="${escapeAttr(id)}">${escapeHtml(message)}</div>`;
}

function inventorySummaryHtml() {
  const signals = backendInventoryState.signals;
  const conflicts = inventoryConflicts();
  const low = signals ? signals.lowStockCount : state.ingredients.filter(i => (i.stock || 0) <= (i.reorderLevel || 0)).length;
  const over = signals ? signals.overAllocationCount : conflicts.length;
  const netIssues = state.ingredients.filter(i => ((i.stock || 0) - ((supplyChainDemand()[i.id] || 0) + (allocatedInventory()[i.id] || 0))) <= (i.reorderLevel || 0)).length;
  const today = new Date().toISOString().slice(0,10);
  const receiptsToday = (state.receivingLog || []).filter(r => r.date === today).length;
  const movesToday = (state.moveLog || []).filter(m => m.date === today).length;
  return `<div class="ops-summary">
    ${opsMetric('Low Stock', low, low ? 'warn' : 'ok')}
    ${opsMetric('Over-allocated', over, over ? 'danger' : 'ok')}
    ${opsMetric('Net Available Issues', netIssues, netIssues ? 'warn' : 'ok')}
    ${opsMetric('Receipts Today', receiptsToday, receiptsToday ? 'info' : '')}
    ${opsMetric('Moves Today', movesToday, movesToday ? 'info' : '')}
  </div>`;
}

function opsToolbarHtml({ search = true, filters = '', actions = '' } = {}) {
  return `<div class="ops-toolbar">
    <div class="ops-toolbar-left">
      ${search ? '<input class="ops-input" type="search" placeholder="Search this view..." aria-label="Search this view" />' : ''}
      ${filters}
    </div>
    <div class="ops-toolbar-right">${actions}</div>
  </div>`;
}

function opsSelect(label, options) {
  return `<select class="ops-select" aria-label="${escapeHtml(label)}">
    ${options.map(o => `<option>${escapeHtml(o)}</option>`).join('')}
  </select>`;
}

function opsStatus(label, tone) {
  return `<span class="ops-status ${tone}">${escapeHtml(label)}</span>`;
}

function renderBackendDataStatusBanner(kind, dataState) {
  const connected = dataState.status === 'connected';
  if (connected) return '';
  const loading = dataState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const details = {
    customers: dataState.lastError || 'Browser customer/product preview data remains visible while backend data is unavailable.',
    products: dataState.lastError || 'Browser customer/product preview data remains visible while backend data is unavailable.',
    'master-items': dataState.lastError || 'Browser customer/product preview data remains visible while backend data is unavailable.',
    inventory: dataState.lastError || 'Browser inventory preview data remains visible while backend data is unavailable.'
  };
  return `<div class="inv-check" data-backend-status="${kind}" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(details[kind] || details.customers)}</div>
  </div>`;
}

function renderBackendProcurementBanner() {
  const connected = backendProcurementState.status === 'connected';
  if (connected) return '';
  const loading = backendProcurementState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const detail = backendProcurementState.lastError || 'Browser procurement preview data remains visible while backend data is unavailable.';
  return `<div class="inv-check" data-backend-status="procurement" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail)}</div>
  </div>`;
}

function renderBackendProductionBanner() {
  const connected = backendProductionState.status === 'connected';
  if (connected) return '';
  const loading = backendProductionState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const detail = backendProductionState.lastError || 'Browser production preview data remains visible while backend data is unavailable.';
  return `<div class="inv-check" data-backend-status="production" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail)}</div>
  </div>`;
}

function renderBackendQualityBanner() {
  const connected = backendQualityState.status === 'connected';
  if (connected) return '';
  const loading = backendQualityState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const detail = backendQualityState.lastError || 'Browser QA preview data remains visible while backend data is unavailable.';
  return `<div class="inv-check" data-backend-status="quality" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail)}</div>
  </div>`;
}

function renderBackendShippingBanner() {
  const connected = backendShippingState.status === 'connected';
  if (connected) return '';
  const loading = backendShippingState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const detail = backendShippingState.lastError || 'Browser shipping preview data remains visible while backend data is unavailable.';
  return `<div class="inv-check" data-backend-status="shipping" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail)}</div>
  </div>`;
}

function renderBackendPickPackBanner() {
  const connected = backendPickPackState.status === 'connected';
  if (connected) return '';
  const loading = backendPickPackState.loading;
  const title = loading ? 'Checking backend...' : 'Offline preview';
  const detail = backendPickPackState.lastError || 'Browser Pick & Pack preview data remains visible while backend data is unavailable.';
  return `<div class="inv-check" data-backend-status="pick-pack" style="border-left-color:var(--orange)">
    <strong>${title}</strong>
    <div style="font-size:12px;color:var(--brown-light);margin-top:3px">${escapeHtml(detail)}</div>
  </div>`;
}

function qualityBackendIsConnected() {
  return !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendQualityState.status === 'connected';
}

function qualityPurchaseOrderBackendId(po) {
  return po?._backendId || po?.id || '';
}

function qualityCoaFileId(po) {
  return po?.coa?._backendFileId || po?.coa?.id || po?.coaFileId || '';
}

function mergeBackendQualityQueue(records) {
  const queue = mergeBackendPurchaseOrders(records || []);
  backendQualityState.queue = queue;
  return queue;
}

async function attachBackendQualityFiles(queue) {
  for (const po of queue || []) {
    const purchaseOrderId = qualityPurchaseOrderBackendId(po);
    if (!purchaseOrderId) continue;
    try {
      const files = await loadBackendPurchaseOrderFiles(purchaseOrderId);
      po._backendFiles = files || [];
      const coa = (files || []).find(file => file.fileCategory === 'coa') || null;
      if (coa) po.coa = mapBackendFileToPrototype(coa);
      const postShipmentCoa = (files || []).find(file => file.fileCategory === 'post_shipment_coa') || null;
      if (postShipmentCoa) po.postShipmentCoa = mapBackendFileToPrototype(postShipmentCoa);
    } catch (error) {
      po._backendFileError = error?.message || 'QA files unavailable';
    }
  }
}

async function loadBackendQualityQueue() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendQualityState.loading || backendQualityState.loaded) return backendQualityState.queue;
  backendQualityState.loading = true;
  try {
    const records = await apiRequest('/api/quality/queue');
    const queue = mergeBackendQualityQueue(records || []);
    await attachBackendQualityFiles(queue);
    backendQualityState.status = 'connected';
    backendQualityState.lastError = '';
    backendQualityState.loaded = true;
    return queue;
  } catch (error) {
    backendQualityState.status = 'error';
    backendQualityState.lastError = 'Quality backend data is unavailable, so local QA demo records remain visible.';
    backendQualityState.loaded = true;
    return [];
  } finally {
    backendQualityState.loading = false;
  }
}

async function uploadBackendQualityCoa(purchaseOrderId, file, fileCategory = 'coa') {
  if (!file) return null;
  const form = new FormData();
  form.set('ownerType', 'purchase_order');
  form.set('ownerId', purchaseOrderId);
  form.set('fileCategory', fileCategory);
  form.set('file', file);
  const uploaded = await apiFormRequest('/api/files', form);
  return uploaded;
}

async function releaseBackendQualityPo(po, notes) {
  const purchaseOrderId = qualityPurchaseOrderBackendId(po);
  if (!purchaseOrderId) throw new Error('Backend QA release is unavailable for this PO.');
  const coaFileId = qualityCoaFileId(po);
  if (!coaFileId) throw new Error('Upload a COA first.');
  const updated = await apiRequest(`/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/release`, {
    method: 'POST',
    body: JSON.stringify({
      coaFileId,
      notes: notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPurchaseOrders([updated]);
  backendQualityState.loaded = false;
  return updated;
}

async function skipBackendQualityPo(po, reason, notes) {
  const purchaseOrderId = qualityPurchaseOrderBackendId(po);
  if (!purchaseOrderId) throw new Error('Backend QA skip is unavailable for this PO.');
  const updated = await apiRequest(`/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/skip`, {
    method: 'POST',
    body: JSON.stringify({
      reason,
      notes: notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPurchaseOrders([updated]);
  backendQualityState.loaded = false;
  return updated;
}

async function attachBackendPostShipmentCoa(purchaseOrderId, file) {
  if (!file) return null;
  const uploaded = await uploadBackendQualityCoa(purchaseOrderId, file, 'coa');
  const updated = await apiRequest(`/api/quality/purchase-orders/${encodeURIComponent(purchaseOrderId)}/post-shipment-coa`, {
    method: 'POST',
    body: JSON.stringify({
      fileId: uploaded?.id || null,
      postShipmentCoaFileId: uploaded?.id || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPurchaseOrders([updated]);
  backendQualityState.loaded = false;
  return updated;
}

function qualityReleaseTargetStatus(po) {
  return isInternalBrand(po) ? 'completed' : 'shipping';
}

function qualityActionLabel(po) {
  if (po.qaSkippedAt) return 'Skipped';
  if (po.qaReleasedAt || po.status === 'shipping' || po.status === 'completed') return 'Released';
  return 'Awaiting QA';
}

function qualityActionTimestamp(po) {
  return po.qaSkippedAt || po.qaReleasedAt || po.coa?.uploadedAt || po.completedAt || '';
}

function shippingBackendIsConnected() {
  return !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendShippingState.status === 'connected';
}

function shippingPurchaseOrderBackendId(po) {
  return po?._backendId || po?.id || '';
}

function shippingShipmentDocumentFileId(po) {
  const doc = po?.shipping?.documents;
  return doc?._backendFileId || doc?.id || po?.shipping?.shipmentDocumentFileId || '';
}

function mergeBackendShippingQueue(records) {
  const queue = mergeBackendPurchaseOrders(records || []);
  backendShippingState.queue = queue;
  return queue;
}

function backendShippingLogToLocal(log, existing = {}) {
  const palletList = parseJsonFallback(log.palletListJson, []);
  const items = Array.isArray(log.items) ? log.items : parseJsonFallback(log.itemsSnapshotJson, []);
  return {
    ...existing,
    id: log.id,
    _backendId: log.id,
    shipId: log.shipId || log.shippingId || log.shippingLogNumber || existing.shipId || log.id,
    poId: localPoIdFromBackendPurchaseOrderId(log.purchaseOrderId || log.poId || ''),
    date: (log.shippedAt || log.stockedAt || log.createdAt || log.date || '').slice(0, 10),
    customerId: log.customerId || existing.customerId || '',
    brand: log.brand || existing.brand || '',
    carrier: log.carrier || log.carrierName || '',
    bol: log.bol || log.bolNumber || '',
    proNumber: log.proNumber || '',
    pallets: log.palletCount ?? palletList.length ?? 0,
    weight: log.totalWeight ?? log.weight ?? palletList.reduce((sum, pl) => sum + (parseFloat(pl.weight)||0), 0),
    items: items.map(item => ({
      productId: item.productId || '',
      qty: item.quantity ?? item.qty ?? item.quantityProduced ?? 0,
      lot: item.lotNumber || item.lot || ''
    }))
  };
}

function mergeBackendShippingLogs(logs) {
  const mapped = (logs || []).map(log => backendShippingLogToLocal(log, (state.shippingLog || []).find(local => local._backendId === log.id || local.id === log.id) || {}));
  backendShippingState.logs = mapped;
  state.shippingLog = mapBackendSnapshot(state.shippingLog || [], logs || [], backendShippingLogToLocal);
  try { saveState(); } catch (err) {}
  return mapped;
}

async function attachBackendShipmentDocuments(queue) {
  for (const po of queue || []) {
    const purchaseOrderId = shippingPurchaseOrderBackendId(po);
    if (!purchaseOrderId) continue;
    try {
      const files = await loadBackendPurchaseOrderFiles(purchaseOrderId);
      po._backendFiles = files || [];
      const shipmentDocument = (files || []).find(file => file.fileCategory === 'shipment_document') || null;
      if (shipmentDocument) {
        po.shipping = po.shipping || {};
        po.shipping.documents = mapBackendFileToPrototype(shipmentDocument);
        po.shipping.shipmentDocumentFileId = shipmentDocument.id;
      }
    } catch (error) {
      po._backendFileError = error?.message || 'Shipment documents unavailable';
    }
  }
}

async function loadBackendShippingQueue() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return backendShippingState.queue;
  const records = await apiRequest('/api/shipping/queue');
  const queue = mergeBackendShippingQueue(records || []);
  await attachBackendShipmentDocuments(queue);
  return queue;
}

async function loadBackendShippingLogs() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return backendShippingState.logs;
  const logs = await apiRequest('/api/shipping/logs');
  return mergeBackendShippingLogs(logs || []);
}

async function loadBackendShipping() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendShippingState.loading || backendShippingState.loaded) return;
  backendShippingState.loading = true;
  try {
    await loadBackendShippingQueue();
    await loadBackendShippingLogs();
    backendShippingState.status = 'connected';
    backendShippingState.lastError = '';
    backendShippingState.loaded = true;
  } catch (error) {
    backendShippingState.status = 'error';
    backendShippingState.lastError = 'Shipping backend data is unavailable, so local demo shipping remains visible.';
    backendShippingState.loaded = true;
  } finally {
    backendShippingState.loading = false;
  }
}

async function uploadBackendShipmentDocument(purchaseOrderId, file) {
  if (!file) return null;
  const form = new FormData();
  form.set('ownerType', 'purchase_order');
  form.set('ownerId', purchaseOrderId);
  form.set('fileCategory', 'shipment_document');
  form.set('file', file);
  return apiFormRequest('/api/files', form);
}

function backendShippingDetailsPayload(po) {
  const s = po.shipping || {};
  const palletList = shipPalletList(po).map(pl => ({
    length: Number(pl.length || 0),
    width: Number(pl.width || 0),
    height: Number(pl.height || 0),
    weight: Number(pl.weight || 0)
  }));
  return {
    bol: s.bol || null,
    bolNumber: s.bol || null,
    proNumber: s.proNumber || null,
    carrier: s.carrier || null,
    carrierName: s.carrier || null,
    freightClass: s.freightClass || null,
    notes: s.notes || null,
    palletList,
    palletListJson: JSON.stringify(palletList),
    weight: palletList.reduce((sum, pl) => sum + Number(pl.weight || 0), 0),
    shipmentDocumentFileId: shippingShipmentDocumentFileId(po) || null,
    actorUserId: BACKEND_ACTOR_USER_ID
  };
}

async function saveBackendShippingDetails(po) {
  const purchaseOrderId = shippingPurchaseOrderBackendId(po);
  if (!purchaseOrderId) throw new Error('Backend shipping details are unavailable for this PO.');
  const updated = await apiRequest(`/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/details`, {
    method: 'PATCH',
    body: JSON.stringify(backendShippingDetailsPayload(po))
  });
  po.shipping = {
    ...(po.shipping || {}),
    bol: updated?.bolNumber || po.shipping?.bol || '',
    proNumber: updated?.proNumber || po.shipping?.proNumber || '',
    carrier: updated?.carrier || po.shipping?.carrier || '',
    freightClass: updated?.freightClass || po.shipping?.freightClass || '',
    notes: updated?.notes || po.shipping?.notes || '',
    shipmentDocumentFileId: updated?.shipmentDocumentFileId || po.shipping?.shipmentDocumentFileId || ''
  };
  backendShippingState.loaded = false;
  return updated;
}

async function markBackendShipped(po, options = {}) {
  const purchaseOrderId = shippingPurchaseOrderBackendId(po);
  if (!purchaseOrderId) throw new Error('Backend shipping completion is unavailable for this PO.');
  const updated = await apiRequest(`/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/mark-shipped`, {
    method: 'POST',
    body: JSON.stringify({
      ...backendShippingDetailsPayload(po),
      confirmMissingCarrierBol: !!options.confirmMissingCarrierBol
    })
  });
  mergeBackendPurchaseOrders([updated]);
  await loadBackendShippingLogs();
  backendShippingState.loaded = false;
  return updated;
}

async function markBackendStocked(po) {
  const purchaseOrderId = shippingPurchaseOrderBackendId(po);
  if (!purchaseOrderId) throw new Error('Backend stocking completion is unavailable for this PO.');
  const updated = await apiRequest(`/api/shipping/purchase-orders/${encodeURIComponent(purchaseOrderId)}/mark-stocked`, {
    method: 'POST',
    body: JSON.stringify({
      notes: po.shipping?.notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPurchaseOrders([updated]);
  await loadBackendShippingLogs();
  backendShippingState.loaded = false;
  return updated;
}

function isBackendMissingCarrierBolWarning(error) {
  const code = String(error?.envelope?.error?.code || error?.code || '').toLowerCase();
  const message = String(error?.message || error?.envelope?.error?.message || '').toLowerCase();
  return code.includes('missing') || (message.includes('missing') && (message.includes('bol') || message.includes('carrier')));
}

function pickPackBackendIsConnected() {
  return !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendPickPackState.status === 'connected';
}

function pickPackOrderBackendId(order) {
  return order?._backendId || order?.id || '';
}

function pickPackOrderShippingDetailsPayload(order) {
  const mode = order?.shippingMode || 'pallet';
  const palletList = Array.isArray(order?.palletList) ? order.palletList : [];
  const fallbackPalletList = mode === 'pallet' && palletList.length === 0 && (order?.length || order?.width || order?.height || order?.weight)
    ? [{ length: order.length || 0, width: order.width || 0, height: order.height || 0, weight: order.weight || 0 }]
    : palletList;
  return {
    shippingMode: mode,
    carrier: mode === 'parcel' ? (order?.parcelCarrier || '') : (order?.carrier || ''),
    trackingNumber: mode === 'parcel' ? (order?.trackingNumber || '') : (order?.trackingNumber || ''),
    bolNumber: mode === 'parcel' ? null : (order?.bol || ''),
    palletCount: mode === 'parcel' ? null : (order?.pallets || null),
    weight: mode === 'parcel' ? ((Number(order?.packageWeight || order?.weight || 0) || null)) : ((Number(order?.weight || 0) || null)),
    dimensionsJson: JSON.stringify(mode === 'parcel' ? [] : fallbackPalletList),
    notes: order?.notes || null,
    actorUserId: BACKEND_ACTOR_USER_ID
  };
}

function backendPickPackOrderToLocal(order, existing = {}) {
  const shippingDetails = order?.shippingDetails || {};
  const dimensions = parseJsonFallback(shippingDetails.dimensionsJson, []);
  const palletList = Array.isArray(dimensions)
    ? dimensions
    : Array.isArray(dimensions?.palletList)
      ? dimensions.palletList
      : [];
  const firstPallet = palletList[0] || {};
  const lines = (order?.lines || []).map((line) => ({
    ingredientId: line.inventoryItemId || line.ingredientId || '',
    inventoryItemId: line.inventoryItemId || line.ingredientId || '',
    qty: Number(line.quantity ?? line.qty ?? 0),
    pickedQuantity: Number(line.pickedQuantity ?? 0),
    shortQuantity: Number(line.shortQuantity ?? 0),
    itemName: line.itemName || '',
    sku: line.sku || '',
    customerId: line.customerId || ''
  }));
  return {
    ...existing,
    id: order.pickPackNumber || existing.id || order.id,
    _backendId: order.id,
    customerId: order.customerId || existing.customerId || '',
    poNumber: order.customerPoNumber || existing.poNumber || '',
    dateSubmitted: order.dateSubmitted || existing.dateSubmitted || '',
    dateNeededToShip: order.dateNeededToShip || existing.dateNeededToShip || '',
    poFile: existing.poFile || null,
    notes: order.notes || existing.notes || '',
    status: order.status || existing.status || 'open',
    pickedAt: order.pickedAt || existing.pickedAt || '',
    shippedAt: order.shippedAt || existing.shippedAt || '',
    shortStockConfirmed: !!order.shortStockConfirmed,
    shortStock: order.shortStock || existing.shortStock || [],
    lines,
    shippingMode: shippingDetails.shippingMode || existing.shippingMode || 'pallet',
    carrier: shippingDetails.shippingMode === 'parcel' ? (shippingDetails.carrier || existing.parcelCarrier || '') : (shippingDetails.carrier || existing.carrier || ''),
    parcelCarrier: shippingDetails.shippingMode === 'parcel' ? (shippingDetails.carrier || existing.parcelCarrier || '') : (existing.parcelCarrier || ''),
    trackingNumber: shippingDetails.trackingNumber || existing.trackingNumber || '',
    bol: shippingDetails.bolNumber || existing.bol || '',
    pallets: shippingDetails.palletCount ?? existing.pallets ?? 0,
    weight: shippingDetails.weight ?? existing.weight ?? 0,
    packageWeight: shippingDetails.weight ?? existing.packageWeight ?? 0,
    length: firstPallet.length ?? existing.length ?? 0,
    width: firstPallet.width ?? existing.width ?? 0,
    height: firstPallet.height ?? existing.height ?? 0,
    palletList,
    shippingDetails: Object.keys(shippingDetails).length ? { ...shippingDetails } : (existing.shippingDetails || null)
  };
}

function mergeBackendPickPackOrders(records) {
  const mapped = (records || []).map(order => backendPickPackOrderToLocal(order, (state.pickPackOrders || []).find(local => local._backendId === order.id || local.id === order.pickPackNumber || local.id === order.id) || {}));
  const backendKeys = new Set();
  mapped.forEach(order => {
    [order._backendId, order.id, order.poNumber].filter(Boolean).forEach(key => backendKeys.add(String(key)));
  });
  const remainingLocal = (state.pickPackOrders || []).filter(order => {
    const keys = [order._backendId, order.id, order.poNumber].filter(Boolean).map(String);
    return !keys.some(key => backendKeys.has(key));
  });
  state.pickPackOrders = [...mapped, ...remainingLocal];
  backendPickPackState.orders = mapped;
  try { saveState(); } catch (err) {}
  return mapped;
}

async function loadBackendPickPackOrders() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return backendPickPackState.orders;
  const records = await apiRequest('/api/pick-pack/orders');
  return mergeBackendPickPackOrders(records || []);
}

async function loadBackendPickPack() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendPickPackState.loading || backendPickPackState.loaded) return backendPickPackState.orders;
  backendPickPackState.loading = true;
  try {
    await loadBackendPickPackOrders();
    backendPickPackState.status = 'connected';
    backendPickPackState.lastError = '';
    backendPickPackState.loaded = true;
  } catch (error) {
    backendPickPackState.status = 'error';
    backendPickPackState.lastError = 'Pick & Pack backend data is unavailable, so local Pick & Pack records remain visible.';
    backendPickPackState.loaded = true;
  } finally {
    backendPickPackState.loading = false;
  }
}

async function createBackendPickPackOrder(data) {
  const order = await apiRequest('/api/pick-pack/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerId: data.customerId,
      customerPoNumber: data.poNumber || data.customerPoNumber || null,
      dateSubmitted: data.dateSubmitted || null,
      dateNeededToShip: data.dateNeededToShip || null,
      poFileId: data.poFile?._backendFileId || data.poFile?.id || data.poFileId || null,
      notes: data.notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID,
      lines: (data.lines || []).map(line => ({
        inventoryItemId: line.inventoryItemId || line.ingredientId || '',
        quantity: Number(line.quantity || line.qty || 0)
      }))
    })
  });
  mergeBackendPickPackOrders([order]);
  backendPickPackState.loaded = false;
  return order;
}

async function updateBackendPickPackOrder(data) {
  const orderId = pickPackOrderBackendId(data);
  if (!orderId) throw new Error('Backend Pick & Pack order is unavailable.');
  const order = await apiRequest(`/api/pick-pack/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      customerId: data.customerId,
      customerPoNumber: data.poNumber || data.customerPoNumber || null,
      dateSubmitted: data.dateSubmitted || null,
      dateNeededToShip: data.dateNeededToShip || null,
      poFileId: data.poFile?._backendFileId || data.poFile?.id || data.poFileId || null,
      notes: data.notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID,
      lines: (data.lines || []).map(line => ({
        inventoryItemId: line.inventoryItemId || line.ingredientId || '',
        quantity: Number(line.quantity || line.qty || 0)
      }))
    })
  });
  mergeBackendPickPackOrders([order]);
  backendPickPackState.loaded = false;
  return order;
}

async function markBackendPickPackPicked(order, options = {}) {
  const orderId = pickPackOrderBackendId(order);
  if (!orderId) throw new Error('Backend Pick & Pack pick is unavailable.');
  const updated = await apiRequest(`/api/pick-pack/orders/${encodeURIComponent(orderId)}/mark-picked`, {
    method: 'POST',
    body: JSON.stringify({
      confirmShortStock: !!options.confirmShortStock,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPickPackOrders([updated]);
  backendPickPackState.loaded = false;
  return updated;
}

async function saveBackendPickPackShippingDetails(order) {
  const orderId = pickPackOrderBackendId(order);
  if (!orderId) throw new Error('Backend Pick & Pack shipping details are unavailable.');
  const updated = await apiRequest(`/api/pick-pack/orders/${encodeURIComponent(orderId)}/shipping`, {
    method: 'PATCH',
    body: JSON.stringify(pickPackOrderShippingDetailsPayload(order))
  });
  if (updated && (updated.lines || updated.status || updated.pickPackNumber || updated.customerId || updated.shippingDetails)) {
    mergeBackendPickPackOrders([updated]);
  } else {
    const local = (state.pickPackOrders || []).find(localOrder => localOrder._backendId === orderId || localOrder.id === orderId);
    if (local) {
      Object.assign(local, {
        shippingMode: order.shippingMode || local.shippingMode || 'pallet',
        carrier: order.shippingMode === 'parcel' ? (order.parcelCarrier || local.parcelCarrier || '') : (order.carrier || local.carrier || ''),
        parcelCarrier: order.shippingMode === 'parcel' ? (order.parcelCarrier || local.parcelCarrier || '') : (local.parcelCarrier || ''),
        trackingNumber: order.trackingNumber || local.trackingNumber || '',
        bol: order.bol || local.bol || '',
        pallets: order.pallets ?? local.pallets ?? 0,
        weight: order.weight ?? order.packageWeight ?? local.weight ?? 0,
        packageWeight: order.packageWeight ?? order.weight ?? local.packageWeight ?? 0,
        length: order.length ?? local.length ?? 0,
        width: order.width ?? local.width ?? 0,
        height: order.height ?? local.height ?? 0,
        palletList: Array.isArray(order.palletList) ? order.palletList : (local.palletList || []),
        notes: order.notes || local.notes || ''
      });
      try { saveState(); } catch (err) {}
    }
  }
  backendPickPackState.loaded = false;
  return updated;
}

async function markBackendPickPackShipped(order) {
  const orderId = pickPackOrderBackendId(order);
  if (!orderId) throw new Error('Backend Pick & Pack ship is unavailable.');
  const updated = await apiRequest(`/api/pick-pack/orders/${encodeURIComponent(orderId)}/mark-shipped`, {
    method: 'POST',
    body: JSON.stringify({
      ...pickPackOrderShippingDetailsPayload(order)
    })
  });
  mergeBackendPickPackOrders([updated]);
  backendPickPackState.loaded = false;
  return updated;
}

function isBackendShortStockWarning(error) {
  const code = String(error?.envelope?.error?.code || error?.code || '').toLowerCase();
  const message = String(error?.message || error?.envelope?.error?.message || '').toLowerCase();
  return (code.includes('short') && code.includes('stock')) || (message.includes('short') && message.includes('stock'));
}

function qualityActionActor(po) {
  return po.qaSkippedByUserId || po.qaReleasedByUserId || po.coa?.uploadedBy || '-';
}

function qualityFileName(po) {
  return po.postShipmentCoa?.name || po.coa?.name || '-';
}

function qualityReleaseStatusText(po) {
  if (po.qaSkippedAt) return `Skipped QA to ${qualityReleaseTargetStatus(po).replace(/_/g, ' ')}`;
  return `Released to ${qualityReleaseTargetStatus(po).replace(/_/g, ' ')}`;
}

function getQualityNotesValue(poId) {
  return (document.getElementById(`qa_notes_${poId}`)?.value || '').trim();
}

function getQualitySkipReasonValue(poId) {
  return (document.getElementById(`qa_skip_reason_${poId}`)?.value || '').trim();
}

async function persistQualityRelease(po) {
  const notes = getQualityNotesValue(po.id);
  if (!qualityBackendIsConnected() || !qualityPurchaseOrderBackendId(po)) {
    failBackendRequiredWrite(null, backendQualityState, 'QA releases require backend confirmation. Nothing was saved locally.');
    return false;
  }
  await releaseBackendQualityPo(po, notes);
  return true;
}

async function persistQualitySkip(poId) {
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!po) return;
  const notes = getQualityNotesValue(poId);
  const reason = getQualitySkipReasonValue(poId);
  if (!reason) {
    toast('Skip reason is required.');
    return;
  }
  if (!qualityBackendIsConnected() || !qualityPurchaseOrderBackendId(po)) {
    failBackendRequiredWrite(null, backendQualityState, 'QA skips require backend confirmation. Nothing was saved locally.');
    return false;
  }
  await skipBackendQualityPo(po, reason, notes);
  return true;
}

async function persistQualityPostShipmentCoa(poId, file) {
  if (!file) return;
  const po = state.purchaseOrders.find(x => x.id === poId);
  if (!qualityBackendIsConnected() || !po?._backendId) {
    failBackendRequiredWrite(null, backendQualityState, 'Post-shipment COA uploads require backend confirmation. Nothing was saved locally.');
    return false;
  }
  await attachBackendPostShipmentCoa(po._backendId, file);
  return true;
}

function readQualityFile(file, { category = 'coa' } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: uid(category === 'coa' ? 'qa' : 'qap'),
        name: file.name,
        type: file.type,
        size: file.size,
        fileCategory: category,
        dataUrl: reader.result,
        uploadedAt: new Date().toISOString(),
        uploadedBy: backendAuthState.user?.name || state.users?.[0]?.name || 'QA'
      });
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function applyQualityReleaseStatus(po, status, notes, reason = '') {
  const now = new Date().toISOString();
  po.status = status;
  po.qaNotes = notes || po.qaNotes || '';
  po.qaReleaseType = reason ? 'skip' : status;
  po.postShipmentCoaFileId = po.postShipmentCoaFileId || '';
  if (reason) {
    po.qaReleasedAt = '';
    po.qaReleasedByUserId = '';
    po.qaSkippedAt = now;
    po.qaSkippedByUserId = backendAuthState.user?.id || 'qa';
    po.qaSkipReason = reason;
  } else {
    po.qaReleasedAt = now;
    po.qaReleasedByUserId = backendAuthState.user?.id || 'qa';
    po.qaSkippedAt = '';
    po.qaSkippedByUserId = '';
    po.qaSkipReason = '';
  }
}

function releaseLocalQualityPo(po, notes) {
  if (!po.coa) {
    toast('Upload a COA first.');
    return;
  }
  const status = qualityReleaseTargetStatus(po);
  applyQualityReleaseStatus(po, status, notes);
  saveState();
}

function skipLocalQualityRelease(po, reason, notes) {
  if (!reason) {
    toast('Skip reason is required.');
    return;
  }
  const status = qualityReleaseTargetStatus(po);
  applyQualityReleaseStatus(po, status, notes, reason);
  saveState();
}

function backendCustomerToLocalCustomer(customer, existing = {}) {
  return {
    ...existing,
    id: customer.id,
    _backendId: customer.id,
    _backendSource: true,
    name: customer.name || existing.name || customer.id,
    contact: customer.contactName || existing.contact || '',
    email: customer.contactEmail || existing.email || '',
    phone: customer.phone || existing.phone || '',
    address: existing.address || '',
    notes: existing.notes || '',
    status: customer.status || existing.status || 'active',
    specSheet: existing.specSheet || null,
    copackingAgreement: existing.copackingAgreement || null
  };
}

function backendProductToLocalProduct(product, existing = {}) {
  return {
    ...existing,
    id: product.id,
    _backendId: product.id,
    _backendSource: true,
    sku: product.sku || existing.sku || product.id,
    name: product.name || existing.name || product.sku || product.id,
    customerId: product.customerId || existing.customerId || '',
    room: product.productionRoom || existing.room || 'Main',
    size: product.size ?? existing.size ?? 0,
    sizeUnit: product.sizeUnit || existing.sizeUnit || 'oz',
    price: typeof product.unitPriceCents === 'number' ? product.unitPriceCents / 100 : (existing.price || 0),
    notes: product.notes || product.description || existing.notes || '',
    caseQty: product.caseQuantity ?? existing.caseQty ?? 0,
    caseSticker: product.caseSticker || existing.caseSticker || '',
    kosher: !!(product.kosher ?? existing.kosher),
    dailyProductionRate: product.dailyProductionRate ?? existing.dailyProductionRate ?? 0,
    allergen: !!(product.allergen ?? existing.allergen),
    allergenDetails: product.allergenDetails || existing.allergenDetails || '',
    finishedGoodId: existing.finishedGoodId || '',
    productImage: existing.productImage || null,
    nfpImage: existing.nfpImage || null,
    status: product.status || existing.status || 'active'
  };
}

function backendMasterItemToLocalMasterItem(item, existing = {}) {
  return {
    ...existing,
    id: item.id,
    _backendId: item.id,
    _backendSource: true,
    name: item.name || existing.name || item.sku || item.id,
    sku: item.sku || existing.sku || '',
    itemType: item.itemType || existing.itemType || 'other',
    uom: item.unitOfMeasure === 'lb' ? 'LBS' : item.unitOfMeasure === 'ea' ? 'Each' : (item.unitOfMeasure || existing.uom || 'LBS'),
    allergens: Array.isArray(item.allergens) ? item.allergens : (existing.allergens || []),
    customerId: item.customerId || existing.customerId || 'general'
  };
}

function backendInventoryItemToLocalIngredient(item, existing = {}) {
  const lots = parseJsonFallback(item.lotsJson, existing.lots || []);
  return {
    ...existing,
    id: item.id,
    _backendId: item.id,
    _backendSource: true,
    masterItemId: item.masterItemId,
    name: item.masterItemName || existing.name || item.masterItemId,
    category: item.category || existing.category || 'Ingredient',
    supplierId: item.supplierId || existing.supplierId || '',
    customerId: item.customerId || existing.customerId || 'general',
    stock: item.onHandQuantity ?? existing.stock ?? 0,
    allocatedQuantity: item.allocatedQuantity ?? existing.allocatedQuantity ?? 0,
    netAvailableQuantity: item.netAvailableQuantity ?? ((item.onHandQuantity || 0) - (item.allocatedQuantity || 0)),
    reorderLevel: item.reorderPointQuantity ?? existing.reorderLevel ?? 0,
    unit: item.unitOfMeasure || existing.unit || 'lb',
    cost: typeof item.unitCostCents === 'number' ? item.unitCostCents / 100 : (existing.cost || 0),
    leadTimeDays: item.leadTimeDays ?? existing.leadTimeDays ?? 0,
    location: item.location || existing.location || '',
    lotNumber: item.lotNumber || existing.lotNumber || '',
    lots,
    coa: existing.coa || null
  };
}

function backendReceivingToLocal(entry, existing = {}) {
  return {
    ...existing,
    id: entry.id,
    _backendId: entry.id,
    _backendSource: true,
    receivingId: entry.receivingId,
    date: entry.date,
    time: entry.time,
    masterItemId: entry.masterItemId,
    inventoryItemId: entry.inventoryItemId || '',
    itemName: entry.itemName,
    packages: entry.packages,
    qtyPerPackage: entry.quantityPerPackage,
    totalQty: entry.totalQuantity,
    uom: entry.unitOfMeasure,
    lot: entry.lotNumber || '',
    allergens: entry.allergens || [],
    receivedBy: entry.receivedBy || '',
    carrier: entry.carrier || '',
    supplierId: entry.supplierId || ''
  };
}

function backendMoveToLocal(entry, existing = {}) {
  return {
    ...existing,
    id: entry.id,
    _backendId: entry.id,
    _backendSource: true,
    moveId: entry.moveId,
    date: entry.date,
    time: entry.time,
    receivingId: entry.receivingId,
    masterItemId: entry.masterItemId,
    inventoryItemId: entry.inventoryItemId || '',
    itemName: entry.itemName,
    lot: entry.lotNumber || '',
    caseCount: entry.caseCount,
    qtyPerCase: entry.quantityPerCase,
    qtyMoved: entry.quantityMoved,
    uom: entry.unitOfMeasure,
    movedBy: entry.movedBy || '',
    fromLocation: entry.fromLocation || '',
    toLocation: entry.toLocation || ''
  };
}

function backendNeedRowToLocalIngredient(row, existing = {}) {
  return {
    ...existing,
    id: row.inventoryItemId,
    _backendNeedRow: row,
    _backendSource: true,
    masterItemId: row.masterItemId,
    name: row.name,
    supplierId: row.supplierId || '',
    stock: row.onHandQuantity || 0,
    allocatedQuantity: row.allocatedQuantity || 0,
    netAvailableQuantity: row.netAvailableQuantity || 0,
    reorderLevel: row.reorderPointQuantity || 0,
    unit: row.unitOfMeasure || existing.unit || 'lb',
    cost: typeof row.unitCostCents === 'number' ? row.unitCostCents / 100 : (existing.cost || 0),
    leadTimeDays: row.leadTimeDays || 0
  };
}

function backendProcurementStatusToLocal(status) {
  if (status === 'completed') return 'Received';
  if (status === 'partially_received') return 'Partial Receipt';
  if (status === 'draft') return 'Draft';
  return 'In Order';
}

function localProcurementStatusToBackend(status) {
  if (status === 'Received') return 'completed';
  if (status === 'Partial Receipt') return 'partially_received';
  if (status === 'Draft') return 'draft';
  return 'ordered';
}

function backendProcurementOrderToLocal(order, existing = {}) {
  return {
    ...existing,
    id: order.procurementOrderNumber || order.id,
    _backendId: order.id,
    _backendSource: true,
    qbPoNumber: order.quickBooksPoNumber || '',
    supplierId: order.supplierId || '',
    supplierNameSnapshot: order.supplierNameSnapshot || '',
    dateOrdered: order.dateOrdered || existing.dateOrdered || '',
    expectedDate: order.expectedDate || existing.expectedDate || '',
    receivedDate: order.receivedDate || existing.receivedDate || '',
    status: backendProcurementStatusToLocal(order.status),
    notes: order.notes || '',
    items: (order.lines || []).map(line => ({
      ingredientId: line.inventoryItemId || line.masterItemId,
      masterItemId: line.masterItemId,
      _backendLineId: line.id,
      qty: line.quantityOrdered || 0,
      receivedQty: line.quantityReceived || 0,
      unitCost: typeof line.unitCostCents === 'number' ? line.unitCostCents / 100 : 0,
      suggestedQuantity: line.suggestedQuantity || line.quantityOrdered || 0,
      sourceReason: line.sourceReason || 'low_stock'
    }))
  };
}

function procurementItemToNeedRow(item) {
  if (item._needRow) return item._needRow;
  const inv = state.ingredients.find(i => i.id === item.ingredientId || i.masterItemId === item.masterItemId) || {};
  const stock = inv.stock || 0;
  const allocated = inv.allocatedQuantity || 0;
  const reorder = inv.reorderLevel || 0;
  return {
    inventoryItemId: inv._backendId || inv.id || item.ingredientId,
    masterItemId: inv.masterItemId || item.masterItemId || item.ingredientId,
    name: inv.name || item.ingredientId,
    supplierId: inv.supplierId || null,
    onHandQuantity: stock,
    allocatedQuantity: allocated,
    netAvailableQuantity: stock - allocated,
    reorderPointQuantity: reorder,
    shortageQuantity: 0,
    suggestedQuantity: item.qty || reorder || 1,
    unitOfMeasure: inv.unit || 'lb',
    unitCostCents: Math.round((item.unitCost || inv.cost || 0) * 100),
    leadTimeDays: inv.leadTimeDays || 0,
    reason: 'low_stock',
    sourcePurchaseOrderLineId: null
  };
}

function parseJsonFallback(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

function mapBackendSnapshot(localRows, backendRows, mapper) {
  return (backendRows || []).map(row => mapper(row, (localRows || []).find(local => local._backendId === row.id || local.id === row.id)));
}

function mergeBackendCustomers(customers) {
  state.customers = mapBackendSnapshot(state.customers || [], customers || [], backendCustomerToLocalCustomer);
}

function mergeBackendProducts(products) {
  state.products = mapBackendSnapshot(state.products || [], products || [], backendProductToLocalProduct);
  state.boms = state.boms || {};
  (products || []).forEach(product => {
    if (Array.isArray(product.bomItems)) {
      state.boms[product.id] = product.bomItems.map(item => ({
        ingredientId: item.masterItemId,
        qty: item.quantityPerUnit,
        pct: item.percentOfFormula || 0
      }));
    }
  });
}

function mergeBackendMasterItems(items) {
  state.masterItems = mapBackendSnapshot(state.masterItems || [], items || [], backendMasterItemToLocalMasterItem);
}

function mergeBackendInventoryItems(items) {
  state.ingredients = mapBackendSnapshot(state.ingredients || [], items || [], backendInventoryItemToLocalIngredient);
}

function mergeBackendReceivingEntries(entries) {
  state.receivingLog = mapBackendSnapshot(state.receivingLog || [], entries || [], backendReceivingToLocal);
}

function mergeBackendMoveEntries(entries) {
  state.moveLog = mapBackendSnapshot(state.moveLog || [], entries || [], backendMoveToLocal);
}

function mergeBackendProcurementOrders(orders) {
  state.procurementOrders = mapBackendSnapshot(state.procurementOrders || [], orders || [], backendProcurementOrderToLocal);
}

function backendProductionRunToLocal(run, existing = {}) {
  return {
    ...existing,
    _backendProductionRunId: run.id,
    _backendProductionRunStatus: run.status,
    productionDate: run.productionDate || existing.productionDate || null,
    productionEndDate: run.productionEndDate || existing.productionEndDate || run.productionDate || null,
    productionRoom: run.productionRoom || existing.productionRoom || '',
    productionFinalized: run.status === 'finalized',
    completedAt: run.finalizedAt || existing.completedAt || null,
    productionCorrectionCount: run.correctionCount || 0,
    completionNotes: run.notes || existing.completionNotes || '',
    status: run.status === 'finalized' ? 'qa_review' : 'in_production'
  };
}

function backendProductionLogToLocal(log, existing = {}) {
  return {
    ...existing,
    id: log.id,
    _backendId: log.id,
    _backendProductionRunId: log.productionRunId,
    logId: log.logId || existing.logId || log.id,
    poId: localPoIdFromBackendPurchaseOrderId(log.purchaseOrderId),
    productionDate: log.productionDate || '',
    productionEndDate: log.productionEndDate || '',
    room: log.productionRoom || '',
    completedAt: log.completedAt || '',
    wasteLossPct: log.overallWastePercent || 0,
    notes: log.notes || '',
    lines: (log.lineSnapshot || []).map(line => ({
      productId: line.productId,
      ordered: line.orderedQuantity,
      produced: line.quantityProduced,
      cases: line.casesProduced,
      lot: line.lotNumber
    })),
    materials: (log.materialSnapshot || []).map(material => ({
      ingredientId: material.masterItemId,
      category: material.materialType === 'packaging' ? 'Packaging' : 'Ingredient',
      theoretical: material.theoreticalQuantity,
      actual: material.actualUsedQuantity,
      lot: material.lotNumber,
      productId: material.productId,
      lineIndex: null
    }))
  };
}

function localPoIdFromBackendPurchaseOrderId(purchaseOrderId) {
  return (state.purchaseOrders || []).find(po => po._backendId === purchaseOrderId || po.id === purchaseOrderId)?.id || purchaseOrderId;
}

function mergeBackendProductionRuns(runs) {
  backendProductionState.runs = runs || [];
  (runs || []).forEach(run => {
    const po = state.purchaseOrders.find(p => p._backendId === run.purchaseOrderId || p.id === run.purchaseOrderId);
    if (po) Object.assign(po, backendProductionRunToLocal(run, po));
  });
}

function mergeBackendProductionLogs(logs) {
  backendProductionState.logs = logs || [];
  state.productionLog = mapBackendSnapshot(state.productionLog || [], logs || [], backendProductionLogToLocal);
}

async function loadBackendProduction() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendProductionState.loading || backendProductionState.loaded) return;
  backendProductionState.loading = true;
  try {
    await loadBackendProductionRuns();
    await loadBackendProductionLogs();
    backendProductionState.status = 'connected';
    backendProductionState.lastError = '';
    backendProductionState.loaded = true;
  } catch (error) {
    backendProductionState.status = 'error';
    backendProductionState.lastError = 'Production backend data is unavailable, so local demo production remains visible.';
  } finally {
    backendProductionState.loading = false;
  }
}

async function loadBackendProductionRuns() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return [];
  const runs = await apiRequest('/api/production/runs');
  mergeBackendProductionRuns(runs || []);
  return runs;
}

async function loadBackendProductionLogs() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return [];
  const logs = await apiRequest('/api/production/logs');
  mergeBackendProductionLogs(logs || []);
  return logs;
}

async function scheduleBackendProductionRun(po, productionDate, productionEndDate, productionRoom, notes) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  const run = await apiRequest('/api/production/schedule', {
    method: 'POST',
    body: JSON.stringify({
      purchaseOrderId,
      productionDate,
      productionEndDate,
      productionRoom,
      notes: notes || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendProductionRuns([run]);
  backendProductionState.loaded = false;
  return run;
}

function productionFinalizePayload(po) {
  return {
    actorUserId: BACKEND_ACTOR_USER_ID,
    lines: (po.lines || []).map((line) => ({
      purchaseOrderLineId: line.id,
      productId: line.productId,
      quantityProduced: typeof line.actualQty === 'number' ? line.actualQty : line.qty,
      casesProduced: line.casesProduced || 0,
      lotNumber: line.lotNumber || ''
    })),
    materialActuals: (po.materialsUsed || []).map((material) => {
      const line = typeof material.lineIndex === 'number' ? po.lines[material.lineIndex] : null;
      return {
        masterItemId: material.ingredientId,
        productId: material.productId || line?.productId || null,
        purchaseOrderLineId: line?.id || null,
        actualUsedQuantity: material.actual || 0,
        lotNumber: material.lot || null
      };
    }),
    notes: po.completionNotes || null
  };
}

async function finalizeBackendProductionRun(po) {
  const productionRunId = po._backendProductionRunId;
  if (!productionRunId) throw new Error('Backend production run is not scheduled yet.');
  const run = await apiRequest(`/api/production/runs/${encodeURIComponent(productionRunId)}/finalize`, {
    method: 'POST',
    body: JSON.stringify(productionFinalizePayload(po))
  });
  mergeBackendProductionRuns([run]);
  await loadBackendProductionLogs();
  backendProductionState.loaded = false;
  return run;
}

async function reopenBackendProductionRun(po, reason) {
  const productionRunId = po._backendProductionRunId;
  if (!productionRunId) throw new Error('Backend production run is unavailable.');
  const run = await apiRequest(`/api/production/runs/${encodeURIComponent(productionRunId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason, actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendProductionRuns([run]);
  backendProductionState.loaded = false;
  return run;
}

async function loadBackendProcurement() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendProcurementState.loading || backendProcurementState.loaded) return;
  backendProcurementState.loading = true;
  try {
    await loadBackendProcurementNeedToOrder();
    await loadBackendProcurementOrders();
    backendProcurementState.status = 'connected';
    backendProcurementState.lastError = '';
    backendProcurementState.loaded = true;
  } catch (error) {
    backendProcurementState.status = 'error';
    backendProcurementState.lastError = 'Procurement backend data is unavailable, so local demo procurement remains visible.';
  } finally {
    backendProcurementState.loading = false;
  }
}

async function loadBackendProcurementNeedToOrder() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return [];
  const rows = await apiRequest('/api/procurement/need-to-order');
  backendProcurementState.needRows = rows || [];
  return rows;
}

async function loadBackendProcurementOrders() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return [];
  const orders = await apiRequest('/api/procurement/orders');
  mergeBackendProcurementOrders(orders);
  return orders;
}

async function saveBackendProcurementOrder(id, isNew, data) {
  if (isNew) {
    const supplier = getSupplier(data.supplierId);
    const order = await apiRequest('/api/procurement/orders', {
      method: 'POST',
      body: JSON.stringify({
        supplierId: data.supplierId || null,
        supplierNameSnapshot: supplier?.name || data.supplierNameSnapshot || null,
        quickBooksPoNumber: data.qbPoNumber || null,
        dateOrdered: data.dateOrdered || null,
        expectedDate: data.expectedDate || null,
        notes: data.notes || null,
        rows: (data.items || []).map(procurementItemToNeedRow)
      })
    });
    const desiredStatus = localProcurementStatusToBackend(data.status);
    const submitted = desiredStatus === 'draft'
      ? order
      : await submitBackendProcurementOrder(order.id);
    mergeBackendProcurementOrders([submitted]);
    return submitted;
  }

  const backendId = data._backendId || state.procurementOrders.find(p => p.id === id)?._backendId || id;
  const order = await apiRequest(`/api/procurement/orders/${encodeURIComponent(backendId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      quickBooksPoNumber: data.qbPoNumber || null,
      dateOrdered: data.dateOrdered || null,
      expectedDate: data.expectedDate || null,
      notes: data.notes || null
    })
  });
  mergeBackendProcurementOrders([order]);
  return order;
}

async function submitBackendProcurementOrder(id) {
  const order = await apiRequest(`/api/procurement/orders/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  mergeBackendProcurementOrders([order]);
  return order;
}

async function receiveBackendProcurementOrder(id, lines) {
  const order = await apiRequest(`/api/procurement/orders/${encodeURIComponent(id)}/receive`, {
    method: 'POST',
    body: JSON.stringify({
      receiptDate: new Date().toISOString().slice(0,10),
      lines
    })
  });
  mergeBackendProcurementOrders([order]);
  backendInventoryState.loaded = false;
  await loadBackendInventory();
  return order;
}

async function loadBackendCustomers() {
  if (!backendAuthState.token || backendCustomerState.loading || backendCustomerState.loaded) return;
  backendCustomerState.loading = true;
  try {
    const customers = await apiRequest('/api/customers');
    mergeBackendCustomers(customers);
    backendCustomerState.status = 'connected';
    backendCustomerState.lastError = '';
    backendCustomerState.loaded = true;
  } catch (error) {
    backendCustomerState.status = 'error';
    backendCustomerState.lastError = 'Customer backend data is unavailable, so local demo customers remain visible.';
  } finally {
    backendCustomerState.loading = false;
  }
}

async function loadBackendCustomerProfile() {
  if (!backendAuthState.token) return null;
  backendCustomerState.loading = true;
  try {
    const customer = await apiRequest('/api/customers/me');
    mergeBackendCustomers([customer]);
    backendCustomerState.status = 'connected';
    backendCustomerState.lastError = '';
    backendCustomerState.loaded = true;
    return customer;
  } catch (error) {
    backendCustomerState.status = 'error';
    backendCustomerState.lastError = 'Customer profile backend data is unavailable, so local demo customer details remain visible.';
    return null;
  } finally {
    backendCustomerState.loading = false;
  }
}

async function loadBackendProducts() {
  if (!backendAuthState.token || backendProductState.loading || backendProductState.loaded) return;
  backendProductState.loading = true;
  try {
    const products = await apiRequest('/api/products');
    mergeBackendProducts(products);
    backendProductState.status = 'connected';
    backendProductState.lastError = '';
    backendProductState.loaded = true;
  } catch (error) {
    backendProductState.status = 'error';
    backendProductState.lastError = 'Product backend data is unavailable, so local demo products remain visible.';
  } finally {
    backendProductState.loading = false;
  }
}

async function loadBackendMasterItems() {
  if (!backendAuthState.token || backendMasterItemState.loading || backendMasterItemState.loaded) return;
  backendMasterItemState.loading = true;
  try {
    const items = await apiRequest('/api/master-items');
    mergeBackendMasterItems(items);
    backendMasterItemState.status = 'connected';
    backendMasterItemState.lastError = '';
    backendMasterItemState.loaded = true;
  } catch (error) {
    backendMasterItemState.status = 'error';
    backendMasterItemState.lastError = 'Master List backend data is unavailable, so local demo master items remain visible.';
  } finally {
    backendMasterItemState.loading = false;
  }
}

async function loadBackendInventory() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendInventoryState.loading || backendInventoryState.loaded) return;
  backendInventoryState.loading = true;
  try {
    const items = await apiRequest('/api/inventory');
    mergeBackendInventoryItems(items);
    await loadBackendReceivingEntries();
    await loadBackendMoveEntries();
    await loadBackendInventorySignals();
    backendInventoryState.status = 'connected';
    backendInventoryState.lastError = '';
    backendInventoryState.loaded = true;
  } catch (error) {
    backendInventoryState.status = 'error';
    backendInventoryState.lastError = 'Inventory backend data is unavailable, so local demo inventory remains visible.';
  } finally {
    backendInventoryState.loading = false;
  }
}

async function loadBackendReceivingEntries() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return;
  const entries = await apiRequest('/api/inventory/receiving');
  mergeBackendReceivingEntries(entries);
}

async function loadBackendMoveEntries() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return;
  const entries = await apiRequest('/api/inventory/moves');
  mergeBackendMoveEntries(entries);
}

async function loadBackendInventorySignals() {
  if (!backendAuthState.token || backendAuthState.user?.userType === 'customer') return null;
  backendInventoryState.signals = await apiRequest('/api/inventory/signals');
  return backendInventoryState.signals;
}

function buildBackendProductPayload(data, cleanFormula) {
  return {
    customerId: data.customerId || null,
    sku: data.sku,
    name: data.name,
    description: data.notes || null,
    productionRoom: data.room || null,
    size: data.size || null,
    sizeUnit: data.sizeUnit || null,
    caseQuantity: data.caseQty || null,
    caseSticker: data.caseSticker || null,
    unitPriceCents: Math.round((data.price || 0) * 100),
    kosher: !!data.kosher,
    allergen: !!data.allergen,
    allergenDetails: data.allergenDetails || null,
    dailyProductionRate: data.dailyProductionRate || null,
    notes: data.notes || null,
    status: data.status || 'active',
    bomItems: (cleanFormula || []).map(row => ({
      masterItemId: row.ingredientId,
      quantityPerUnit: row.qty,
      percentOfFormula: row.pct || 0
    }))
  };
}

async function saveBackendProduct(id, isNew, data, cleanFormula) {
  const path = isNew ? '/api/products' : `/api/products/${encodeURIComponent(data._backendId || id)}`;
  const product = await apiRequest(path, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify(buildBackendProductPayload(data, cleanFormula))
  });
  mergeBackendProducts([product]);
  return product;
}

async function saveBackendMasterItem(id, isNew, data) {
  const path = isNew ? '/api/master-items' : `/api/master-items/${encodeURIComponent(data._backendId || id)}`;
  const item = await apiRequest(path, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify({
      sku: data.sku || data.name,
      name: data.name,
      itemType: data.itemType || 'other',
      unitOfMeasure: data.uom === 'LBS' ? 'lb' : data.uom === 'Each' ? 'ea' : data.uom,
      customerId: data.customerId || 'general',
      allergens: data.allergens || []
    })
  });
  mergeBackendMasterItems([item]);
  return item;
}

function masterItemForInventoryName(itemName) {
  return (state.masterItems || []).find(m => m.name === itemName || m.id === itemName);
}

async function saveBackendInventoryItem(id, isNew, data) {
  const master = masterItemForInventoryName(data.name);
  const backendId = data._backendId || id;
  const payload = {
    masterItemId: data.masterItemId || master?.id,
    category: data.category,
    supplierId: data.supplierId || null,
    customerId: data.customerId || 'general',
    onHandQuantity: data.stock || 0,
    allocatedQuantity: data.allocatedQuantity || 0,
    reorderPointQuantity: data.reorderLevel || 0,
    unitOfMeasure: data.unit || master?.unitOfMeasure || 'lb',
    unitCostCents: Math.round((data.cost || 0) * 100),
    leadTimeDays: data.leadTimeDays || 0,
    location: data.location || null,
    lotNumber: data.lotNumber || null,
    lotsJson: JSON.stringify(data.lots || [])
  };
  const item = await apiRequest(isNew ? '/api/inventory' : `/api/inventory/${encodeURIComponent(backendId)}`, {
    method: isNew ? 'POST' : 'PATCH',
    body: JSON.stringify(payload)
  });
  mergeBackendInventoryItems([item]);
  return item;
}

async function saveBackendReceivingEntry(data) {
  const entry = await apiRequest('/api/inventory/receiving', {
    method: 'POST',
    body: JSON.stringify({
      masterItemId: data.masterItemId,
      inventoryItemId: data.inventoryItemId || null,
      itemName: data.itemName,
      date: data.date,
      time: data.time,
      packages: data.packages || 0,
      quantityPerPackage: data.qtyPerPackage || 0,
      unitOfMeasure: data.uom,
      lotNumber: data.lot || null,
      allergens: data.allergens || [],
      receivedBy: data.receivedBy || null,
      carrier: data.carrier || null,
      supplierId: data.supplierId || null
    })
  });
  mergeBackendReceivingEntries([entry]);
  return entry;
}

async function saveBackendMoveEntry(data) {
  const entry = await apiRequest('/api/inventory/moves', {
    method: 'POST',
    body: JSON.stringify({
      receivingId: data.receivingId,
      date: data.date,
      time: data.time,
      caseCount: data.caseCount || 0,
      quantityPerCase: data.qtyPerCase || 0,
      movedBy: data.movedBy || null,
      fromLocation: data.fromLocation || null,
      toLocation: data.toLocation || null
    })
  });
  mergeBackendMoveEntries([entry]);
  return entry;
}

async function uploadBackendProductMedia(productId, file, fileCategory) {
  if (!file || !(file instanceof File)) return null;
  const form = new FormData();
  form.append('ownerType', 'product');
  form.append('ownerId', productId);
  form.append('fileCategory', fileCategory);
  form.append('file', file);
  return apiFormRequest('/api/files', form);
}

async function uploadBackendInventoryCoa(inventoryItemId, file) {
  if (!file || !(file instanceof File)) return null;
  const form = new FormData();
  form.append('ownerType', 'inventory_item');
  form.append('ownerId', inventoryItemId);
  form.append('fileCategory', 'inventory_coa');
  form.append('file', file);
  return apiFormRequest('/api/files', form);
}

function backendPurchaseOrderId(po) {
  return po?._backendId || po?.id || '';
}

function mergeBackendPurchaseOrders(records) {
  const backendPos = (records || []).map(mapBackendPurchaseOrderToPrototype);
  const backendIds = new Set(backendPos.map(po => po._backendId));
  state.purchaseOrders = [
    ...backendPos,
    ...state.purchaseOrders.filter(po => !po._backendId || !backendIds.has(po._backendId))
  ];
  try { saveState(); } catch (err) {}
  return backendPos;
}

function mapBackendPurchaseOrderToPrototype(po) {
  const backendStatus = po.status || 'draft';
  const existing = (state.purchaseOrders || []).find(local => local._backendId === po.id || local.id === po.poNumber || local.id === po.id) || {};
  const shippingDetails = po.shippingDetails || {};
  const shippingPalletList = parseJsonFallback(shippingDetails.palletListJson, []);
  const backendShipping = {
    ...(existing.shipping || {}),
    bol: shippingDetails.bolNumber || existing.shipping?.bol || '',
    proNumber: shippingDetails.proNumber || existing.shipping?.proNumber || '',
    carrier: shippingDetails.carrier || existing.shipping?.carrier || '',
    freightClass: shippingDetails.freightClass || existing.shipping?.freightClass || '',
    notes: shippingDetails.notes || po.shippingNotes || existing.shipping?.notes || '',
    palletList: shippingPalletList.length ? shippingPalletList : existing.shipping?.palletList,
    shipmentDocumentFileId: po.shipmentDocumentFileId || shippingDetails.shipmentDocumentFileId || existing.shipping?.shipmentDocumentFileId || ''
  };
  const prototypeStatus = backendStatus === 'approved_for_production'
    ? 'approved_for_production'
    : backendStatus === 'in_production'
      ? 'in_production'
      : backendStatus === 'qa_review'
        ? 'qa_review'
    : backendStatus === 'shipping'
      ? 'shipping'
    : backendStatus === 'completed'
      ? 'completed'
      : 'in_supply_chain';
  return {
    id: po.poNumber || po.id,
    _backendId: po.id,
    _backendSource: true,
    _backendStatus: backendStatus,
    _backendLines: po.lines || [],
    brand: '',
    customerId: po.customerId || '',
    poDate: new Date().toISOString().slice(0, 10),
    requestedDate: po.requestedShipDate || '',
    requestedShipDate: po.requestedShipDate || '',
    notes: po.notes || '',
    lines: (po.lines || []).map(line => ({
      id: line.id,
      productId: line.productId || '',
      qty: line.quantity || 0,
      price: 0,
      description: line.description || '',
      masterItemId: line.masterItemId || null,
      supply_chain_status: line.supplyChainStatus || 'pending'
    })),
    status: prototypeStatus,
    productionDate: po.productionDate || existing?.productionDate || null,
    productionEndDate: po.productionEndDate || existing?.productionEndDate || null,
    productionRoom: po.productionRoom || existing?.productionRoom || null,
    productionFinalized: backendStatus === 'qa_review' ? true : !!existing?.productionFinalized,
    depositStatus: mapBackendDepositToPrototype(po.depositStatus),
    poFile: null,
    _backendFiles: [],
    scOverrides: {},
    qaNotes: po.qaNotes || existing?.qaNotes || '',
    qaReleasedAt: po.qaReleasedAt || existing?.qaReleasedAt || '',
    qaReleasedByUserId: po.qaReleasedByUserId || existing?.qaReleasedByUserId || '',
    qaReleaseType: po.qaReleaseType || existing?.qaReleaseType || '',
    qaSkippedAt: po.qaSkippedAt || existing?.qaSkippedAt || '',
    qaSkippedByUserId: po.qaSkippedByUserId || existing?.qaSkippedByUserId || '',
    qaSkipReason: po.qaSkipReason || existing?.qaSkipReason || '',
    postShipmentCoaFileId: po.postShipmentCoaFileId || existing?.postShipmentCoaFileId || '',
    shipping: backendShipping,
    shippedAt: po.shippedAt || existing?.shippedAt || '',
    stockedAt: po.stockedAt || existing?.stockedAt || ''
  };
}

function mapBackendDepositToPrototype(status) {
  return ['not_required', 'received', 'waived'].includes(status) ? 'ok' : 'on_hold';
}

function mapPrototypeDepositToBackend(status) {
  return status === 'ok' ? 'received' : 'required';
}

function buildBackendPurchaseOrderPayload(localPo) {
  return {
    poNumber: localPo.id,
    customerId: localPo.customerId,
    requestedShipDate: localPo.requestedDate || null,
    notes: localPo.notes || null,
    actorUserId: BACKEND_ACTOR_USER_ID,
    lines: (localPo.lines || []).map(line => {
      const product = getProduct(line.productId);
      return {
        description: product?.name || line.description || line.productId || 'Purchase order line',
        quantity: Number(line.qty || line.quantity || 0),
        unitOfMeasure: line.unitOfMeasure || 'Each',
        productId: line.productId || null,
        masterItemId: line.masterItemId || null
      };
    })
  };
}

async function uploadBackendPurchaseOrderFile(purchaseOrderId, file) {
  if (!file) return null;
  const form = new FormData();
  form.set('ownerType', 'purchase_order');
  form.set('ownerId', purchaseOrderId);
  form.set('fileCategory', 'po_file');
  form.set('file', file);
  return apiFormRequest('/api/files', form);
}

async function loadBackendPurchaseOrderFiles(purchaseOrderId) {
  return apiRequest(`/api/files?ownerType=purchase_order&ownerId=${encodeURIComponent(purchaseOrderId)}`);
}

async function attachBackendFilesToPurchaseOrder(localPo) {
  const purchaseOrderId = backendPurchaseOrderId(localPo);
  if (!purchaseOrderId) return localPo;
  const files = await loadBackendPurchaseOrderFiles(purchaseOrderId);
  localPo._backendFiles = files || [];
  const firstPoFile = (files || []).find(file => file.fileCategory === 'po_file') || files?.[0] || null;
  localPo.poFile = firstPoFile ? mapBackendFileToPrototype(firstPoFile) : localPo.poFile || null;
  return localPo;
}

async function hydrateBackendPurchaseOrderFiles(localPos) {
  for (const po of localPos || []) {
    try {
      await attachBackendFilesToPurchaseOrder(po);
    } catch (error) {
      po._backendFileError = error?.message || 'PO files unavailable';
    }
  }
}

function mapBackendFileToPrototype(file) {
  return {
    _backendFileId: file.id,
    _backendOwnerId: file.ownerId,
    _backendFile: true,
    name: file.fileName,
    type: file.contentType || '',
    size: file.sizeBytes || 0,
    uploadedAt: file.createdAt,
    fileCategory: file.fileCategory,
    dataUrl: ''
  };
}

async function downloadBackendFile(fileId, fileName) {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/download`, {
    headers: {
      ...authHeaders()
    }
  });
  if (!response.ok) {
    throw new Error(`File download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function ensureBackendPurchaseOrdersLoaded() {
  if (backendApiState.loadedPurchaseOrders || backendApiState.loadingPurchaseOrders) return;
  backendApiState.loadingPurchaseOrders = true;
  try {
    const records = await apiRequest('/api/purchase-orders');
    const backendPos = mergeBackendPurchaseOrders(records);
    await hydrateBackendPurchaseOrderFiles(backendPos);
    backendApiState.loadedPurchaseOrders = true;
    if (currentPage === 'purchase-orders') renderPurchaseOrders(document.getElementById('content'));
    if (currentPage === 'supply-chain') renderSupplyChain(document.getElementById('content'));
  } catch (error) {
    markBackendUnavailable(error);
    backendApiState.loadedPurchaseOrders = true;
  } finally {
    backendApiState.loadingPurchaseOrders = false;
    if (currentPage === 'purchase-orders') renderPurchaseOrders(document.getElementById('content'));
    if (currentPage === 'supply-chain') renderSupplyChain(document.getElementById('content'));
  }
}

async function refreshBackendPurchaseOrders() {
  backendApiState.loadedPurchaseOrders = false;
  await ensureBackendPurchaseOrdersLoaded();
}

async function createBackendPurchaseOrder(localPo) {
  const created = await apiRequest('/api/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(buildBackendPurchaseOrderPayload(localPo))
  });
  const uploadFile = localPo._pendingUploadFile || (localPo.poFile instanceof File ? localPo.poFile : null);
  if (uploadFile) {
    try {
      await uploadBackendPurchaseOrderFile(created.id, uploadFile);
    } catch (error) {
      throw new Error(`Backend PO was created as draft, but file upload failed: ${error.message}`);
    }
  }
  const submitted = await apiRequest(`/api/purchase-orders/${encodeURIComponent(created.id)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId: BACKEND_ACTOR_USER_ID })
  });
  const merged = mergeBackendPurchaseOrders([submitted]);
  await hydrateBackendPurchaseOrderFiles(merged);
  return submitted;
}

async function updateBackendPurchaseOrder(localPo) {
  const purchaseOrderId = backendPurchaseOrderId(localPo);
  const updated = await apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      notes: localPo.notes || null,
      requestedShipDate: localPo.requestedDate || null,
      actorUserId: BACKEND_ACTOR_USER_ID
    })
  });
  mergeBackendPurchaseOrders([updated]);
  return updated;
}

async function readBackendPurchaseOrder(po) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  const record = await apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}`);
  const merged = mergeBackendPurchaseOrders([record]);
  await hydrateBackendPurchaseOrderFiles(merged);
  return merged[0];
}

async function createBackendPurchaseOrderChangeRequest(purchaseOrderId, requestType, message) {
  return apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/change-requests`, {
    method: 'POST',
    body: JSON.stringify({ requestType, message })
  });
}

async function updateBackendDepositStatus(po, status) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  const updated = await apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/deposit-status`, {
    method: 'POST',
    body: JSON.stringify({ depositStatus: mapPrototypeDepositToBackend(status), actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendPurchaseOrders([updated]);
  return updated;
}

async function reviewBackendSupplyChainLines(po, supplyChainStatus) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  const lines = po?._backendLines || [];
  for (const line of lines) {
    await apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/lines/${encodeURIComponent(line.id)}/supply-chain-review`, {
      method: 'POST',
      body: JSON.stringify({ supplyChainStatus, actorUserId: BACKEND_ACTOR_USER_ID })
    });
  }
  await refreshBackendPurchaseOrders();
}

async function approveBackendPurchaseOrder(po) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  const approved = await apiRequest(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/approve-for-production`, {
    method: 'POST',
    body: JSON.stringify({ actorUserId: BACKEND_ACTOR_USER_ID })
  });
  mergeBackendPurchaseOrders([approved]);
  return approved;
}

