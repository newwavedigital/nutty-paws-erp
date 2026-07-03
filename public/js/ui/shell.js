/* =========================================================================
   ROUTER & UI SHELL
   ========================================================================= */
let currentPage = 'dashboard';

const PAGE_TITLES = {
  'dashboard': 'Dashboard',
  'purchase-orders': 'Purchase Orders',
  'supply-chain': 'Supply Chain',
  'procurement': 'Procurement',
  'production': 'Production Schedule',
  'shipping': 'Shipping',
  'suppliers': 'Suppliers',
  'customers': 'Customers',
  'inventory': 'Inventory',
  'content-library': 'Content Library',
  'slack': 'Team Chat',
  'food-safety': 'Food Safety',
  'products': 'Products',
  'users': 'Account Management',
  'feedback': 'Feedback',
  'pick-pack': 'Pick & Pack',
  'quality-assurance': 'Quality Assurance',
  'machinery': 'Machinery',
  'rd': 'Research & Development',
  'assignments': 'Assignments',
  'customer-portal': 'Customer Portal',
  'profile-settings': 'Profile Settings'
};

const ALL_NAV_PAGES = [
  'dashboard',
  'purchase-orders',
  'supply-chain',
  'procurement',
  'production',
  'shipping',
  'suppliers',
  'customers',
  'inventory',
  'content-library',
  'slack',
  'food-safety',
  'products',
  'users',
  'feedback',
  'pick-pack',
  'quality-assurance',
  'machinery',
  'rd',
  'assignments',
  'customer-portal',
  'profile-settings'
];
const CUSTOMER_ALLOWED_PAGES = new Set(['customer-portal', 'profile-settings']);
const EMPLOYEE_NAV_PAGES = new Set(ALL_NAV_PAGES.filter(page => page !== 'customer-portal'));
const ROLE_ALLOWED_PAGES = {
  Admin: EMPLOYEE_NAV_PAGES,
  Sales: new Set(['dashboard', 'customers', 'purchase-orders', 'products', 'feedback']),
  'Supply Chain & Procurement': new Set(['dashboard', 'supply-chain', 'procurement', 'suppliers', 'inventory', 'rd', 'feedback']),
  Warehousing: new Set(['dashboard', 'inventory', 'shipping', 'pick-pack', 'quality-assurance', 'production', 'feedback']),
  Production: new Set(['dashboard', 'production', 'food-safety', 'quality-assurance', 'pick-pack', 'inventory', 'feedback']),
  Customer: CUSTOMER_ALLOWED_PAGES
};
const ROLE_LANDING_PAGES = {
  Admin: 'dashboard',
  Sales: 'dashboard',
  'Supply Chain & Procurement': 'supply-chain',
  Warehousing: 'inventory',
  Production: 'production',
  Customer: 'customer-portal'
};
const PARTIAL_LOCAL_PAGE_LIMITS = {
  'content-library': 'Content Library has backend file paths, but some folder/file preview records and generated notes are partial local-only.',
  slack: 'Team Chat is not fully implemented yet. Channel history and generated local notes are partial local-only.',
  'food-safety': 'Food Safety sublogs are not fully implemented yet. Swabs, complaints, sanitation, CCP/HACCP, NCR/CAPA, and mock recall notes may remain partial local-only.',
  machinery: 'Machinery maintenance and equipment issue logs are not fully implemented yet. Local generated entries do not represent confirmed backend persistence.',
  assignments: 'Assignments are not implemented yet. This placeholder is retained so scope is visible without implying a working workflow.'
};
let authGateSetupRequestId = 0;

const SHAREPOINT_INVENTORY_URL = 'https://bnutty2.sharepoint.com/:x:/s/Bnutty/IQD6NhKAgj2HR6N9vJGV9POQARgkf7S9r8zLdjYh4WMkb6g?e=ZJ4swm';
const USER_ROLES = ['Admin', 'Sales', 'Supply Chain & Procurement', 'Warehousing', 'Production', 'Customer'];
const STAGING_DEMO_PASSWORD = 'DemoAdmin123!';
const STAGING_DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin_demo_1@staging.nuthouse.local' },
  { role: 'Sales', email: 'sales_demo_1@staging.nuthouse.local' },
  { role: 'Supply Chain', email: 'supply_chain_procurement_demo_1@staging.nuthouse.local' },
  { role: 'Warehousing', email: 'warehousing_demo_1@staging.nuthouse.local' },
  { role: 'Production', email: 'production_demo_1@staging.nuthouse.local' },
  { role: 'Customer', email: 'customer_demo_1@staging.nuthouse.local' }
];

