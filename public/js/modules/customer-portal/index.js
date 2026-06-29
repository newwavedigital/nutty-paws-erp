/* ----- Customer Portal preview ----- */
let customerPortalPageRequestId = 0;

function viewCustomerPortalPreview(customerId) {
  const cust = getCustomer(customerId);
  if (!cust) { toast('Customer not found.'); return; }
  // POs for this customer
  const myPos = state.purchaseOrders.filter(p => p.customerId === customerId);
  const openPos = myPos.filter(p => p.status !== 'completed');
  const donePos = myPos.filter(p => p.status === 'completed');
  // Products linked to this customer
  const myProducts = state.products.filter(p => p.customerId === customerId);

  openModal(`Customer Portal Preview - ${escapeHtml(cust.name)}`, `
    <div style="background:var(--beige-light);padding:10px;border-radius:6px;margin-bottom:14px;font-size:12px;color:var(--brown)">
      <strong>Preview only.</strong> This is what a Customer-role user linked to <strong>${escapeHtml(cust.name)}</strong> would see when they log in. Backend customer scoping is available when AUTH_REQUIRED=true; this preview stays local for stakeholder review.
    </div>
    <h3 style="margin:0 0 6px;color:var(--brown)">Account Info</h3>
    <table style="margin-bottom:14px">
      <tbody>
        <tr><td style="font-weight:600;width:140px">Company</td><td>${escapeHtml(cust.name)}</td></tr>
        <tr><td style="font-weight:600">Contact</td><td>${escapeHtml(cust.contact||'-')}</td></tr>
        <tr><td style="font-weight:600">Email</td><td>${escapeHtml(cust.email||'-')}</td></tr>
        <tr><td style="font-weight:600">Phone</td><td>${escapeHtml(cust.phone||'-')}</td></tr>
        <tr><td style="font-weight:600">Address</td><td>${escapeHtml(cust.address||'-')}</td></tr>
      </tbody>
    </table>

    <h3 style="margin:0 0 6px;color:var(--brown)">Open Purchase Orders (${openPos.length})</h3>
    ${openPos.length === 0 ? '<div class="empty" style="padding:14px">No open POs.</div>' : `
      <div class="table-wrap"><table style="margin-bottom:14px">
        <thead><tr><th>PO #</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
        ${openPos.map(p => `<tr>
          <td><strong>${p.id}</strong></td>
          <td>${fmtDate(p.poDate)}</td>
          <td>${p.lines.length}</td>
          <td>${fmtMoney(p.lines.reduce((s,l)=>s+l.qty*l.price,0))}</td>
          <td>${statusBadge(p.status)}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>`
    }

    <h3 style="margin:0 0 6px;color:var(--brown)">Completed Purchase Orders (${donePos.length})</h3>
    ${donePos.length === 0 ? '<div class="empty" style="padding:14px">No completed POs.</div>' : `
      <div class="table-wrap"><table style="margin-bottom:14px">
        <thead><tr><th>PO #</th><th>Date</th><th>Items</th><th>Total</th><th>BOL #</th></tr></thead>
        <tbody>
        ${donePos.map(p => `<tr>
          <td><strong>${p.id}</strong></td>
          <td>${fmtDate(p.poDate)}</td>
          <td>${p.lines.length}</td>
          <td>${fmtMoney(p.lines.reduce((s,l)=>s+l.qty*l.price,0))}</td>
          <td>${escapeHtml(p.shipping?.bol||'-')}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>`
    }

    <h3 style="margin:0 0 6px;color:var(--brown)">Finished Goods (Your SKUs)</h3>
    ${myProducts.length === 0 ? '<div class="empty" style="padding:14px">No products linked yet.</div>' : `
      <div class="table-wrap"><table style="margin-bottom:14px">
        <thead><tr><th>SKU</th><th>Name</th><th>Size</th><th>Production Room</th></tr></thead>
        <tbody>
        ${myProducts.map(p => `<tr>
          <td><strong>${escapeHtml(p.sku)}</strong></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${p.size ? escapeHtml(p.size+(p.sizeUnit||'oz')) : '-'}</td>
          <td>${escapeHtml(p.room||'-')}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>`
    }

    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close Preview</button>
    </div>
  `);
}

function viewSignedInCustomerPortal() {
  const access = (backendAuthState.customerAccess || [])[0];
  if (!access?.customerId) { toast('No linked customer on this account session.'); return; }
  viewCustomerPortal(access.customerId);
}

async function loadCustomerPortalData(customerId) {
  let cust = getCustomer(customerId) || { id: customerId, name: customerId, contact: '', email: '', phone: '', address: '' };
  let backendConnected = false;
  let portalError = '';
  if (backendAuthState.token) {
    try {
      if (backendAuthState.user?.userType === 'customer') {
        const profile = await loadBackendCustomerProfile();
        if (profile?.id) customerId = profile.id;
      } else {
        await loadBackendCustomers();
      }
      await loadBackendProducts();
      await refreshBackendPurchaseOrders();
      cust = getCustomer(customerId) || cust;
      backendConnected = backendApiState.status === 'connected';
    } catch (error) {
      markBackendUnavailable(error);
      portalError = error?.message || 'Backend portal data unavailable.';
    }
  }
  return { customerId, cust, backendConnected, portalError };
}

async function viewCustomerPortal(customerId) {
  let cust = getCustomer(customerId) || { id: customerId, name: customerId, contact: '', email: '', phone: '', address: '' };
  openModal(`Customer Portal - ${escapeHtml(cust.name)}`, '<div class="empty">Loading customer portal...</div>');
  const portal = await loadCustomerPortalData(customerId);
  renderCustomerPortalModal(portal.customerId, portal.cust, portal.backendConnected, portal.portalError);
}

async function renderSignedInCustomerPortalPage(el) {
  const requestId = ++customerPortalPageRequestId;
  const access = (backendAuthState.customerAccess || [])[0];
  if (!access?.customerId) {
    el.innerHTML = renderOpsPanel({
      title: 'Customer Portal',
      kicker: 'Customer access',
      body: `
        <div class="empty">
          <strong>Customer link unavailable.</strong>
          <p>This account session is not linked to a customer account. Ask an Admin to link this login to the correct customer record.</p>
        </div>`
    });
    return;
  }
  el.innerHTML = `
    <div class="customer-portal">
      <div class="empty" style="padding:14px">Loading customer portal...</div>
    </div>`;
  const portal = await loadCustomerPortalData(access.customerId);
  if (requestId !== customerPortalPageRequestId || currentPage !== 'customer-portal') return;
  renderCustomerPortalInline(el, portal.customerId, portal.cust, portal.backendConnected, portal.portalError);
}

function customerPortalContentHtml(customerId, cust, backendConnected, portalError = '', { showCloseButton = true } = {}) {
  customerPortalDirty = false;
  customerPortalSubmitting = false;
  const myPos = state.purchaseOrders.filter(p => p.customerId === customerId);
  const openPos = myPos.filter(p => p.status !== 'completed');
  const donePos = myPos.filter(p => p.status === 'completed');
  const myProducts = state.products.filter(p => p.customerId === customerId);
  const uploadPanel = customerPortalUploadPanelHtml(backendConnected);

  return `
    <div class="customer-portal">
      <div class="portal-form-grid">
        ${customerPortalPoFormHtml(customerId, backendConnected)}
        ${uploadPanel ? `<div class="portal-side-stack">${uploadPanel}</div>` : ''}
      </div>
      <section class="portal-panel portal-orders-panel">
        <div class="portal-panel-header"><h3>Open Purchase Orders (${openPos.length})</h3></div>
        <div class="portal-panel-body">${customerPortalPoTableHtml(openPos, false)}</div>
      </section>
      <section class="portal-panel portal-orders-panel">
        <div class="portal-panel-header"><h3>Completed Purchase Orders (${donePos.length})</h3></div>
        <div class="portal-panel-body">${customerPortalPoTableHtml(donePos, true)}</div>
      </section>
      <section class="portal-panel">
        <div class="portal-panel-header"><h3>Finished Goods</h3></div>
        <div class="portal-panel-body">${myProducts.length === 0 ? '<div class="empty" style="padding:14px">No products linked yet.</div>' : `<div class="table-wrap"><table><thead><tr><th>SKU</th><th>Name</th><th>Size</th><th>Production Room</th></tr></thead><tbody>${myProducts.map(p => `<tr><td><strong>${escapeHtml(p.sku)}</strong></td><td>${escapeHtml(p.name)}</td><td>${p.size ? escapeHtml(p.size+(p.sizeUnit||'oz')) : '-'}</td><td>${escapeHtml(p.room||'-')}</td></tr>`).join('')}</tbody></table></div>`}</div>
      </section>
      ${showCloseButton ? '<div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Close Portal</button></div>' : ''}
    </div>
  `;
}

function renderCustomerPortalInline(el, customerId, cust, backendConnected, portalError = '') {
  el.innerHTML = customerPortalContentHtml(customerId, cust, backendConnected, portalError, { showCloseButton: false });
  bindCustomerPortalDirtyTracking();
}

function renderCustomerPortalModal(customerId, cust, backendConnected, portalError = '') {
  openModal(`Customer Portal - ${escapeHtml(cust.name)}`, customerPortalContentHtml(customerId, cust, backendConnected, portalError));
  document.querySelector('.modal')?.classList.add('portal-modal');
  bindCustomerPortalDirtyTracking();
}

function customerPortalPoFormHtml(customerId, backendConnected) {
  if (!backendConnected) {
    return `<div class="inv-check" style="margin-bottom:14px"><strong>Customer PO submission requires a signed-in account.</strong><div class="help-text">Sign in with a linked Customer account to submit POs and PO files.</div></div>`;
  }
  return `<section class="portal-panel">
    <div class="portal-panel-header"><h3>Submit Customer PO</h3></div>
    <div class="portal-panel-body">
    <form id="customerPortalPoForm" data-customer-id="${escapeAttr(customerId)}" novalidate onsubmit="event.preventDefault(); submitCustomerPortalPO('${escapeAttr(customerId)}')">
      <div class="portal-form-main">
          <div class="form-grid">
            <div class="form-row"><label for="customer_po_number">Customer PO #</label><input id="customer_po_number" placeholder="PO-12345" /><div class="field-error" id="customer_po_number_error"></div></div>
            <div class="form-row"><label for="customer_po_requested">Requested ship date</label><input id="customer_po_requested" type="date" /></div>
          </div>
          <div>
            <label style="font-weight:600;color:var(--brown);font-size:13px">Line items</label>
            <div class="portal-line-table">
              <div class="po-line portal-line-head"><div>Product</div><div>Qty</div><div>Unit</div><div></div></div>
              <div id="customerPortalPoLines">${customerPortalPoLineHtml(0, customerId)}</div>
            </div>
            <div class="field-error" id="customer_po_lines_error"></div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addCustomerPortalPoLine()" style="margin-top:8px">+ Add Line</button>
          </div>
          <div class="form-row"><label for="customer_po_notes">Notes</label><textarea id="customer_po_notes" maxlength="500" placeholder="Delivery notes, labels, or timing requests."></textarea><div class="help-text">Notes are optional and visible to Nut House operations.</div></div>
          <div class="portal-submit-state" id="customer_po_submit_state"></div>
          <div class="form-actions"><button type="submit" class="btn" id="customer_po_submit_btn">Submit PO</button></div>
      </div>
    </form>
    </div>
  </section>`;
}

function customerPortalUploadPanelHtml(backendConnected) {
  if (!backendConnected) return '';
  return `<section class="portal-panel">
    <div class="portal-panel-header"><h3>PO File Upload</h3></div>
    <div class="portal-panel-body">
      <div class="form-row">
        <div class="file-upload">
          <label class="portal-file-drop" for="customer_po_file">
            <strong>Drag and drop your PO file here</strong>
            <span>or <span class="portal-file-browse">browse</span> to select a file</span>
          </label>
          <input type="file" id="customer_po_file" accept=".pdf,application/pdf,image/*,.txt,text/plain" onchange="customerPortalFileSelected(event)" />
        </div>
        <div class="portal-file-card" id="customer_po_file_card">
          <span class="portal-file-type">PDF</span>
          <div>
            <div class="portal-file-name" id="customer_po_file_info">No file attached</div>
            <div class="portal-file-meta">PDF preferred, 5 MB max</div>
          </div>
          <button type="button" class="btn btn-icon btn-sm" aria-label="Remove selected file" onclick="clearCustomerPortalFile()">&times;</button>
        </div>
        <div class="upload-progress" id="customer_po_upload_progress"><span></span></div>
      </div>
    </div>
  </section>`;
}

function profileSettingsAccountSummaryHtml(customerId, cust) {
  if (!customerId || !cust) {
    return `<section class="portal-panel profile-panel profile-settings-summary">
      <div class="portal-panel-header"><h3>Account Summary</h3></div>
      <div class="portal-panel-body">
        <div class="empty" style="padding:10px">No customer account is linked to this login.</div>
      </div>
    </section>`;
  }
  const myPos = state.purchaseOrders.filter(p => p.customerId === customerId);
  const openPos = myPos.filter(p => p.status !== 'completed');
  const donePos = myPos.filter(p => p.status === 'completed');
  const myProducts = state.products.filter(p => p.customerId === customerId);
  return `<section class="portal-panel profile-settings-summary">
    <div class="portal-panel-header"><h3>Account Summary</h3></div>
    <div class="portal-panel-body">
      <div class="profile-settings-metric-row">
        <div class="profile-settings-metric">
          <span>Open POs</span>
          <strong>${openPos.length}</strong>
        </div>
        <div class="profile-settings-metric">
          <span>Completed POs</span>
          <strong>${donePos.length}</strong>
        </div>
        <div class="profile-settings-metric">
          <span>Products available</span>
          <strong>${myProducts.length}</strong>
        </div>
      </div>
      <table class="portal-kv"><tbody>
        <tr><td>Company</td><td>${escapeHtml(cust.name || '-')}</td></tr>
        <tr><td>Contact</td><td>${escapeHtml(cust.contact||'-')}</td></tr>
        <tr><td>Email</td><td>${escapeHtml(cust.email||'-')}</td></tr>
        <tr><td>Phone</td><td>${escapeHtml(cust.phone||'-')}</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

async function renderProfileSettings(el) {
  const access = (backendAuthState.customerAccess || [])[0];
  el.innerHTML = `
    <div class="profile-settings">
      <section class="portal-panel">
        <div class="portal-panel-header"><h3>Profile Settings</h3></div>
        <div class="portal-panel-body">
          <div class="empty" style="padding:10px">Loading profile settings...</div>
        </div>
      </section>
    </div>`;

  let profile = {
    customerId: access?.customerId || '',
    cust: access?.customerId ? getCustomer(access.customerId) : null,
    portalError: ''
  };
  if (access?.customerId) {
    try {
      const portal = await loadCustomerPortalData(access.customerId);
      profile = { customerId: portal.customerId, cust: portal.cust, portalError: portal.portalError };
    } catch (error) {
      profile.portalError = error?.message || 'Account summary is unavailable right now.';
    }
  }
  if (currentPage !== 'profile-settings') return;
  el.innerHTML = profileSettingsHtml(profile.customerId, profile.cust, profile.portalError);
}

function profileSettingsHtml(customerId, cust, portalError = '') {
  return `
    <div class="profile-settings">
      <div class="profile-settings-layout">
        ${profileSettingsAccountSummaryHtml(customerId, cust)}
        ${portalError ? `<div class="help-text profile-settings-note">${escapeHtml(portalError)}</div>` : ''}
        <div class="profile-settings-grid">
          ${profileSettingsLoginDetailsHtml()}
          ${profileSettingsPasswordFormHtml()}
        </div>
      </div>
    </div>`;
}

function profileSettingsLoginDetailsHtml() {
  const user = backendAuthState.user || {};
  const role = primaryBackendRole() || user.userType || 'Account';
  return `<section class="portal-panel profile-panel">
    <div class="portal-panel-header"><h3>Signed-in Account</h3></div>
    <div class="portal-panel-body">
      <table class="portal-kv"><tbody>
        <tr><td>Name</td><td>${escapeHtml(user.displayName || '-')}</td></tr>
        <tr><td>Login email</td><td>${escapeHtml(user.email || '-')}</td></tr>
        <tr><td>Role</td><td>${escapeHtml(role)}</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

function profileSettingsPasswordFormHtml() {
  return `<section class="portal-panel profile-panel profile-settings-password">
    <div class="portal-panel-header"><h3>Change Password</h3></div>
    <div class="portal-panel-body">
      <form class="profile-password-form" novalidate onsubmit="event.preventDefault(); submitProfilePasswordChange(event.currentTarget)">
        <div class="form-row">
          <label for="profile_current_password">Current password</label>
          <div class="profile-password-input">
            <input type="password" id="profile_current_password" autocomplete="current-password" required />
            <button type="button" class="btn btn-secondary btn-sm" aria-pressed="false" onclick="toggleProfilePasswordVisibility('profile_current_password', this)">Show</button>
          </div>
        </div>
        <div class="form-row">
          <label for="profile_new_password">New password</label>
          <div class="profile-password-input">
            <input type="password" id="profile_new_password" autocomplete="new-password" minlength="8" data-password-strength="minimum-8" required />
            <button type="button" class="btn btn-secondary btn-sm" aria-pressed="false" onclick="toggleProfilePasswordVisibility('profile_new_password', this)">Show</button>
          </div>
          <div class="help-text">Use at least 8 characters.</div>
        </div>
        <div class="form-row">
          <label for="profile_confirm_password">Confirm new password</label>
          <div class="profile-password-input">
            <input type="password" id="profile_confirm_password" autocomplete="new-password" minlength="8" data-password-match="profile_new_password" required />
            <button type="button" class="btn btn-secondary btn-sm" aria-pressed="false" onclick="toggleProfilePasswordVisibility('profile_confirm_password', this)">Show</button>
          </div>
          <div class="field-error" id="profile_password_error"></div>
        </div>
        <div class="profile-password-feedback" id="profile_password_feedback" role="status" aria-live="polite"></div>
        <div class="form-actions">
          <button type="submit" class="btn" id="profile_password_submit">Change Password</button>
        </div>
      </form>
    </div>
  </section>`;
}

function toggleProfilePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.textContent = showing ? 'Show' : 'Hide';
  button.setAttribute('aria-pressed', showing ? 'false' : 'true');
}

function setProfilePasswordMessage(message, isError = false) {
  const status = document.getElementById('profile_password_feedback');
  const error = document.getElementById('profile_password_error');
  if (status) {
    status.textContent = message;
    status.classList.toggle('error', isError);
    status.classList.toggle('success', Boolean(message) && !isError);
  }
  if (error) error.textContent = isError ? message : '';
}

async function submitProfilePasswordChange(form) {
  const currentPassword = document.getElementById('profile_current_password')?.value || '';
  const newPassword = document.getElementById('profile_new_password')?.value || '';
  const confirmPassword = document.getElementById('profile_confirm_password')?.value || '';
  const submit = document.getElementById('profile_password_submit');
  form?.querySelectorAll?.('input.invalid').forEach(input => input.classList.remove('invalid'));
  setProfilePasswordMessage('');

  if (newPassword.length < 8) {
    document.getElementById('profile_new_password')?.classList.add('invalid');
    setProfilePasswordMessage('New password must be at least 8 characters.', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    document.getElementById('profile_confirm_password')?.classList.add('invalid');
    setProfilePasswordMessage('New passwords do not match.', true);
    return;
  }

  try {
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Changing...';
    }
    await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    form.reset();
    setProfilePasswordMessage('Password changed.');
    toast('Password changed.');
  } catch (error) {
    setProfilePasswordMessage(error?.message || 'Password change failed.', true);
    toast(error?.message || 'Password change failed.');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Change Password';
    }
  }
}

function customerPortalProducts(customerId) {
  return state.products
    .filter(p => p.customerId === customerId && (p.status || 'active') === 'active')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function customerPortalProductLabel(product) {
  return `${product.sku ? product.sku + ' - ' : ''}${product.name || product.id}`;
}

function customerPortalProductOptionsHtml(customerId, selectedProductId = '') {
  const products = customerPortalProducts(customerId);
  return products.map(p => {
    const label = customerPortalProductLabel(p);
    const selected = p.id === selectedProductId ? ' aria-selected="true"' : '';
    return `<button type="button" class="customer-po-product-option" role="option" data-product-id="${escapeAttr(p.id)}" data-product-label="${escapeAttr(label)}"${selected} onclick="selectCustomerPortalProductOption(this)" onkeydown="customerPortalProductOptionKeydown(event)">${escapeHtml(label)}</button>`;
  }).join('');
}

function customerPortalPoLineHtml(idx, customerId = '') {
  const menuId = `customer_po_product_options_${idx}`;
  return `<div class="po-line" data-customer-portal-line="${idx}">
    <div class="customer-po-product-picker">
      <input aria-label="Product" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${escapeAttr(menuId)}" autocomplete="off" data-product-id="" placeholder="Type product or custom item" onfocus="openCustomerPortalProductMenu(this)" onclick="openCustomerPortalProductMenu(this)" oninput="customerPortalProductSearchChanged(this)" onkeydown="customerPortalProductKeydown(event)" onchange="customerPortalLineProductChanged(this)" />
      <div id="${escapeAttr(menuId)}" class="customer-po-product-menu" role="listbox" hidden>
        ${customerPortalProductOptionsHtml(customerId)}
        <div class="customer-po-product-empty" hidden>No matching catalog item. Custom text is OK.</div>
      </div>
      <div class="customer-po-product-help">Choose a listed item or type a custom product.</div>
    </div>
    <input aria-label="Quantity" type="number" min="1" value="1" />
    <input aria-label="Unit" value="Each" />
    <button type="button" aria-label="Remove line" onclick="removeCustomerPortalPoLine(this)">&times;</button>
  </div>`;
}

function addCustomerPortalPoLine() {
  const cont = document.getElementById('customerPortalPoLines');
  const customerId = document.getElementById('customerPortalPoForm')?.dataset.customerId || '';
  const div = document.createElement('div');
  div.innerHTML = customerPortalPoLineHtml(cont.children.length, customerId);
  cont.appendChild(div.firstElementChild);
  customerPortalDirty = true;
}

function customerPortalMenuForInput(input) {
  const menuId = input?.getAttribute('aria-controls');
  return menuId ? document.getElementById(menuId) : null;
}

function closeCustomerPortalProductMenus(exceptMenu = null) {
  document.querySelectorAll('.customer-po-product-menu').forEach(menu => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    const input = document.querySelector(`input[aria-controls="${CSS.escape(menu.id)}"]`);
    if (input) input.setAttribute('aria-expanded', 'false');
  });
}

function filterCustomerPortalProductMenu(input) {
  const menu = customerPortalMenuForInput(input);
  if (!menu) return;
  const query = String(input.value || '').trim().toLowerCase();
  let visibleCount = 0;
  menu.querySelectorAll('.customer-po-product-option').forEach(option => {
    const match = !query || String(option.dataset.productLabel || '').toLowerCase().includes(query);
    option.hidden = !match;
    if (match) visibleCount++;
  });
  const empty = menu.querySelector('.customer-po-product-empty');
  if (empty) empty.hidden = visibleCount > 0;
}

function openCustomerPortalProductMenu(input) {
  const menu = customerPortalMenuForInput(input);
  if (!menu) return;
  closeCustomerPortalProductMenus(menu);
  filterCustomerPortalProductMenu(input);
  menu.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function selectCustomerPortalProductOption(option) {
  const menu = option.closest('.customer-po-product-menu');
  const input = menu ? document.querySelector(`input[aria-controls="${CSS.escape(menu.id)}"]`) : null;
  if (!input) return;
  input.value = option.dataset.productLabel || option.textContent.trim();
  input.dataset.productId = option.dataset.productId || '';
  customerPortalLineProductChanged(input);
  input.focus();
  closeCustomerPortalProductMenus();
}

function customerPortalProductSearchChanged(input) {
  input.dataset.productId = '';
  openCustomerPortalProductMenu(input);
  customerPortalLineProductChanged(input);
}

function customerPortalProductKeydown(event) {
  const input = event.currentTarget;
  const menu = customerPortalMenuForInput(input);
  if (event.key === 'Escape') {
    closeCustomerPortalProductMenus();
    input.blur();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    customerPortalLineProductChanged(input);
    closeCustomerPortalProductMenus();
    input.blur();
    return;
  }
  if (event.key !== 'ArrowDown') return;
  openCustomerPortalProductMenu(input);
  const first = menu?.querySelector('.customer-po-product-option:not([hidden])');
  if (first) {
    event.preventDefault();
    first.focus();
  }
}

function customerPortalProductOptionKeydown(event) {
  if (event.key === 'Escape') {
    closeCustomerPortalProductMenus();
    const input = document.querySelector(`input[aria-controls="${CSS.escape(event.currentTarget.closest('.customer-po-product-menu')?.id || '')}"]`);
    input?.focus();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    selectCustomerPortalProductOption(event.currentTarget);
  }
}

function handleCustomerPortalProductPickerDocumentClick(event) {
  if (event.target?.closest?.('.customer-po-product-picker')) return;
  closeCustomerPortalProductMenus();
}

function handleCustomerPortalProductPickerFocusOut(event) {
  const picker = event.target?.closest?.('.customer-po-product-picker');
  if (!picker) return;
  setTimeout(() => {
    if (picker.contains(document.activeElement)) return;
    closeCustomerPortalProductMenus();
  }, 0);
}

function customerPortalLineProductChanged(input) {
  const row = input.closest('.po-line');
  const unitInput = row?.querySelector('input[aria-label="Unit"]');
  if (unitInput) unitInput.value = 'Each';
  const matchingOption = [...(row?.querySelectorAll('.customer-po-product-option') || [])]
    .find(option => String(option.dataset.productLabel || '') === String(input.value || '').trim());
  input.dataset.productId = matchingOption?.dataset.productId || input.dataset.productId || '';
  customerPortalDirty = true;
  clearCustomerPortalValidation(input);
}

function removeCustomerPortalPoLine(button) {
  const rows = document.querySelectorAll('#customerPortalPoLines .po-line');
  if (rows.length <= 1) { toast('At least one line item required.'); return; }
  button.closest('.po-line')?.remove();
  customerPortalDirty = true;
}

function bindCustomerPortalDirtyTracking() {
  const form = document.getElementById('customerPortalPoForm');
  if (!form) return;
  document.removeEventListener('click', handleCustomerPortalProductPickerDocumentClick);
  document.addEventListener('click', handleCustomerPortalProductPickerDocumentClick);
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => {
      customerPortalDirty = true;
      clearCustomerPortalValidation(el);
    });
    el.addEventListener('change', () => {
      customerPortalDirty = true;
      clearCustomerPortalValidation(el);
    });
  });
  form.querySelectorAll('.customer-po-product-picker').forEach(picker => {
    picker.removeEventListener('focusout', handleCustomerPortalProductPickerFocusOut);
    picker.addEventListener('focusout', handleCustomerPortalProductPickerFocusOut);
  });
}

function clearCustomerPortalValidation(el) {
  if (el) el.classList.remove('invalid');
  const numberError = document.getElementById('customer_po_number_error');
  const linesError = document.getElementById('customer_po_lines_error');
  if (el?.id === 'customer_po_number' && numberError) numberError.textContent = '';
  if (el?.closest?.('#customerPortalPoLines') && linesError) linesError.textContent = '';
}

function setCustomerPortalError(el, errorId, message) {
  if (el) el.classList.add('invalid');
  const target = document.getElementById(errorId);
  if (target) target.textContent = message;
}

function setCustomerPortalSubmitting(isSubmitting, message = '') {
  customerPortalSubmitting = isSubmitting;
  const button = document.getElementById('customer_po_submit_btn');
  const progress = document.getElementById('customer_po_upload_progress');
  const state = document.getElementById('customer_po_submit_state');
  if (button) {
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? 'Submitting...' : 'Submit PO';
  }
  if (progress) progress.classList.toggle('active', isSubmitting);
  if (state) state.textContent = message;
}

function customerPortalFileSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  pendingCustomerPortalFile = f;
  customerPortalDirty = true;
  const info = document.getElementById('customer_po_file_info');
  if (info) {
    info.innerHTML = escapeHtml(f.name);
    info.title = f.name;
    info.classList.add('has');
  }
  const meta = document.querySelector('#customer_po_file_card .portal-file-meta');
  if (meta) meta.textContent = `${(f.type || 'File').split('/').pop().toUpperCase()} - ${Math.max(1, Math.round(f.size/1024))} KB - Ready`;
  const type = document.querySelector('#customer_po_file_card .portal-file-type');
  if (type) type.textContent = (f.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
}

function clearCustomerPortalFile() {
  pendingCustomerPortalFile = null;
  customerPortalDirty = true;
  const input = document.getElementById('customer_po_file');
  if (input) input.value = '';
  const info = document.getElementById('customer_po_file_info');
  if (info) {
    info.textContent = 'No file attached';
    info.removeAttribute('title');
    info.classList.remove('has');
  }
  const meta = document.querySelector('#customer_po_file_card .portal-file-meta');
  if (meta) meta.textContent = 'PDF preferred, 5 MB max';
  const type = document.querySelector('#customer_po_file_card .portal-file-type');
  if (type) type.textContent = 'PDF';
}

async function submitCustomerPortalPO(customerId) {
  const poNumberEl = document.getElementById('customer_po_number');
  const poNumber = poNumberEl?.value.trim();
  document.querySelectorAll('#customerPortalPoForm .invalid').forEach(el => el.classList.remove('invalid'));
  const numberError = document.getElementById('customer_po_number_error');
  const linesError = document.getElementById('customer_po_lines_error');
  if (numberError) numberError.textContent = '';
  if (linesError) linesError.textContent = '';
  if (!poNumber) {
    setCustomerPortalError(poNumberEl, 'customer_po_number_error', 'Enter the customer PO number.');
    poNumberEl?.focus();
    return;
  }
  const lines = [];
  let firstInvalidLineInput = null;
  document.querySelectorAll('#customerPortalPoLines .po-line').forEach(row => {
    const productInput = row.querySelector('input[aria-label="Product"]');
    const inputs = row.querySelectorAll('input');
    const productText = (productInput?.value || '').trim();
    const matchingOption = [...(row.querySelectorAll('.customer-po-product-option') || [])]
      .find(option => String(option.dataset.productLabel || '') === productText);
    const productId = (productInput?.dataset.productId || matchingOption?.dataset.productId || '').trim();
    const product = getProduct(productId);
    const quantity = Number(inputs[1]?.value || 0);
    const unitOfMeasure = (inputs[2]?.value || '').trim() || 'Each';
    if (productText && quantity > 0) {
      lines.push({
        description: product?.name || productText,
        quantity,
        qty: quantity,
        unitOfMeasure,
        price: 0,
        productId: productId || null,
        masterItemId: null
      });
    } else if (!firstInvalidLineInput) firstInvalidLineInput = !productText ? productInput : inputs[1];
  });
  if (lines.length === 0) {
    setCustomerPortalError(firstInvalidLineInput, 'customer_po_lines_error', 'Enter at least one product or product description and a quantity above zero.');
    firstInvalidLineInput?.focus();
    return;
  }
  const localPo = {
    id: poNumber,
    brand: '',
    customerId,
    poDate: new Date().toISOString().slice(0,10),
    requestedDate: document.getElementById('customer_po_requested')?.value || '',
    notes: document.getElementById('customer_po_notes')?.value || '',
    lines,
    status: 'in_supply_chain',
    poFile: null,
    _pendingUploadFile: pendingCustomerPortalFile,
    scOverrides: {}
  };
  try {
    setCustomerPortalSubmitting(true, pendingCustomerPortalFile ? 'Creating PO and uploading file...' : 'Creating PO...');
    await createBackendPurchaseOrder(localPo);
    pendingCustomerPortalFile = null;
    customerPortalDirty = false;
    toast(`${poNumber} submitted through backend.`);
    const content = document.getElementById('content');
    if (currentPage === 'customer-portal' && content) {
      await renderSignedInCustomerPortalPage(content);
    } else {
      await viewCustomerPortal(customerId);
    }
  } catch (error) {
    markBackendUnavailable(error);
    setCustomerPortalSubmitting(false, 'Submission failed. Review the message and try again.');
    toast(error?.message || 'Customer PO submission failed.');
    const content = document.getElementById('content');
    if (currentPage === 'customer-portal' && content) {
      await renderSignedInCustomerPortalPage(content);
    } else {
      await viewCustomerPortal(customerId);
    }
  }
}

function customerPortalPoTableHtml(pos, completed) {
  if (pos.length === 0) return `<div class="empty" style="padding:14px">${completed ? 'No completed POs.' : 'No open POs.'}</div>`;
  const rows = pos.map(p => {
    const total = fmtMoney(p.lines.reduce((s,l)=>s+(Number(l.qty || l.quantity || 0) * Number(l.price || 0)),0));
    return { po: p, total };
  });
  return `
    <div class="table-wrap portal-table-mobile-hide"><table><thead><tr><th>PO #</th><th>Date</th><th>Items</th><th>File</th><th>${completed ? 'BOL #' : 'Status'}</th><th>Request</th></tr></thead><tbody>${rows.map(({ po:p }) => `<tr><td><strong>${escapeHtml(p.id)}</strong></td><td>${fmtDate(p.poDate)}</td><td>${p.lines.length} ${p.lines.length === 1 ? 'item' : 'items'}</td><td>${poFileLinkHtml(p)}</td><td>${completed ? escapeHtml(p.shipping?.bol||'-') : statusBadge(p.status)}</td><td>${customerPortalPoActionsHtml(p, completed)}</td></tr>`).join('')}</tbody></table></div>
    <div class="portal-card-list">${rows.map(({ po:p, total }) => `<div class="portal-card-row"><strong>${escapeHtml(p.id)}</strong><div class="portal-card-meta"><span>Date: ${fmtDate(p.poDate)}</span><span>Items: ${p.lines.length}</span><span>Total: ${total}</span><span>${completed ? 'BOL: ' + escapeHtml(p.shipping?.bol||'-') : 'Status: ' + statusBadge(p.status)}</span><span>${poFileLinkHtml(p)}</span><span>${customerPortalPoActionsHtml(p, completed)}</span></div></div>`).join('')}</div>
  `;
}

function customerPortalPoActionsHtml(po, completed) {
  const purchaseOrderId = backendPurchaseOrderId(po);
  if (completed || !purchaseOrderId) return '-';
  return `<div class="portal-request-actions">
    <button type="button" class="btn btn-secondary btn-sm" onclick="submitCustomerPoChangeRequest('${escapeAttr(purchaseOrderId)}', 'change')">Request change</button>
    <button type="button" class="btn btn-secondary btn-sm" onclick="submitCustomerPoChangeRequest('${escapeAttr(purchaseOrderId)}', 'cancel')">Request cancel</button>
  </div>`;
}

async function submitCustomerPoChangeRequest(purchaseOrderId, requestType) {
  const label = requestType === 'cancel' ? 'cancel' : 'change';
  const message = prompt(`Describe the ${label} request for this PO:`);
  if (!message || !message.trim()) return;
  try {
    await createBackendPurchaseOrderChangeRequest(purchaseOrderId, requestType, message.trim());
    toast(`PO ${label} request sent to Nut House.`);
  } catch (error) {
    markBackendUnavailable(error);
    toast(error?.message || `PO ${label} request failed.`);
  }
}
async function deleteUser(id) {
  const existing = (state.users || []).find(u => u.id === id);
  const ok = await openConfirmModal({
    title: 'Remove user',
    record: existing?.email || existing?.name || id,
    message: 'Remove this user from Account Management?',
    risk: 'Backend-backed users are deactivated when the backend API is available.',
    confirmLabel: 'Remove User',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireBackendWriteSession(backendUserState, 'Log in as backend Admin before removing users. Nothing was saved locally.')) return;
  if (!existing?._backendUserId) return failBackendRequiredWrite(null, backendUserState, 'This user is not backend-backed. Nothing was saved locally.');
  try {
    await apiRequest(`/api/users/${encodeURIComponent(existing._backendUserId)}`, { method: 'DELETE' });
    state.users = (state.users || []).filter(u => u.id !== id && u._backendUserId !== existing._backendUserId);
    saveState();
    router('users');
    toast('User deactivated in backend.');
    return;
  } catch (err) {
    failBackendRequiredWrite(err, backendUserState, 'Backend user delete failed. Nothing was saved locally.');
    return;
  }
}
