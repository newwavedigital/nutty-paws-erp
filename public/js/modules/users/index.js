/* =========================================================================
   ACCOUNT MANAGEMENT (Users)
   ========================================================================= */
function backendAuthPanelHtml() {
  const signedIn = !!backendAuthState.token && !!backendAuthState.user;
  const roles = signedIn ? (backendAuthState.roles || []).join(', ') : '';
  const userLabel = signedIn
    ? `${escapeHtml(backendAuthState.user.displayName || backendAuthState.user.email)}${roles ? ' - ' + escapeHtml(roles) : ''}`
    : 'Backend session inactive';
  const statusText = backendUserState.status === 'connected'
    ? 'Backend Account Management is connected.'
    : backendUserState.status === 'error'
      ? escapeHtml(backendUserState.lastError || BACKEND_READ_FAILED_MESSAGE)
      : 'Create the first admin or log in as backend Admin before adding users. Browser-preview users cannot log in.';
  return `
    <div class="inv-check ${signedIn ? 'ok' : ''}" data-auth-panel="account-management" style="margin-bottom:12px;border-left-color:${signedIn ? 'var(--success)' : 'var(--orange)'}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div>
          <strong>Account access</strong>
          <div class="help-text">${statusText}</div>
          <div style="font-size:12px;color:var(--brown);margin-top:4px">${userLabel}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${signedIn ? `<button class="btn btn-secondary btn-sm" onclick="refreshBackendAuth()">Refresh Session</button><button class="btn btn-secondary btn-sm" onclick="logoutBackendAuth()">Logout</button>` : `<button class="btn btn-sm" onclick="openBackendLogin()">Login</button>`}
        </div>
      </div>
    </div>`;
}

async function refreshBackendAuth() {
  if (!backendAuthState.token) { openBackendLogin(); return; }
  try {
    const data = await apiRequest('/api/auth/me');
    setBackendAuth({ token: backendAuthState.token, ...data });
    await loadBackendUsers();
    toast('Backend session refreshed.');
    enterAuthenticatedApp(isPageAllowedForCurrentUser(currentPage) ? currentPage : roleLandingPageForCurrentUser());
  } catch (err) {
    clearBackendAuth();
    backendUserState.status = 'error';
    backendUserState.lastError = 'Backend auth session expired or unavailable.';
    showAuthGate('Session expired or was rejected. Please sign in again.');
    toast('Backend session unavailable. Please sign in again.');
  }
}

async function checkBackendSetupStatus() {
  return apiRequest('/api/auth/setup-status');
}

function openBackendSetup() {
  openModal('First Admin Setup', `
    <div id="auth_setup_status" class="help-text" style="margin-bottom:12px">Checking backend setup status...</div>
    <div class="help-text" style="margin-bottom:12px">Creates the first backend Admin only when the D1 users table is empty. If setup is already complete, use Login instead.</div>
    <form onsubmit="event.preventDefault();submitBackendSetup()">
      <div class="form-grid">
        <div class="form-row"><label>Full Name</label><input id="auth_setup_name" required /></div>
        <div class="form-row"><label>Email</label><input type="email" id="auth_setup_email" required /></div>
        <div class="form-row"><label>Password</label><input type="password" id="auth_setup_password" minlength="8" required /></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">Create Admin</button>
      </div>
    </form>
  `);
  checkBackendSetupStatus()
    .then(status => {
      const el = document.getElementById('auth_setup_status');
      if (el) el.textContent = status.needsSetup ? 'First admin setup is available.' : 'Backend setup is already complete; use Login.';
    })
    .catch(() => {
      const el = document.getElementById('auth_setup_status');
      if (el) el.textContent = 'Setup status is unavailable right now; use an approved sample account or retry.';
    });
}

async function submitBackendSetup() {
  try {
    const data = await apiRequest('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        displayName: document.getElementById('auth_setup_name').value,
        email: document.getElementById('auth_setup_email').value,
        password: document.getElementById('auth_setup_password').value
      })
    });
    setBackendAuth(data);
    closeModal();
    await loadBackendUsers();
    enterAuthenticatedApp(roleLandingPageForCurrentUser());
    toast('Backend Admin created and signed in.');
  } catch (err) {
    toast(err.message || 'Backend setup failed.');
  }
}

function openBackendLogin() {
  openModal('Backend Login', `
    <div class="help-text" style="margin-bottom:12px">Use an approved staging sample account. Signing in loads protected backend records and role-based access.</div>
    <form onsubmit="event.preventDefault();submitBackendLogin(event.currentTarget)">
      <div class="form-grid">
        <div class="form-row"><label>Email</label><input type="email" id="auth_login_email" required /></div>
        <div class="form-row"><label>Password</label><input type="password" id="auth_login_password" required /></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">Login</button>
      </div>
    </form>
  `);
}

