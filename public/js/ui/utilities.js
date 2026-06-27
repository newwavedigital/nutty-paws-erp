/* =========================================================================
   UTILITIES
   ========================================================================= */
function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function nextPoId() {
  const nums = state.purchaseOrders
    .map(p => parseInt((p.id.match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return 'PO-' + next;
}
function fmtMoney(n) {
  return '$' + Number(n || 0).toFixed(2);
}
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function statusBadge(s) {
  const map = {
    draft: ['Draft', 'badge-pending'],
    submitted: ['Submitted', 'badge-supply'],
    supply_chain_review: ['Supply Chain', 'badge-supply'],
    pending: ['Pending Review', 'badge-pending'],
    in_supply_chain: ['Supply Chain', 'badge-supply'],
    approved_for_production: ['Approved', 'badge-prod'],
    in_production: ['In Production', 'badge-prod'],
    qa_review: ['QA Review', 'badge-pending'],
    shipping: ['Ready to Ship', 'badge-shipping'],
    completed: ['Completed', 'badge-complete']
  };
  const [label, cls] = map[s] || [s, 'badge-complete'];
  return `<span class="badge ${cls}">${label}</span>`;
}
function getCustomer(id) { return state.customers.find(c => c.id === id); }
function getProduct(id) { return state.products.find(p => p.id === id); }
function getSupplier(id) { return state.suppliers.find(s => s.id === id); }
function getIngredient(id) { return state.ingredients.find(i => i.id === id); }
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function getModalFocusableElements() {
  const modal = document.getElementById('modal');
  if (!modal?.classList.contains('open')) return [];
  return Array.from(modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

function captureModalFieldState(root) {
  return Array.from(root.querySelectorAll('input, textarea, select')).map((el, index) => ({
    index,
    id: el.id || '',
    name: el.getAttribute('name') || '',
    value: el.value,
    checked: Boolean(el.checked),
    selectedIndex: typeof el.selectedIndex === 'number' ? el.selectedIndex : -1
  }));
}

function restoreModalFieldState(root, fieldState = []) {
  const fields = Array.from(root.querySelectorAll('input, textarea, select'));
  fieldState.forEach(saved => {
    const field = (saved.id && root.querySelector(`#${CSS.escape(saved.id)}`))
      || (saved.name && root.querySelector(`[name="${CSS.escape(saved.name)}"]`))
      || fields[saved.index];
    if (!field) return;
    if ('checked' in field) field.checked = saved.checked;
    if ('value' in field) field.value = saved.value;
    if (saved.selectedIndex >= 0 && 'selectedIndex' in field) field.selectedIndex = saved.selectedIndex;
  });
}

function focusFirstModalElement() {
  const focusable = getModalFocusableElements();
  const target = focusable[0] || document.querySelector('.modal');
  if (target?.focus) target.focus({ preventScroll: true });
}

function trapModalFocus(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = getModalFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openConfirmModal({
  title = 'Confirm action',
  record = '',
  message = '',
  risk = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger'
} = {}) {
  if (confirmModalResolver) resolveConfirmModal(false);
  const overlay = document.getElementById('modal');
  const activeElement = document.activeElement;
  if (activeElement && !overlay.contains(activeElement)) {
    lastModalTrigger = activeElement;
  }
  const modal = document.querySelector('.modal');
  confirmModalPreviousState = {
    open: overlay.classList.contains('open'),
    modalClass: modal?.className || 'modal',
    title: document.getElementById('modalTitle').innerHTML,
    body: document.getElementById('modalBody').innerHTML,
    fieldState: captureModalFieldState(overlay)
  };
  if (modal) modal.className = 'modal confirm-modal';
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = `
    <div class="erp-confirm-modal" data-confirm-action="${escapeAttr(title)}">
      ${record ? `<div class="confirm-record">${escapeHtml(record)}</div>` : ''}
      <div class="confirm-message">${escapeHtml(message)}</div>
      ${risk ? `<div class="confirm-risk">${escapeHtml(risk)}</div>` : ''}
      <div class="confirm-actions">
        <button class="btn btn-secondary" type="button" onclick="resolveConfirmModal(false)">${escapeHtml(cancelLabel)}</button>
        <button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-workflow'}" type="button" onclick="resolveConfirmModal(true)">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
  overlay.classList.add('open');
  setTimeout(focusFirstModalElement, 0);
  return new Promise(resolve => {
    confirmModalResolver = resolve;
  });
}

function resolveConfirmModal(result) {
  const resolver = confirmModalResolver;
  confirmModalResolver = null;
  const overlay = document.getElementById('modal');
  const modal = document.querySelector('.modal');
  if (confirmModalPreviousState?.open) {
    if (modal) modal.className = confirmModalPreviousState.modalClass;
    document.getElementById('modalTitle').innerHTML = confirmModalPreviousState.title;
    document.getElementById('modalBody').innerHTML = confirmModalPreviousState.body;
    restoreModalFieldState(overlay, confirmModalPreviousState.fieldState);
    overlay.classList.add('open');
    setTimeout(focusFirstModalElement, 0);
  } else {
    overlay.classList.remove('open');
    if (modal) modal.className = 'modal stitch-modal';
    if (lastModalTrigger?.focus) lastModalTrigger.focus({ preventScroll: true });
  }
  confirmModalPreviousState = null;
  if (resolver) resolver(Boolean(result));
}

