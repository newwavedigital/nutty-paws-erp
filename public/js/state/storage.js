/* =========================================================================
   STATE & STORAGE
   ========================================================================= */
const STORAGE_KEY = 'nuttypaws_erp_v1';

const SAMPLE_DATA = {
  masterItems: [],
  receivingLog: [],
  moveLog: [],
  shippingLog: [],
  productionLog: [],
  rdRequests: [],
  suppliers: [],
  customers: [],
  products: [],
  ingredients: [],
  boms: {},
  purchaseOrders: [],
  libraryFolders: [],
  libraryFiles: [],
  channels: [],
  messages: [],
  complaints: [],
  lots: [],
  sanitationLogs: [],
  ccpLogs: [],
  ncrs: [],
  recalls: [],
  procurementOrders: [],
  users: [],
  specSheets: [],
  publicLinks: [],
  feedback: [],
  pickPackOrders: [],
  maintenanceEvents: [],
  equipmentIssues: [],
  swabRecords: [],
  productionRequests: []
};

function createEmptyAppState() {
  return {
    customers: [],
    products: [],
    boms: {},
    purchaseOrders: [],
    ingredients: [],
    masterItems: [],
    suppliers: [],
    libraryFolders: [],
    libraryFiles: [],
    channels: [],
    messages: [],
    complaints: [],
    lots: [],
    sanitationLogs: [],
    ccpLogs: [],
    ncrs: [],
    recalls: [],
    procurementOrders: [],
    users: [],
    specSheets: [],
    publicLinks: [],
    feedback: [],
    pickPackOrders: [],
    maintenanceEvents: [],
    equipmentIssues: [],
    swabRecords: [],
    productionRequests: [],
    receivingLog: [],
    moveLog: [],
    shippingLog: [],
    productionLog: [],
    rdRequests: []
  };
}

// Master List: units of measure + allergen options. Every inventory item's name is
// drawn from the Master List, the single source of truth for item definitions.
// Declared before loadState() runs because seeding the Master List references them.
const MASTER_UOMS = ['LBS', 'Each'];
const ALLERGENS = ['Peanut', 'Almond', 'Cashew', 'Walnut', 'Pecan', 'Hazelnut', 'Pistachio', 'Soy', 'Wheat', 'Milk', 'Sesame'];

const DATA_CACHE_KEY = `${STORAGE_KEY}_backend_cache_v1`;
const LEGACY_LOCAL_STATE_KEY = `${STORAGE_KEY}_legacy_local_state`;
const DEFAULT_CACHE_TTLS = {
  reference: 20 * 60 * 1000,
  inventory: 45 * 1000,
  workflow: 20 * 1000,
  chat: 0,
  feedback: 20 * 1000
};

const workingStore = createWorkingStore(loadState());
let state = workingStore.data;
const backendApiState = {
  status: 'unknown',
  lastError: '',
  loadedPurchaseOrders: false,
  loadingPurchaseOrders: false,
  purchaseOrdersError: '',
  hydratingPurchaseOrderFiles: false,
  purchaseOrderFilesHydrated: false,
  purchaseOrderLoadPromise: null,
  purchaseOrderFileHydrationPromise: null,
  purchaseOrderLoadRequestId: 0
};
const AUTH_STORAGE_KEY = `${STORAGE_KEY}_auth`;
const backendUserState = { status: 'local', lastError: '', loadingUsers: false };
const backendCustomerState = { status: 'local', lastError: '', loading: false, loaded: false };
const backendProductState = { status: 'local', lastError: '', loading: false, loaded: false };
const backendMasterItemState = { status: 'local', lastError: '', loading: false, loaded: false };
const backendInventoryState = { status: 'local', lastError: '', loading: false, loaded: false, signals: null };
const backendProcurementState = { status: 'local', lastError: '', loading: false, loaded: false, needRows: [] };
const backendProductionState = { status: 'local', lastError: '', loading: false, loaded: false, runs: [], logs: [] };
const backendQualityState = { status: 'local', lastError: '', loading: false, loaded: false, queue: [] };
const backendShippingState = { status: 'local', lastError: '', loading: false, loaded: false, queue: [], logs: [] };
const backendPickPackState = { status: 'local', lastError: '', loading: false, loaded: false, orders: [] };
const backendResearchState = { status: 'local', lastError: '', loading: false, loaded: false, requests: [] };
let confirmModalResolver = null;
let confirmModalPreviousState = null;
let backendAuthState = loadAuthState();
const BACKEND_ACTOR_USER_ID = 'phase-2a-frontend';
let pendingPoFile = null;
let pendingCustomerPortalFile = null;
const pendingShipmentDocumentFiles = new Map();
let customerPortalDirty = false;
let customerPortalSubmitting = false;
let lastModalTrigger = null;