async function submitBackendLogin(form) {
  try {
    const emailInput = form?.querySelector?.('input[type="email"]') || document.getElementById('auth_login_email') || document.getElementById('auth_gate_email');
    const passwordInput = form?.querySelector?.('input[type="password"]') || document.getElementById('auth_login_password') || document.getElementById('auth_gate_password');
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: emailInput?.value || '',
        password: passwordInput?.value || ''
      })
    });
    setBackendAuth(data);
    closeModal();
    await loadBackendUsers();
    enterAuthenticatedApp(roleLandingPageForCurrentUser());
    toast('Signed in to backend account API.');
  } catch (err) {
    toast(err.message || 'Login failed.');
  }
}

async function logoutBackendAuth() {
  try {
    if (backendAuthState.token) await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (err) {}
  clearBackendAuth();
  showAuthGate('Signed out. Sign in to open the ERP.');
  toast('Logged out. Sign in again to load protected backend records.');
}

function backendUserToLocalUser(user) {
  const role = (user.roles || [])[0] || 'Sales';
  return {
    id: user.id,
    _backendUserId: user.id,
    name: user.displayName || user.email,
    email: user.email || '',
    role,
    customerId: role === 'Customer' ? (user.customerAccess?.[0]?.customerId || '') : '',
    addedAt: (user.createdAt || '').slice(0, 10),
    isActive: user.isActive !== false
  };
}

function upsertLocalUserFromBackend(user) {
  if (user.isActive === false) {
    state.users = (state.users || []).filter(u => u._backendUserId !== user.id && u.id !== user.id);
    return;
  }
  const mapped = backendUserToLocalUser(user);
  state.users = state.users || [];
  const existing = state.users.find(u => u._backendUserId === user.id || u.id === user.id || (u.email && u.email.toLowerCase() === (user.email || '').toLowerCase()));
  if (existing) Object.assign(existing, mapped);
  else state.users.push(mapped);
}

function customerDisplayNameForUser(user) {
  if (user.role !== 'Customer') return '-';
  if (!user.customerId) return '';
  const linked = getCustomer(user.customerId);
  if (linked?.name) return linked.name;
  if (user.customerId === 'customer_demo_1') return 'Customer Demo 1';
  return user.customerId;
}

function linkedCustomerCellHtml(user) {
  if (user.role !== 'Customer') return '<span style="color:var(--brown-light);font-size:12px">-</span>';
  const label = customerDisplayNameForUser(user);
  return label ? escapeHtml(label) : '<span style="color:var(--danger);font-size:12px">Not linked</span>';
}

function canManageBackendUsers() {
  return (backendAuthState.roles || []).includes('Admin');
}

async function loadBackendUsers() {
  if (!backendAuthState.token || backendUserState.loadingUsers) return;
  if (!canManageBackendUsers()) {
    clearProtectedBackendRows('account-management');
    backendUserState.status = 'connected';
    backendUserState.lastError = 'Customer backend session active; admin user list is hidden.';
    return;
  }
  backendUserState.loadingUsers = true;
  try {
    const users = await apiRequest('/api/users');
    (users || []).forEach(upsertLocalUserFromBackend);
    backendUserState.status = 'connected';
    backendUserState.lastError = '';
    saveState();
  } catch (err) {
    clearProtectedBackendRows('account-management');
    setBackendReadFailed(backendUserState);
  } finally {
    backendUserState.loadingUsers = false;
  }
}

function renderUsers(el) {
  if (backendAuthState.token && backendUserState.status !== 'connected' && !backendUserState.loadingUsers) {
    loadBackendUsers().then(() => { if (currentPage === 'users') router('users'); });
  }
  el.innerHTML = `
    ${backendAuthPanelHtml()}
    <div class="card">
      <div class="card-header">
        <h2>Account Management</h2>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="exportCsv('users.csv', state.users)">Export CSV</button>
          <button class="btn" onclick="editUser()" ${canManageBackendUsers() ? '' : 'disabled title="Log in as backend Admin before adding users"'}>+ Add User</button>
        </div>
      </div>
      <div class="help-text" style="margin-bottom:8px">Add team members and assign permissions. Roles now match the Phase 2A backend model; server-side enforcement is active when AUTH_REQUIRED=true.</div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Name</th><th>Email</th><th>Role</th><th>Linked Customer</th><th>Added</th><th></th>
        </tr></thead>
        <tbody>
          ${((state.users||[]).filter(u => u.isActive !== false)).length === 0 ? `<tr><td colspan="6" class="empty">No users yet.</td></tr>` :
            (state.users||[]).filter(u => u.isActive !== false).map(u => {
              const linked = u.role === 'Customer' ? getCustomer(u.customerId) : null;
              return `
              <tr>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td><a href="mailto:${escapeHtml(u.email||'')}" style="color:var(--orange)">${escapeHtml(u.email||'')}</a></td>
                <td><span class="badge ${u.role==='Admin'?'badge-prod':u.role==='Customer'?'badge-shipping':'badge-supply'}">${escapeHtml(u.role||'')}</span></td>
                <td>${linkedCustomerCellHtml(u)}</td>
                <td>${fmtDate(u.addedAt)}</td>
                <td class="row-actions">
                  ${u.role === 'Customer' && linked ? `<button class="btn btn-icon btn-sm" onclick="viewCustomerPortal('${u.customerId}')">View Portal</button>` : ''}
                  <button class="btn btn-icon btn-sm" onclick="editUser('${u.id}')">Edit</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteUser('${u.id}')">Remove</button>
                </td>
              </tr>
            `;}).join('')
          }
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px">Permission Levels</h3>
      <div class="help-text" style="margin-bottom:10px">These roles are available when adding or editing a user.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        ${USER_ROLES.map(r => `
          <div style="border:1px solid var(--grey-light);border-radius:8px;padding:10px;background:var(--beige-light)">
            <div style="font-weight:700;color:var(--brown);margin-bottom:4px">${escapeHtml(r)}</div>
            <div style="font-size:12px;color:var(--brown-light)">${roleDescription(r)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
function roleDescription(r) {
  switch(r) {
    case 'Admin': return 'Full access to all sections including user management.';
    case 'Sales': return 'Customers, Purchase Orders, Products. View Shipping.';
    case 'Supply Chain & Procurement': return 'Supply Chain, Procurement, Suppliers, Inventory.';
    case 'Warehousing': return 'Inventory, Shipping, Pick & Pack, Quality, and Production Schedule workflows.';
    case 'Production': return 'Production Schedule, Food Safety. View Inventory.';
    case 'Customer': return 'External - sees only their own customer profile, their own POs (open & completed), and packaging + finished goods inventory tied to their products.';
    default: return '';
  }
}
function editUser(id) {
  const u = (state.users||[]).find(x=>x.id===id) || { id: uid('u'), name:'', email:'', role:'Sales', customerId:'', addedAt: '' };
  const isNew = !id;
  const passwordPlaceholder = isNew ? 'Required for new backend users' : 'Optional: set a new temporary password';
  openModal((isNew?'Add':'Edit')+' User', `
    <form onsubmit="event.preventDefault();saveUser('${u.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Full Name</label><input id="usr_name" value="${escapeHtml(u.name)}" required /></div>
        <div class="form-row"><label>Email</label><input type="email" id="usr_email" value="${escapeHtml(u.email)}" required /></div>
        <div class="form-row"><label>Role / Permission Level</label>
          <select id="usr_role" required onchange="toggleCustomerLink()">
            ${USER_ROLES.map(r=>`<option ${u.role===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Added Date</label><input type="text" id="usr_added" value="${escapeHtml(u.addedAt || 'Pending backend save')}" readonly /></div>
        <div class="form-row"><label>Temporary Password</label><input type="password" id="usr_password" minlength="8" placeholder="${passwordPlaceholder}" /></div>
      </div>
      <div class="form-row" id="usr_customer_row" style="margin-top:12px;display:${u.role==='Customer'?'flex':'none'}">
        <label>Linked Customer Account *</label>
        <select id="usr_customer">
          <option value="">- Select Customer -</option>
          ${state.customers.map(c=>`<option value="${c.id}" ${u.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <div class="help-text">Required for Customer role. The user will only see data tied to this customer.</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add User':'Save Changes'}</button>
      </div>
    </form>
  `);
}
function toggleCustomerLink() {
  const role = document.getElementById('usr_role').value;
  document.getElementById('usr_customer_row').style.display = (role === 'Customer') ? 'flex' : 'none';
}
async function saveUser(id, isNew) {
  const role = document.getElementById('usr_role').value;
  const customerId = document.getElementById('usr_customer')?.value || '';
  if (role === 'Customer' && !customerId) { toast('Pick a customer to link this account to.'); return; }
  const data = {
    id,
    name: document.getElementById('usr_name').value,
    email: document.getElementById('usr_email').value,
    role,
    customerId: role === 'Customer' ? customerId : '',
    addedAt: document.getElementById('usr_added').value
  };

  if (!requireBackendWriteSession(backendUserState, 'Log in as backend Admin before saving users. Nothing was saved locally.')) return;
  try {
    const existing = (state.users || []).find(u => u.id === id);
    const password = document.getElementById('usr_password')?.value || '';
    let saved;
    if (isNew) {
      if (password.length < 8) { toast('Temporary password must be at least 8 characters for backend users.'); return; }
      saved = await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email: data.email, displayName: data.name, password, roles: [role], customerId: data.customerId || undefined })
      });
    } else {
      if (password && password.length < 8) { toast('Temporary password must be at least 8 characters.'); return; }
      const patchBody = { email: data.email, displayName: data.name, roles: [role], customerId: data.customerId || undefined, isActive: true };
      if (password) patchBody.temporaryPassword = password;
      const backendId = existing?._backendUserId || id;
      saved = await apiRequest(`/api/users/${encodeURIComponent(backendId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody)
      });
    }
    upsertLocalUserFromBackend(saved);
    backendUserState.status = 'connected';
    backendUserState.lastError = '';
    saveState();
    closeModal();
    router('users');
    toast('User saved to backend.');
    return;
  } catch (err) {
    failBackendRequiredWrite(err, backendUserState, 'Backend user save failed. The account was not created; log in as backend Admin and try again.');
    return;
  }
}

