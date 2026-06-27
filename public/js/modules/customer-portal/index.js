/* ----- Customer Portal preview ----- */
function viewCustomerPortalPreview(customerId) {
  const cust = getCustomer(customerId);
  if (!cust) { toast('Customer not found.'); return; }
  // POs for this customer
  const myPos = state.purchaseOrders.filter(p => p.customerId === customerId);
  const openPos = myPos.filter(p => p.status !== 'completed');
  const donePos = myPos.filter(p => p.status === 'completed');
  // Products linked to this customer
  const myProducts = state.products.filter(p => p.customerId === customerId);
  // Inventory: ingredients (packaging + raw) used by their products + finished goods (their products)
  const ingIds = new Set();
  myProducts.forEach(prod => {
    const bom = (state.boms || {})[prod.id] || [];
    bom.forEach(b => ingIds.add(b.ingredientId));
  });
  const myIngredients = state.ingredients.filter(i => ingIds.has(i.id));
  const packaging = myIngredients.filter(i => i.unit === 'ea');
  const rawIngs = myIngredients.filter(i => i.unit !== 'ea');

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

    <h3 style="margin:0 0 6px;color:var(--brown)">Packaging Inventory</h3>
    ${packaging.length === 0 ? '<div class="empty" style="padding:14px">No packaging items linked to your products.</div>' : `
      <div class="table-wrap"><table style="margin-bottom:14px">
        <thead><tr><th>Item</th><th>On Hand</th><th>Status</th></tr></thead>
        <tbody>
        ${packaging.map(i => `<tr>
          <td>${escapeHtml(i.name)}</td>
          <td>${i.stock} ${escapeHtml(i.unit)}</td>
          <td>${i.stock <= i.reorderLevel ? '<span class="badge badge-low">Low</span>' : '<span class="badge badge-prod">OK</span>'}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>`
    }

    <h3 style="margin:0 0 6px;color:var(--brown)">Raw Ingredient Inventory</h3>
    ${rawIngs.length === 0 ? '<div class="empty" style="padding:14px">No raw ingredients linked to your products.</div>' : `
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>On Hand</th><th>Status</th></tr></thead>
        <tbody>
        ${rawIngs.map(i => `<tr>
          <td>${escapeHtml(i.name)}</td>
          <td>${i.stock} ${escapeHtml(i.unit)}</td>
          <td>${i.stock <= i.reorderLevel ? '<span class="badge badge-low">Low</span>' : '<span class="badge badge-prod">OK</span>'}</td>
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
  if (!access?.customerId) { toast('No linked customer on this backend session.'); return; }
  viewCustomerPortal(access.customerId);
}

async function viewCustomerPortal(customerId) {
  let cust = getCustomer(customerId) || { id: customerId, name: customerId, contact: '', email: '', phone: '', address: '' };
  openModal(`Customer Portal - ${escapeHtml(cust.name)}`, '<div class="empty">Loading customer portal...</div>');
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
  renderCustomerPortalModal(customerId, cust, backendConnected, portalError);
}

function renderCustomerPortalModal(customerId, cust, backendConnected, portalError = '') {
  customerPortalDirty = false;
  customerPortalSubmitting = false;
  const myPos = state.purchaseOrders.filter(p => p.customerId === customerId);
  const openPos = myPos.filter(p => p.status !== 'completed');
  const donePos = myPos.filter(p => p.status === 'completed');
  const myProducts = state.products.filter(p => p.customerId === customerId);
  const ingIds = new Set();
  myProducts.forEach(prod => ((state.boms || {})[prod.id] || []).forEach(b => ingIds.add(b.ingredientId)));
  const myIngredients = state.ingredients.filter(i => ingIds.has(i.id));
  const packaging = myIngredients.filter(i => i.unit === 'ea');
  const rawIngs = myIngredients.filter(i => i.unit !== 'ea');

  openModal(`Customer Portal - ${escapeHtml(cust.name)}`, `
    <div class="customer-portal">
      <div class="portal-status ${backendConnected ? 'ok' : ''}">
        <strong>${backendConnected ? 'Backend connected' : 'Local preview'}</strong>
        <div class="help-text">${backendConnected ? 'Customer profile, products, POs, and files are loading from protected backend records for this account.' : (portalError ? escapeHtml(portalError) : 'Sign in as a linked customer to submit durable POs and PO files. Local customer/product demo data remains visible while backend data is unavailable.')}</div>
      </div>
      <div class="portal-form-grid">
        ${customerPortalPoFormHtml(customerId, backendConnected)}
        <div class="portal-side-stack">
          ${customerPortalUploadPanelHtml(backendConnected)}
          ${customerPortalAccountPanelHtml(cust, openPos, donePos, myProducts, packaging.length + rawIngs.length)}
        </div>
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
      <div class="portal-summary-grid">
        <section class="portal-panel">
          <div class="portal-panel-header"><h3>Packaging Inventory</h3></div>
          <div class="portal-panel-body">${customerPortalInventoryTableHtml(packaging, 'No packaging items linked to your products.')}</div>
        </section>
        <section class="portal-panel">
          <div class="portal-panel-header"><h3>Raw Ingredient Inventory</h3></div>
          <div class="portal-panel-body">${customerPortalInventoryTableHtml(rawIngs, 'No raw ingredients linked to your products.')}</div>
        </section>
      </div>
      <div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Close Portal</button></div>
    </div>
  `);
  document.querySelector('.modal')?.classList.add('portal-modal');
  bindCustomerPortalDirtyTracking();
}

function customerPortalPoFormHtml(customerId, backendConnected) {
  if (!backendConnected) {
    return `<div class="inv-check" style="margin-bottom:14px"><strong>Customer PO submission requires backend login.</strong><div class="help-text">Sign in as a linked Customer user from Account Management to submit durable POs and PO files.</div></div>`;
  }
  return `<section class="portal-panel">
    <div class="portal-panel-header"><h3>Submit Customer PO</h3></div>
    <div class="portal-panel-body">
    <form id="customerPortalPoForm" novalidate onsubmit="event.preventDefault(); submitCustomerPortalPO('${escapeAttr(customerId)}')">
      <div class="portal-form-main">
          <div class="form-grid">
            <div class="form-row"><label for="customer_po_number">Customer PO #</label><input id="customer_po_number" placeholder="PO-12345" /><div class="field-error" id="customer_po_number_error"></div></div>
            <div class="form-row"><label for="customer_po_requested">Requested ship date</label><input id="customer_po_requested" type="date" /></div>
          </div>
          <div>
            <label style="font-weight:600;color:var(--brown);font-size:13px">Line items</label>
            <div class="portal-line-table">
              <div class="po-line portal-line-head"><div>Description</div><div>Qty</div><div>Unit</div><div></div></div>
              <div id="customerPortalPoLines">${customerPortalPoLineHtml(0)}</div>
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

function customerPortalAccountPanelHtml(cust, openPos, donePos, myProducts, inventoryCount) {
  return `<section class="portal-panel">
    <div class="portal-panel-header"><h3>Account Summary</h3></div>
    <div class="portal-panel-body">
      <table class="portal-kv"><tbody>
        <tr><td>Company</td><td>${escapeHtml(cust.name)}</td></tr>
        <tr><td>Contact</td><td>${escapeHtml(cust.contact||'-')}</td></tr>
        <tr><td>Email</td><td>${escapeHtml(cust.email||'-')}</td></tr>
        <tr><td>Phone</td><td>${escapeHtml(cust.phone||'-')}</td></tr>
        <tr><td>Open POs</td><td>${openPos.length}</td></tr>
        <tr><td>Completed</td><td>${donePos.length}</td></tr>
        <tr><td>Products</td><td>${myProducts.length}</td></tr>
        <tr><td>Inventory</td><td>${inventoryCount} linked items</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

function customerPortalPoLineHtml(idx) {
  return `<div class="po-line" data-customer-portal-line="${idx}"><input aria-label="Line description" placeholder="Line description" /><input aria-label="Quantity" type="number" min="1" value="1" /><input aria-label="Unit of measure" value="Each" /><button type="button" aria-label="Remove line" onclick="removeCustomerPortalPoLine(this)">&times;</button></div>`;
}

function addCustomerPortalPoLine() {
  const cont = document.getElementById('customerPortalPoLines');
  const div = document.createElement('div');
  div.innerHTML = customerPortalPoLineHtml(cont.children.length);
  cont.appendChild(div.firstElementChild);
  customerPortalDirty = true;
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
  form.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('input', () => {
      customerPortalDirty = true;
      clearCustomerPortalValidation(el);
    });
    el.addEventListener('change', () => {
      customerPortalDirty = true;
      clearCustomerPortalValidation(el);
    });
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
    const inputs = row.querySelectorAll('input');
    const description = (inputs[0]?.value || '').trim();
    const quantity = Number(inputs[1]?.value || 0);
    const unitOfMeasure = (inputs[2]?.value || '').trim() || 'Each';
    if (description && quantity > 0) lines.push({ description, quantity, qty: quantity, unitOfMeasure, price: 0, productId: '', masterItemId: null });
    else if (!firstInvalidLineInput) firstInvalidLineInput = !description ? inputs[0] : inputs[1];
  });
  if (lines.length === 0) {
    setCustomerPortalError(firstInvalidLineInput, 'customer_po_lines_error', 'Add at least one line with a description and quantity above zero.');
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
    await viewCustomerPortal(customerId);
  } catch (error) {
    markBackendUnavailable(error);
    setCustomerPortalSubmitting(false, 'Submission failed. Review the message and try again.');
    toast(error?.message || 'Customer PO submission failed.');
    await viewCustomerPortal(customerId);
  }
}

function customerPortalPoTableHtml(pos, completed) {
  if (pos.length === 0) return `<div class="empty" style="padding:14px">${completed ? 'No completed POs.' : 'No open POs.'}</div>`;
  const rows = pos.map(p => {
    const total = fmtMoney(p.lines.reduce((s,l)=>s+(Number(l.qty || l.quantity || 0) * Number(l.price || 0)),0));
    return { po: p, total };
  });
  return `
    <div class="table-wrap portal-table-mobile-hide"><table><thead><tr><th>PO #</th><th>Date</th><th>Items</th><th>File</th><th>${completed ? 'BOL #' : 'Status'}</th></tr></thead><tbody>${rows.map(({ po:p }) => `<tr><td><strong>${escapeHtml(p.id)}</strong></td><td>${fmtDate(p.poDate)}</td><td>${p.lines.length} ${p.lines.length === 1 ? 'item' : 'items'}</td><td>${poFileLinkHtml(p)}</td><td>${completed ? escapeHtml(p.shipping?.bol||'-') : statusBadge(p.status)}</td></tr>`).join('')}</tbody></table></div>
    <div class="portal-card-list">${rows.map(({ po:p, total }) => `<div class="portal-card-row"><strong>${escapeHtml(p.id)}</strong><div class="portal-card-meta"><span>Date: ${fmtDate(p.poDate)}</span><span>Items: ${p.lines.length}</span><span>Total: ${total}</span><span>${completed ? 'BOL: ' + escapeHtml(p.shipping?.bol||'-') : 'Status: ' + statusBadge(p.status)}</span><span>${poFileLinkHtml(p)}</span></div></div>`).join('')}</div>
  `;
}

function customerPortalInventoryTableHtml(items, emptyText) {
  if (items.length === 0) return `<div class="empty" style="padding:14px">${emptyText}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>On Hand</th><th>Status</th></tr></thead><tbody>${items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td>${i.stock} ${escapeHtml(i.unit)}</td><td>${i.stock <= i.reorderLevel ? '<span class="badge badge-low">Low</span>' : '<span class="badge badge-prod">OK</span>'}</td></tr>`).join('')}</tbody></table></div>`;
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