function createWorkingStore(initialData = {}) {
  return {
    data: initialData,
    modules: {},
    pendingMutations: new Map(),
    cache: loadBackendCache()
  };
}

function loadBackendCache() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return { version: 1, modules: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.modules !== 'object') return { version: 1, modules: {} };
    return parsed;
  } catch (err) {
    return { version: 1, modules: {} };
  }
}

function writeConfirmedBackendCache(moduleName, records, meta = {}) {
  const envelope = {
    records: Array.isArray(records) ? records : [],
    fetchedAt: new Date().toISOString(),
    source: 'backend',
    ttlMs: meta.ttlMs ?? DEFAULT_CACHE_TTLS.workflow,
    etag: meta.etag || '',
    stale: false
  };
  workingStore.cache.modules[moduleName] = envelope;
  localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(workingStore.cache));
  return envelope;
}

function readBackendCache(moduleName) {
  return workingStore.cache.modules[moduleName] || null;
}

function isBackendCacheFresh(moduleName, ttlMs) {
  const envelope = readBackendCache(moduleName);
  if (!envelope?.fetchedAt) return false;
  const age = Date.now() - new Date(envelope.fetchedAt).getTime();
  return Number.isFinite(age) && age <= (ttlMs ?? envelope.ttlMs ?? DEFAULT_CACHE_TTLS.workflow);
}

function setWorkingModule(moduleName, records, meta = {}) {
  workingStore.modules[moduleName] = {
    records: Array.isArray(records) ? records : [],
    status: meta.status || 'ready',
    source: meta.source || 'working',
    updatedAt: new Date().toISOString(),
    error: meta.error || ''
  };
  return workingStore.modules[moduleName];
}

function hydrateWorkingModuleFromCache(moduleName) {
  const envelope = readBackendCache(moduleName);
  if (!envelope) return null;
  return setWorkingModule(moduleName, envelope.records || [], {
    status: 'stale',
    source: 'cache'
  });
}

async function refreshWorkingModuleFromBackend(moduleName, loader, options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTLS.workflow;
  if (!options.force && isBackendCacheFresh(moduleName, ttlMs)) {
    return hydrateWorkingModuleFromCache(moduleName);
  }

  setWorkingModule(moduleName, workingStore.modules[moduleName]?.records || [], { status: 'loading' });
  const records = await loader();
  const envelope = writeConfirmedBackendCache(moduleName, records, { ttlMs });
  return setWorkingModule(moduleName, envelope.records, { status: 'ready', source: 'backend' });
}