const BRANDS = ['Nut House Co-Packing', 'Bnutty', "Dilly's", 'Poochie Butter'];
const INTERNAL_BRANDS = ['Bnutty', "Dilly's", 'Poochie Butter']; // these stock to warehouse instead of shipping out
// Brands whose production runs auto-increment Finished Goods inventory (our own brands we resell).
// Nut House Co-Packing and Dilly's are made for other customers so don't go to our FG stock.
const FG_TRACKED_BRANDS = ['Bnutty', 'Poochie Butter'];
const BUILDINGS = ['Addison', 'Ameriplex', 'Sheffield'];
// Planning waste buffer: ingredient/packaging requirements are inflated 5% for Supply Chain checks,
// Procurement ordering, inventory reservation, and warehouse pick lists so we never come up short.
const PLANNING_LOSS_FACTOR = 1.05;
const PICK_PACK_CUSTOMER_NAMES = ['Bnutty', 'Poochie Butter', 'Wonder Bark'];
const PARCEL_CARRIERS = ['UPS', 'FedEx', 'USPS'];
const VENDOR_DOC_TYPES = [
  { key: 'verification', label: 'Supplier Verification Form' },
  { key: 'gfsi',         label: 'GFSI Certificate' },
  { key: 'coi',          label: 'Certificate of Insurance' },
  { key: 'kosher',       label: 'Kosher Certificate' },
  { key: 'halal',        label: 'Halal Certificate' }
];
function isInternalBrand(po) { return po && INTERNAL_BRANDS.includes(po.brand); }
function poTotalUnits(po) {
  return (po.lines || []).reduce((s, l) => s + (typeof l.actualQty === 'number' ? l.actualQty : (l.qty || 0)), 0);
}
function poTotalCases(po) {
  return (po.lines || []).reduce((s, l) => s + (typeof l.casesProduced === 'number' ? l.casesProduced : 0), 0);
}

// Find or auto-create the Finished Good inventory row for a product under a given brand.
// Returns the FG ingredient record, or null if not applicable.
function ensureFinishedGoodForProduct(product, brand) {
  if (!product) return null;
  // honor an explicit link first
  if (product.finishedGoodId) {
    const fg = state.ingredients.find(i => i.id === product.finishedGoodId);
    if (fg) return fg;
    // dangling link - fall through to find or create
  }
  // map brand -> the matching customer record (auto-created earlier for Pick & Pack)
  const brandCustomer = state.customers.find(c => c.name === brand);
  const brandCustId = brandCustomer?.id || '';
  // try to find existing FG by name match (with or without "- Finished" suffix) and brand customer
  const candidateNames = [product.name + ' - Finished', product.name];
  let fg = state.ingredients.find(i =>
    i.category === 'Finished Good' &&
    candidateNames.includes(i.name) &&
    (!brandCustId || !i.customerId || i.customerId === brandCustId)
  );
  if (fg) {
    product.finishedGoodId = fg.id;
    // make sure it's properly tagged to the brand customer
    if (brandCustId && !fg.customerId) fg.customerId = brandCustId;
    return fg;
  }
  // Auto-create a new Finished Good row
  fg = {
    id: uid('i'),
    name: product.name + ' - Finished',
    category: 'Finished Good',
    supplierId: '',
    customerId: brandCustId,
    stock: 0,
    reorderLevel: Math.max(24, Math.round((product.caseQty || 12) * 2)),
    unit: 'ea',
    cost: product.price || 0,
    leadTimeDays: 0,
    building: '',
    location: ''
  };
  state.ingredients.push(fg);
  product.finishedGoodId = fg.id;
  return fg;
}

function isCustomerSession() {
  return isBackendSignedIn() && backendAuthState.user?.userType === 'customer';
}

