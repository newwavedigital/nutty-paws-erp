/* =========================================================================
   DASHBOARD
   ========================================================================= */
function renderDashboard(el) {
  if (backendAuthState.token && !backendApiState.loadedPurchaseOrders && !backendApiState.loadingPurchaseOrders && !backendApiState.purchaseOrderLoadPromise) {
    ensureBackendPurchaseOrdersLoaded().catch(() => {});
  }
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendInventoryState.signals && !backendInventoryState.loading) {
    loadBackendInventorySignals()
      .then(() => { if (currentPage === 'dashboard') router('dashboard'); })
      .catch(() => {
        clearProtectedBackendRows('inventory');
        setBackendReadFailed(backendInventoryState);
        if (currentPage === 'dashboard') router('dashboard');
      });
  }
  const pos = state.purchaseOrders;
  const poLoading = purchaseOrdersLoadingForDisplay();
  const poUnavailable = purchaseOrdersUnavailableForDisplay();
  const poReady = purchaseOrdersReadyForEmptyState();
  const open = pos.filter(p => p.status !== 'completed');
  const inSC = pos.filter(p => p.status === 'pending' || p.status === 'in_supply_chain').length;
  const inProd = pos.filter(p => p.status === 'approved_for_production' || p.status === 'in_production').length;
  const inShipping = pos.filter(p => p.status === 'shipping').length;
  const backendSignals = backendInventoryState.signals || null;
  const protectedInventoryError = !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendInventoryState.status === 'error';
  const protectedInventoryUnavailable = !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendSignals && backendInventoryState.status !== 'connected';
  const inventoryRowsReady = !backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendInventoryState.status === 'connected';
  const lowStockRows = protectedInventoryUnavailable ? [] : inventoryLowStockRowsForDisplay();
  const lowStock = backendSignals ? backendSignals.lowStockCount : lowStockRows.length;
  const qaBlocked = pos.filter(p => p.status === 'qa_review' && !p.coa).length;
  const shipmentDocsMissing = pos.filter(p => p.status === 'shipping' && !p.shipping?.documents && !isInternalBrand(p)).length;

  // upcoming production this week
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const upcoming = pos
    .filter(p => p.productionDate)
    .filter(p => {
      const start = new Date(p.productionDate + 'T00:00:00');
      const end = new Date((p.productionEndDate || p.productionDate) + 'T00:00:00');
      // include if range overlaps the next 7 days
      return end >= today && start <= weekEnd;
    })
    .sort((a,b) => a.productionDate.localeCompare(b.productionDate));

  const conflicts = inventoryRowsReady ? inventoryConflicts() : [];
  const backendOverAllocationCount = backendSignals ? backendSignals.overAllocationCount : protectedInventoryUnavailable ? 0 : conflicts.length;
  const blockerRows = [
    { label: 'Supply Chain blockers', count: inSC, route: 'supply-chain', detail: 'POs awaiting ingredient/deposit readiness review.' },
    { label: 'Inventory conflicts', count: backendOverAllocationCount, route: 'inventory', detail: 'Over-allocation or Net Available issues that can block work.' },
    { label: 'QA waiting on COA', count: qaBlocked, route: 'quality-assurance', detail: 'Production-complete POs that need COA upload or QA release.' },
    { label: 'Shipment docs missing', count: shipmentDocsMissing, route: 'shipping', detail: 'External shipments cannot complete until required documents are attached.' }
  ].filter(row => row.count > 0);
  const poStat = value => poLoading ? '...' : poUnavailable ? '-' : String(value);
  const poDependentEmpty = poLoading
    ? renderEmptyState('Loading operational blockers', 'Purchase order records are still loading.')
    : poUnavailable
      ? renderEmptyState('Purchase order blockers unavailable', 'Purchase order records are unavailable right now.')
      : renderEmptyState('No active blockers', 'Supply Chain, QA, shipping documents, and inventory conflict signals are clear.');
  const recentPoRows = !poReady
    ? `<tr><td colspan="6" class="empty">${poLoading ? 'Loading purchase orders...' : 'Checking purchase order records...'}</td></tr>`
    : poUnavailable
      ? '<tr><td colspan="6" class="empty">Purchase orders are unavailable right now.</td></tr>'
      : pos.length === 0
        ? '<tr><td colspan="6" class="empty">No purchase orders found.</td></tr>'
        : pos.slice().sort((a,b)=>b.poDate.localeCompare(a.poDate)).slice(0,8).map(p => `
            <tr>
              <td><strong>${p.id}</strong></td>
              <td>${escapeHtml(getCustomer(p.customerId)?.name || '')}</td>
              <td>${fmtDate(p.poDate)}</td>
              <td>${p.lines.length}</td>
              <td>${fmtMoney(p.lines.reduce((s,l)=>s+l.qty*l.price,0))}</td>
              <td>${statusBadge(p.status)}</td>
            </tr>
          `).join('');
  const conflictBanner = conflicts.length === 0 ? '' : `
    <div style="background:#fcd7d3;border-left:5px solid var(--danger);border-radius:8px;padding:14px 18px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;color:var(--danger);font-size:15px">&#9888; ${conflicts.length} inventory conflict${conflicts.length===1?'':'s'} - POs cannot fully complete</div>
          <div style="font-size:12px;color:var(--brown);margin-top:6px">
            ${conflicts.map(c => `
              <div style="margin-bottom:6px">
                <strong>${escapeHtml(c.ingredient.name)}:</strong> ${c.onHand.toFixed(2)} on hand, ${c.allocated.toFixed(2)} allocated &mdash; <strong style="color:var(--danger)">short ${c.shortBy.toFixed(2)} ${escapeHtml(c.ingredient.unit||'')}</strong>
                <div style="margin-left:12px;font-size:11px;color:var(--brown-light)">Affected: ${c.affected.map(a => `${a.po.id} (${escapeHtml(a.cust?.name||'')}) needs ${a.need.toFixed(2)}`).join(' &middot; ')}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-sm" onclick="router('procurement')">Order More</button>
          <button class="btn btn-secondary btn-sm" onclick="router('inventory')">View Inventory</button>
        </div>
      </div>
    </div>`;
  el.innerHTML = `
    ${conflictBanner}
    <div class="ops-summary" style="margin-bottom:16px">
      <div class="stat brown"><div class="label">Open POs</div><div class="value">${poStat(open.length)}</div></div>
      <div class="stat"><div class="label">In Supply Chain Review</div><div class="value">${poStat(inSC)}</div></div>
      <div class="stat ok"><div class="label">In Production</div><div class="value">${poStat(inProd)}</div></div>
      <div class="stat"><div class="label">Ready to Ship</div><div class="value">${poStat(inShipping)}</div></div>
      <div class="stat ${backendOverAllocationCount ? 'warn' : (lowStock ? 'warn' : 'ok')}"><div class="label">Inventory Status</div><div class="value">${backendOverAllocationCount ? backendOverAllocationCount+' conflict'+(backendOverAllocationCount===1?'':'s') : (lowStock ? lowStock+' low' : 'OK')}</div></div>
    </div>

    ${renderOpsPanel({
      title: 'Operational Blockers',
      kicker: 'Needs attention',
      actions: "<button class=\"btn btn-secondary btn-sm\" onclick=\"router('inventory')\">View Inventory</button>",
      body: blockerRows.length === 0
        ? poDependentEmpty
        : `<div class="table-wrap"><table>
            <thead><tr><th>Area</th><th>Count</th><th>Why it matters</th><th></th></tr></thead>
            <tbody>${blockerRows.map(row => `<tr>
              <td><strong>${escapeHtml(row.label)}</strong></td>
              <td>${renderStatusBadge(String(row.count), row.label.includes('Inventory') ? 'danger' : 'warn')}</td>
              <td>${escapeHtml(row.detail)}</td>
              <td class="row-actions"><button class="btn btn-icon btn-sm" onclick="router('${row.route}')">Review</button></td>
            </tr>`).join('')}</tbody>
          </table></div>`
    })}

    <div class="card">
      <div class="card-header">
        <h2>Production This Week</h2>
        <button class="btn btn-secondary btn-sm" onclick="router('production')">View Calendar</button>
      </div>
      ${upcoming.length === 0
        ? '<div class="empty">No production scheduled in the next 7 days.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>PO #</th><th>Customer</th><th>Date</th><th>Room</th><th>Items</th></tr></thead>
            <tbody>
            ${upcoming.map(p => `
              <tr>
                <td><strong>${p.id}</strong></td>
                <td>${escapeHtml(getCustomer(p.customerId)?.name || '')}</td>
                <td>${fmtDate(p.productionDate)}${p.productionEndDate && p.productionEndDate !== p.productionDate ? ' &rarr; ' + fmtDate(p.productionEndDate) : ''}</td>
                <td><span class="room-dot" style="display:inline-block;background:${roomColor(p.productionRoom)};margin-right:6px"></span>${escapeHtml(p.productionRoom || '')}</td>
                <td>${p.lines.reduce((s,l)=>s+l.qty,0)} units</td>
              </tr>
            `).join('')}
            </tbody>
          </table></div>`
      }
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Low Stock Alerts</h2>
        <button class="btn btn-secondary btn-sm" onclick="router('inventory')">Manage Inventory</button>
      </div>
      ${lowStock === 0
        ? `<div class="empty">${protectedInventoryError || protectedInventoryUnavailable ? BACKEND_READ_FAILED_MESSAGE : 'All ingredients are above reorder levels.'}</div>`
        : lowStockRows.length === 0
          ? `<div class="empty">Backend inventory signals report ${lowStock} low stock item${lowStock===1?'':'s'}. Open Inventory after backend records load to view item details.</div>`
        : `<div class="table-wrap"><table>
            <thead><tr><th>Item</th><th>On Hand</th><th>Allocated</th><th>Net Available</th><th>Reorder At</th><th>Reason</th></tr></thead>
            <tbody>
            ${lowStockRows.map(i => {
              const localItem = state.ingredients.find(row => row.id === i.id || row._backendId === i.id) || {};
              const name = i.name || i.masterItemName || localItem.name || i.masterItemId || i.id;
              const unit = i.unit || i.unitOfMeasure || localItem.unit || '';
              const onHand = inventoryOnHandQuantity(i);
              const allocated = inventoryAllocatedQuantity(i);
              const netAvailable = inventoryNetAvailableQuantity(i);
              const reorder = inventoryReorderPointQuantity(i);
              const reason = netAvailable < 0
                ? 'Over-allocated'
                : onHand > reorder
                  ? 'Net below reorder'
                  : 'Low';
              return `
              <tr>
                <td>${escapeHtml(name)} <span class="badge badge-low">${escapeHtml(reason)}</span></td>
                <td>${onHand} ${escapeHtml(unit)}</td>
                <td>${allocated || '-'}${allocated ? ' ' + escapeHtml(unit) : ''}</td>
                <td><strong>${netAvailable} ${escapeHtml(unit)}</strong></td>
                <td>${reorder} ${escapeHtml(unit)}</td>
                <td>${escapeHtml(reason)}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>`
      }
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Recent Purchase Orders</h2>
        <button class="btn btn-sm" onclick="router('purchase-orders')">+ New PO</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>PO #</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${recentPoRows}
        </tbody>
      </table></div>
      </div>
    </div>
  `;
}

function renderAssignments(el) {
  el.innerHTML = renderOpsPanel({
    title: 'Assignments',
    kicker: 'Future Scope',
    body: renderEmptyState(
      'Assignments are future scope.',
      'This placeholder keeps the requested navigation structure visible without adding the full task assignment workflow yet.'
    )
  });
}

