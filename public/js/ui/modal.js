/* =========================================================================
   MODAL
   ========================================================================= */
function openModal(title, html) {
  const activeElement = document.activeElement;
  if (activeElement && !document.getElementById('modal').contains(activeElement)) {
    lastModalTrigger = activeElement;
  }
  const modal = document.querySelector('.modal');
  if (modal) modal.className = 'modal stitch-modal';
  document.getElementById('modalTitle').innerHTML = title;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modal').classList.add('open');
  setTimeout(focusFirstModalElement, 0);
}
function closeModal() {
  if (confirmModalResolver) {
    resolveConfirmModal(false);
    return;
  }
  if (customerPortalDirty && !customerPortalSubmitting) {
    const discard = confirm('Discard this customer PO draft?');
    if (!discard) return;
  }
  customerPortalDirty = false;
  document.getElementById('modal').classList.remove('open');
  if (lastModalTrigger?.focus) lastModalTrigger.focus({ preventScroll: true });
}
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.getElementById('modal').addEventListener('keydown', trapModalFocus);