function currentBackendRoles() {
  const roles = Array.isArray(backendAuthState.roles) ? backendAuthState.roles : [];
  if (roles.length) return roles;
  return Array.isArray(backendAuthState.user?.roles) ? backendAuthState.user.roles : [];
}

function allowedPagesForCurrentUser() {
  if (!isBackendSignedIn()) return new Set();
  if (isCustomerSession()) return CUSTOMER_ALLOWED_PAGES;
  const roles = currentBackendRoles();
  if (roles.includes('Admin')) return ROLE_ALLOWED_PAGES.Admin;
  const allowed = new Set();
  roles.forEach(role => {
    const pages = ROLE_ALLOWED_PAGES[role];
    if (pages) pages.forEach(page => allowed.add(page));
  });
  if (!allowed.size) allowed.add('dashboard');
  return allowed;
}

function roleLandingPageForCurrentUser() {
  if (isCustomerSession()) return ROLE_LANDING_PAGES.Customer;
  const roles = currentBackendRoles();
  if (roles.includes('Admin')) return ROLE_LANDING_PAGES.Admin;
  for (const role of roles) {
    const landing = ROLE_LANDING_PAGES[role];
    if (landing && allowedPagesForCurrentUser().has(landing)) return landing;
  }
  return allowedPagesForCurrentUser().values().next().value || 'dashboard';
}

function isPageAllowedForCurrentUser(page) {
  if (!isBackendSignedIn()) return false;
  return allowedPagesForCurrentUser().has(page || roleLandingPageForCurrentUser());
}

function updateSidebarNavigationForRole() {
  const signedIn = isBackendSignedIn();
  const allowedPages = allowedPagesForCurrentUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.querySelectorAll('a[data-page]').forEach(link => {
    const page = link.dataset.page;
    link.hidden = !signedIn || !allowedPages.has(page);
  });
  nav.querySelectorAll('.nav-section-label').forEach(label => {
    let cursor = label.nextElementSibling;
    let hasVisibleLink = false;
    while (cursor && !cursor.classList.contains('nav-section-label')) {
      if (cursor.matches?.('a[data-page]') && !cursor.hidden) hasVisibleLink = true;
      cursor = cursor.nextElementSibling;
    }
    label.hidden = !signedIn || !hasVisibleLink;
  });
}

function renderRestrictedPage(el, page) {
  const title = PAGE_TITLES[page] || 'Restricted area';
  const landing = roleLandingPageForCurrentUser();
  el.innerHTML = renderOpsPanel({
    title: 'Restricted area',
    kicker: 'Role access',
    body: `
      <div class="empty">
        <strong>${escapeHtml(title)}</strong>
        <p>This area is for employee and admin workflows. Your current backend role can only use the approved areas shown in the sidebar.</p>
        <button class="btn btn-sm" onclick="router('${escapeHtml(landing)}')">Open Allowed Area</button>
      </div>`
  });
}

function partialLocalBannerHtml(page) {
  const message = PARTIAL_LOCAL_PAGE_LIMITS[page];
  if (!message) return '';
  return `
    <div class="partial-local-banner" data-partial-local-banner="${escapeHtml(page)}">
      <strong>Partial local-only</strong>
      <span>${escapeHtml(message)}</span>
    </div>`;
}

function addPartialLocalBanner(el, page) {
  const banner = partialLocalBannerHtml(page);
  if (banner && el) el.insertAdjacentHTML('afterbegin', banner);
}

function ensureAuthGateElement() {
  let gate = document.getElementById('authGate');
  if (gate) return gate;
  gate = document.createElement('section');
  gate.id = 'authGate';
  gate.className = 'auth-gate';
  gate.setAttribute('aria-live', 'polite');
  document.body.insertBefore(gate, document.body.firstChild);
  return gate;
}

function shouldShowStagingDemoCredentials() {
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.includes('staging');
}

function fillStagingDemoLogin(email) {
  const emailInput = document.getElementById('auth_gate_email');
  const passwordInput = document.getElementById('auth_gate_password');
  if (emailInput) emailInput.value = email;
  if (passwordInput) passwordInput.value = STAGING_DEMO_PASSWORD;
  emailInput?.focus();
}