async function optimisticWorkingMutation(moduleName, optimisticRecords, commit, rollbackRecords) {
  const mutationId = `${moduleName}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const before = rollbackRecords || workingStore.modules[moduleName]?.records || [];
  workingStore.pendingMutations.set(mutationId, { moduleName, before });
  setWorkingModule(moduleName, optimisticRecords, { status: 'pending', source: 'optimistic' });

  try {
    const confirmedRecords = await commit();
    const envelope = writeConfirmedBackendCache(moduleName, confirmedRecords);
    workingStore.pendingMutations.delete(mutationId);
    return setWorkingModule(moduleName, envelope.records, { status: 'ready', source: 'backend' });
  } catch (error) {
    workingStore.pendingMutations.delete(mutationId);
    setWorkingModule(moduleName, before, { status: 'error', source: 'rollback', error: error?.message || 'Backend write failed' });
    throw error;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // migration: ensure new collections exist
      const emptyState = createEmptyAppState();
      const defaults = ['libraryFolders','libraryFiles','channels','messages','complaints','lots','sanitationLogs','ccpLogs','ncrs','recalls','procurementOrders','users','specSheets','publicLinks','feedback','pickPackOrders','maintenanceEvents','equipmentIssues','swabRecords','productionRequests','receivingLog','moveLog','shippingLog','productionLog','rdRequests'];
      // ensure pick-and-pack customer records exist (auto-create if missing)
      s.customers = s.customers || [];
      PICK_PACK_CUSTOMER_NAMES.forEach(name => {
        let c = s.customers.find(x => x.name === name);
        if (!c) {
          s.customers.push({ id: 'c_pp_'+name.toLowerCase().replace(/\s+/g,'_'), name, contact:'', email:'', phone:'', address:'', notes:'Pick & Pack customer (auto-created).', specSheet:null, copackingAgreement:null, pickPackEligible: true });
        } else if (!c.pickPackEligible) {
          c.pickPackEligible = true;
        }
      });
      // one-time: seed starter Finished Goods for pick-pack customers if none exist yet
      if (!s._ppFgSeeded) {
        s.ingredients = s.ingredients || [];
        const ppCustIds = PICK_PACK_CUSTOMER_NAMES
          .map(n => s.customers.find(c => c.name === n)?.id)
          .filter(Boolean);
        const hasAnyPpFg = s.ingredients.some(i => i.category === 'Finished Good' && ppCustIds.includes(i.customerId));
        if (!hasAnyPpFg) {
          s._ppFgSeedSkippedForBackendAuthority = true;
        }
        s._ppFgSeeded = true;
      }
      defaults.forEach(k => { if (!s[k]) s[k] = JSON.parse(JSON.stringify(emptyState[k] || [])); });
      if (!s.boms) s.boms = JSON.parse(JSON.stringify(emptyState.boms || {}));
      // migration: ensure suppliers have files array + docs object + productLines
      (s.suppliers || []).forEach(sp => {
        if (!sp.files) sp.files = [];
        if (!sp.docs) sp.docs = {};
        if (!Array.isArray(sp.productLines)) {
          // convert legacy free-text products into a single product line if present
          sp.productLines = sp.products ? [{ product: sp.products, type: 'Ingredient', pricePerLb: '' }] : [];
        }
      });
      // migration: ensure each PO has new fields
      (s.purchaseOrders || []).forEach(p => {
        if (!('brand' in p)) p.brand = '';
        if (!('poFile' in p)) p.poFile = null;
        if (!('scOverrides' in p)) p.scOverrides = {};
        if (!('productionEndDate' in p)) p.productionEndDate = p.productionDate || null;
        if (!('depositStatus' in p)) p.depositStatus = 'on_hold';
        if (!('coa' in p)) p.coa = null;
      });
      // migration: inventory categories + customer + lead time
      (s.ingredients || []).forEach(i => {
        if (!i.category) {
          const n = (i.name||'').toLowerCase();
          if (/jar|lid|pouch|label|cap|case|carton|box|sleeve|sachet/.test(n)) i.category = 'Packaging';
          else i.category = 'Ingredient';
        }
        if (!('customerId' in i)) i.customerId = '';
        if (!('leadTimeDays' in i)) i.leadTimeDays = 0;
        if (!('building' in i)) i.building = '';
        if (!('location' in i)) i.location = '';
        if (!('lotNumber' in i)) i.lotNumber = '';
        // migrate single lot/location to a lots[] array (lot + building + location + qty per entry)
        if (!Array.isArray(i.lots)) {
          i.lots = [{ lotNumber: i.lotNumber||'', building: i.building||'', location: i.location||'', qty: parseFloat(i.stock)||0 }];
        }
      });
      // migration: nested folders
      (s.libraryFolders || []).forEach(f => { if (!('parentId' in f)) f.parentId = null; });
      // migration: customer onboarding/agreement fields
      (s.customers || []).forEach(c => {
        if (!('onboardingId' in c)) c.onboardingId = null;
        if (!('onboardingData' in c)) c.onboardingData = null;
        if (!('copackingAgreement' in c)) c.copackingAgreement = null;
      });
      // migration: supplier onboarding fields
      (s.suppliers || []).forEach(sp => {
        if (!('onboardingId' in sp)) sp.onboardingId = null;
        if (!('onboardingData' in sp)) sp.onboardingData = null;
      });
      // Master List is backend-owned; do not synthesize local Inventory setup rows.
      ensureMasterItems(s);
      // Shipping Log is backend-owned; do not synthesize local Inventory history.
      ensureShippingLog(s);
      // migration: Production Log (auto-built from POs whose production was finalized)
      ensureProductionLog(s);
      return s;
    }
  } catch (e) {}
  const fresh = createEmptyAppState();
  ensureMasterItems(fresh);
  ensureShippingLog(fresh);
  ensureProductionLog(fresh);
  return fresh;
}
// Ensure the Production Log exists and back-fill an entry for every PO whose production
// was already finalized. Operates only on the passed-in state object (no global lookups).
function ensureProductionLog(s) {
  if (!Array.isArray(s.productionLog)) s.productionLog = [];
  let maxNum = s.productionLog.reduce((mx,l)=>{ const n=parseInt((String(l.logId||'').match(/\d+/)||[0])[0],10); return isNaN(n)?mx:Math.max(mx,n); }, 1000);
  (s.purchaseOrders || []).forEach(po => {
    if (!po.productionFinalized) return; // only finalized production runs
    if (s.productionLog.some(l => l.poId === po.id)) return;
    maxNum += 1;
    s.productionLog.push(productionLogRecord(po, 'PRD-' + maxNum));
  });
}
// Shared shape for a production-log entry (used by seeding + live logging).
function productionLogRecord(po, logId) {
  return {
    id: uid('plog'),
    logId,
    poId: po.id,
    customerId: po.customerId || '',
    brand: po.brand || '',
    productionDate: po.productionDate || '',
    productionEndDate: po.productionEndDate || '',
    room: po.productionRoom || '',
    completedAt: po.completedAt || new Date().toISOString(),
    wasteLossPct: po.wasteLossPct || 0,
    notes: po.completionNotes || '',
    lines: (po.lines || []).map(l => ({ productId: l.productId, ordered: l.qty, produced: (typeof l.actualQty==='number'?l.actualQty:l.qty), cases: l.casesProduced||0, lot: l.lotNumber||'' })),
    materials: (po.materialsUsed || []).map(m => ({ ingredientId: m.ingredientId, category: m.category, theoretical: m.theoretical, actual: m.actual, lot: m.lot, productId: m.productId, lineIndex: m.lineIndex }))
  };
}
// Ensure the Shipping Log collection exists without creating local-only history.
// Backend shipping logs are the authoritative source for the Inventory Shipping Log.
function ensureShippingLog(s) {
  if (!Array.isArray(s.shippingLog)) s.shippingLog = [];
}
// Ensure the Master List collection exists without creating local-only setup rows.
// Backend Master List records are the authoritative source for Inventory item definitions.
function ensureMasterItems(s) {
  if (!Array.isArray(s.masterItems)) s.masterItems = [];
}
function saveState() {
  localStorage.setItem(LEGACY_LOCAL_STATE_KEY, JSON.stringify(state));
}

function loadAuthState() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { token: '', user: null, roles: [], customerAccess: [] };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || '',
      user: parsed.user || null,
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      customerAccess: Array.isArray(parsed.customerAccess) ? parsed.customerAccess : []
    };
  } catch (err) {
    return { token: '', user: null, roles: [], customerAccess: [] };
  }
}

function saveAuthState() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (!backendAuthState.token) sessionStorage.removeItem(AUTH_STORAGE_KEY);
  else sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(backendAuthState));
}

function setBackendAuth(data) {
  backendAuthState = {
    token: data?.token || backendAuthState.token || '',
    user: data?.user || null,
    roles: data?.roles || data?.user?.roles || [],
    customerAccess: data?.customerAccess || data?.user?.customerAccess || []
  };
  resetBackendDataStates();
  clearProtectedBackendRows('account-management');
  saveAuthState();
  updateTopbarAccount();
  updateSidebarNavigationForRole();
}

function clearBackendAuth() {
  backendAuthState = { token: '', user: null, roles: [], customerAccess: [] };
  clearProtectedBackendRows('account-management');
  saveAuthState();
  backendUserState.status = 'local';
  resetBackendDataStates();
  updateTopbarAccount();
  updateSidebarNavigationForRole();
}

function resetBackendDataStates() {
  backendApiState.status = 'unknown';
  backendApiState.lastError = '';
  backendApiState.loadedPurchaseOrders = false;
  backendApiState.loadingPurchaseOrders = false;
  backendApiState.purchaseOrdersError = '';
  backendApiState.hydratingPurchaseOrderFiles = false;
  backendApiState.purchaseOrderFilesHydrated = false;
  backendApiState.purchaseOrderLoadPromise = null;
  backendApiState.purchaseOrderFileHydrationPromise = null;
  backendApiState.purchaseOrderLoadRequestId++;
  [backendCustomerState, backendProductState, backendMasterItemState, backendInventoryState, backendProcurementState, backendProductionState, backendQualityState, backendShippingState, backendPickPackState, backendResearchState].forEach(s => {
    s.status = 'local';
    s.lastError = '';
    s.loading = false;
    s.loaded = false;
  });
  backendInventoryState.signals = null;
  backendProcurementState.needRows = [];
  backendProductionState.runs = [];
  backendProductionState.logs = [];
  backendQualityState.queue = [];
  backendShippingState.queue = [];
  backendShippingState.logs = [];
  backendPickPackState.orders = [];
}

function authHeaders() {
  return backendAuthState.token ? { Authorization: `Bearer ${backendAuthState.token}` } : {};
}

function isBackendSignedIn() {
  return !!backendAuthState.token && !!backendAuthState.user;
}

function primaryBackendRole() {
  return (backendAuthState.roles || [])[0] || backendAuthState.user?.roles?.[0] || '';
}

function accountInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

function renderTopbarAccount() {
  const signedIn = !!backendAuthState.token && !!backendAuthState.user;
  const user = backendAuthState.user || {};
  const name = signedIn ? (user.displayName || user.email || 'Signed in') : 'Sign in';
  const role = signedIn ? (primaryBackendRole() || user.userType || 'Account') : 'Staging access';
  const email = user.email || '';
  const customerAccess = (backendAuthState.customerAccess || [])[0];

  if (!signedIn) {
    return `<button class="topbar-account" type="button" data-topbar-account="signed-out" onclick="openBackendLogin()" aria-label="Sign in">
      <span class="topbar-account-avatar">IN</span>
      <span class="topbar-account-text">
        <span class="topbar-account-name">Sign in</span>
        <span class="topbar-account-role">Staging access</span>
      </span>
    </button>`;
  }

  return `<button class="topbar-account" type="button" data-topbar-account="signed-in" onclick="toggleTopbarAccountMenu(event)" aria-expanded="false" aria-controls="topbarAccountMenu">
      <span class="topbar-account-avatar">${escapeHtml(accountInitials(name))}</span>
      <span class="topbar-account-text">
        <span class="topbar-account-name">${escapeHtml(name)}</span>
        <span class="topbar-account-role">${escapeHtml(role)}</span>
      </span>
    </button>
    <div class="topbar-account-menu" id="topbarAccountMenu" data-topbar-account-menu hidden>
      <div class="topbar-account-profile">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(email)}</span>
        <span>${escapeHtml(role)}</span>
        ${customerAccess ? `<span>Customer access: ${escapeHtml(customerAccess.customerId)}</span>` : ''}
      </div>
      <div class="topbar-account-actions">
        <button class="btn btn-secondary btn-sm" type="button" onclick="refreshBackendAuth()">Refresh profile</button>
        <button class="btn btn-secondary btn-sm" type="button" onclick="router('profile-settings')">Profile settings</button>
        <button class="btn btn-sm" type="button" onclick="logoutBackendAuth()">Logout</button>
      </div>
    </div>`;
}

function updateTopbarAccount() {
  const el = document.getElementById('topbarAccount');
  if (el) el.innerHTML = renderTopbarAccount();
}

function toggleTopbarAccountMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('topbarAccountMenu');
  const button = document.querySelector('[data-topbar-account="signed-in"]');
  if (!menu) return;
  const willOpen = menu.hasAttribute('hidden');
  menu.toggleAttribute('hidden', !willOpen);
  if (button) button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeTopbarAccountMenu() {
  const menu = document.getElementById('topbarAccountMenu');
  const button = document.querySelector('[data-topbar-account="signed-in"]');
  if (menu) menu.setAttribute('hidden', '');
  if (button) button.setAttribute('aria-expanded', 'false');
}