function stagingDemoCredentialsHtml() {
  if (!shouldShowStagingDemoCredentials()) return '';
  return `
    <div class="auth-demo-access" data-staging-demo-credentials>
      <div class="auth-demo-access-header">
        <strong>Staging demo access</strong>
        <span>Shared password: <code>${escapeHtml(STAGING_DEMO_PASSWORD)}</code></span>
      </div>
      <div class="auth-demo-account-list">
        ${STAGING_DEMO_ACCOUNTS.map(account => `
          <button type="button" class="auth-demo-account" onclick="fillStagingDemoLogin('${escapeHtml(account.email)}')">
            <span>${escapeHtml(account.role)}</span>
            <code>${escapeHtml(account.email)}</code>
          </button>
        `).join('')}
      </div>
    </div>`;
}

function renderLoginGate({ message = 'Sign in to open the ERP.', setupAvailable = false, checkingSetup = false } = {}) {
  const gate = ensureAuthGateElement();
  gate.hidden = false;
  const existingEmail = document.getElementById('auth_gate_email')?.value || '';
  const existingPassword = document.getElementById('auth_gate_password')?.value || '';
  gate.innerHTML = `
    <div class="auth-gate-panel">
      <div class="auth-gate-brand">
        <div class="auth-gate-logo" aria-hidden="true">NH</div>
        <h1>Nut House ERP</h1>
      </div>
      <p class="auth-gate-message">${escapeHtml(message)}</p>
      <form class="auth-gate-form" onsubmit="event.preventDefault();submitBackendLogin(event.currentTarget)">
        <div class="form-row"><label for="auth_gate_email">Email</label><input type="email" id="auth_gate_email" autocomplete="username" value="${escapeHtml(existingEmail)}" required /></div>
        <div class="form-row"><label for="auth_gate_password">Password</label><input type="password" id="auth_gate_password" autocomplete="current-password" value="${escapeHtml(existingPassword)}" required /></div>
        <button type="submit" class="btn auth-gate-submit">Sign in</button>
      </form>
      <div class="auth-gate-actions">
        ${checkingSetup ? '<span class="help-text">Checking first admin setup…</span>' : ''}
        ${setupAvailable ? '<button class="btn btn-secondary btn-sm" type="button" onclick="openBackendSetup()">First Admin Setup</button>' : ''}
      </div>
      ${stagingDemoCredentialsHtml()}
    </div>`;
}

function showAuthGate(message = 'Sign in to open the ERP.') {
  document.body.classList.remove('auth-pending');
  document.body.classList.add('auth-gated');
  const requestId = ++authGateSetupRequestId;
  renderLoginGate({ message, checkingSetup: true });
  updateTopbarAccount();
  updateSidebarNavigationForRole();
  checkBackendSetupStatus()
    .then(status => {
      if (requestId !== authGateSetupRequestId || isBackendSignedIn()) return;
      renderLoginGate({ message, setupAvailable: !!status.needsSetup });
    })
    .catch(() => {
      if (requestId !== authGateSetupRequestId || isBackendSignedIn()) return;
      renderLoginGate({ message: `${message} Setup status is unavailable right now.`, setupAvailable: false });
    });
}

function showAppShell() {
  authGateSetupRequestId++;
  document.body.classList.remove('auth-pending');
  document.body.classList.remove('auth-gated');
  const gate = document.getElementById('authGate');
  if (gate) gate.hidden = true;
}

function enterAuthenticatedApp(page = roleLandingPageForCurrentUser()) {
  updateTopbarAccount();
  updateSidebarNavigationForRole();
  showAppShell();
  router(page);
}

async function bootstrapAuthGate() {
  updateTopbarAccount();
  updateSidebarNavigationForRole();
  if (!backendAuthState.token) {
    clearBackendAuth();
    showAuthGate('Sign in to open the ERP.');
    return;
  }
  try {
    const data = await apiRequest('/api/auth/me');
    setBackendAuth({ token: backendAuthState.token, ...data });
    enterAuthenticatedApp(roleLandingPageForCurrentUser());
  } catch (err) {
    clearBackendAuth();
    showAuthGate('Session expired or was rejected. Please sign in again.');
  }
}

function renderCustomerPortalPage(el) {
  if (typeof renderSignedInCustomerPortalPage === 'function') {
    renderSignedInCustomerPortalPage(el);
    return;
  }
  el.innerHTML = renderOpsPanel({
    title: 'Customer Portal',
    kicker: 'Customer access',
    body: '<div class="empty">Customer Portal is still loading. Refresh the page if this message stays visible.</div>'
  });
}

function renderProfileSettingsPage(el) {
  if (typeof renderProfileSettings === 'function') {
    renderProfileSettings(el);
    return;
  }
  el.innerHTML = renderOpsPanel({
    title: 'Profile Settings',
    kicker: 'Account',
    body: '<div class="empty">Profile settings are still loading. Refresh the page if this message stays visible.</div>'
  });
}

function router(page) {
  const requestedPage = page || 'dashboard';
  if (!isBackendSignedIn()) {
    currentPage = '';
    showAuthGate('Sign in to open the ERP.');
    return;
  }
  currentPage = isPageAllowedForCurrentUser(requestedPage) ? requestedPage : 'restricted';
  closeTopbarAccountMenu();
  updateTopbarAccount();
  updateSidebarNavigationForRole();
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === currentPage);
  });
  document.getElementById('pageTitle').textContent = currentPage === 'restricted' ? 'Restricted area' : (PAGE_TITLES[currentPage] || '');
  const c = document.getElementById('content');
  switch (currentPage) {
    case 'restricted': renderRestrictedPage(c, requestedPage); break;
    case 'dashboard': renderDashboard(c); break;
    case 'purchase-orders': renderPurchaseOrders(c); break;
    case 'supply-chain': renderSupplyChain(c); break;
    case 'procurement': renderProcurement(c); break;
    case 'production': renderProduction(c); break;
    case 'shipping': renderShipping(c); break;
    case 'suppliers': renderSuppliers(c); break;
    case 'customers': renderCustomers(c); break;
    case 'inventory': renderInventory(c); break;
    case 'content-library': renderContentLibrary(c); break;
    case 'slack': renderSlack(c); break;
    case 'food-safety': renderFoodSafety(c); break;
    case 'products': renderProducts(c); break;
    case 'users': renderUsers(c); break;
    case 'feedback': renderFeedback(c); break;
    case 'pick-pack': renderPickPack(c); break;
    case 'quality-assurance': renderQualityAssurance(c); break;
    case 'machinery': renderMachinery(c); break;
    case 'rd': renderRD(c); break;
    case 'assignments': renderAssignments(c); break;
    case 'customer-portal': renderCustomerPortalPage(c); break;
    case 'profile-settings': renderProfileSettingsPage(c); break;
    default: c.innerHTML = '<p>Not found</p>';
  }
  addPartialLocalBanner(c, currentPage === 'restricted' ? requestedPage : currentPage);
}

function setHamburgerExpanded(expanded) {
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function closeMobileSidebarAfterNav() {
  if (window.innerWidth > 720) return;
  document.getElementById('sidebar')?.classList.remove('open');
  setHamburgerExpanded(false);
}

function syncHamburgerExpandedState() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const expanded = window.innerWidth <= 720
    ? sidebar.classList.contains('open')
    : !sidebar.classList.contains('collapsed');
  setHamburgerExpanded(expanded);
}

function activateSidebarNavLink(link) {
  if (link?.hidden) return;
  if (link?.dataset?.page) {
    router(link.dataset.page);
    closeMobileSidebarAfterNav();
  }
}

function handleSidebarNavKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activateSidebarNavLink(event.currentTarget);
}

document.getElementById('hamburger').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 720) {
    sb.classList.toggle('open');
  } else {
    sb.classList.toggle('collapsed');
    document.getElementById('main').classList.toggle('expanded');
  }
  syncHamburgerExpandedState();
});
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', () => activateSidebarNavLink(a));
  a.addEventListener('keydown', handleSidebarNavKeydown);
});
document.getElementById('brandHeader').addEventListener('click', () => router(roleLandingPageForCurrentUser()));
document.addEventListener('click', (event) => {
  if (!event.target.closest || !event.target.closest('#topbarAccount')) closeTopbarAccountMenu();
});
window.addEventListener('resize', syncHamburgerExpandedState);
window.visualViewport?.addEventListener('resize', syncHamburgerExpandedState);
syncHamburgerExpandedState();

document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
});

