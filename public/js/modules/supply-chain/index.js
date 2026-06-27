/* =========================================================================
   SUPPLY CHAIN
   ========================================================================= */
function lineStatus(po, ingId, need, stock) {
  const override = (po.scOverrides || {})[ingId];
  if (override === 'on_hold') return 'on_hold';
  if (stock < need) return 'short';
  return 'ok';
}
function setLineStatus(poId, ingId, status) {
  const po = state.purchaseOrders.find(p => p.id === poId);
  if (!po) return;
  po.scOverrides = po.scOverrides || {};
  // can only manually set to 'on_hold' or 'ok'; 'short' is automatic
  if (status === 'ok') {
    delete po.scOverrides[ingId];
  } else {
    po.scOverrides[ingId] = status;
  }
  saveState();
  renderSupplyChain(document.getElementById('content'));
}
async function setDepositStatus(poId, status) {
  const po = state.purchaseOrders.find(p => p.id === poId);
  if (!po) return;
  if (!requireBackendWriteSession(backendApiState)) return;
  if (!po._backendId) return failBackendRequiredWrite(null, backendApiState, 'This purchase order is not backend-backed. Nothing was saved locally.');
  try {
    await updateBackendDepositStatus(po, status);
    toast(`Deposit status synced to backend.`);
    renderSupplyChain(document.getElementById('content'));
    return;
  } catch (error) {
    markBackendUnavailable(error);
    failBackendRequiredWrite(error, backendApiState);
    return;
  }
}

function renderSupplyChain(el) {
  ensureBackendPurchaseOrdersLoaded();
  const queue = state.purchaseOrders.filter(p => p.status === 'pending' || p.status === 'in_supply_chain' || p.status === 'submitted' || p.status === 'supply_chain_review');
  el.innerHTML = `
    <div class="card">
      ${renderBackendStatusBanner('supply-chain')}
      <div class="card-header">
        <h2>POs Awaiting Review</h2>
        <span style="font-size:13px;color:var(--brown-light)">${queue.length} order(s)</span>
      </div>
      ${queue.length === 0 ? '<div class="empty">No purchase orders awaiting review. New POs will appear here automatically.</div>' :
        queue.map(po => {
          const cust = getCustomer(po.customerId);
          const req = poRequirements(po, false, true); // needed amount includes 5% waste buffer
          const ingIds = Object.keys(req);
          const otherAlloc = allocatedInventory(po.id); // what other POs have already reserved
          const statuses = ingIds.map(id => {
            const ing = getIngredient(id);
            const net = (ing?.stock || 0) - (otherAlloc[id] || 0);
            return lineStatus(po, id, req[id], net);
          });
          const depositOk = po.depositStatus === 'ok';
          const allIngOk = statuses.length > 0 && statuses.every(s => s === 'ok');
          const allOk = allIngOk && depositOk;
          const anyShort = statuses.some(s => s === 'short');
          const anyHold = statuses.some(s => s === 'on_hold');
          let banner = '';
          if (allOk) banner = '<div class="inv-check ok"><strong>&#10003; All items and deposit confirmed OK.</strong> Ready to approve for production.</div>';
          else if (!depositOk && allIngOk) banner = '<div class="inv-check"><strong>Deposit on hold.</strong> Confirm the customer deposit before approving.</div>';
          else if (anyShort && anyHold) banner = '<div class="inv-check bad"><strong>&#9888; Items short and on hold.</strong> Cannot approve until everything (including deposit) shows OK.</div>';
          else if (anyShort) banner = '<div class="inv-check bad"><strong>&#9888; Inventory shortage detected.</strong> Cannot approve until all items show OK.</div>';
          else if (anyHold) banner = '<div class="inv-check"><strong>Items on hold.</strong> Cannot approve until everything (including deposit) shows OK.</div>';
          else if (!depositOk) banner = '<div class="inv-check"><strong>Deposit on hold.</strong> Confirm the customer deposit before approving.</div>';
          return `
            <div class="sc-card">
              <div class="sc-header">
                <div>
                  <h3 style="margin:0">${po.id} - ${escapeHtml(cust?.name||'')}</h3>
                  <div style="font-size:12px;color:var(--brown-light);margin-top:2px">${po.brand ? '<span class="pill">'+escapeHtml(po.brand)+'</span> ' : ''}PO Date ${fmtDate(po.poDate)} &middot; Needed by ${fmtDate(po.requestedDate)}</div>
                </div>
                <div>${statusBadge(po.status)}</div>
              </div>
              <div class="sc-section">
                <div class="table-wrap"><table class="sc-table">
                  <thead><tr><th>Product</th><th>Qty</th><th>Production Room</th></tr></thead>
                  <tbody>
                    ${po.lines.map(l => {
                      const p = getProduct(l.productId);
                      return `<tr>
                        <td>${escapeHtml(p?.name||'')} <span class="pill">${escapeHtml(p?.sku||'')}</span></td>
                        <td>${l.qty}</td>
                        <td><span class="room-dot" style="display:inline-block;background:${roomColor(p?.room)}"></span> ${escapeHtml(p?.room||'-')}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table></div>
              </div>
              <div class="sc-section">
                <div class="table-wrap"><table class="sc-table">
                  <thead><tr><th>Item</th><th>Needed</th><th>On Hand</th><th>Allocated to Other POs</th><th>Net Available</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                  <tr class="sc-status-${depositOk?'ok':'on_hold'}" style="background:${depositOk?'var(--white)':'#fffbe8'}">
                    <td><strong>Customer Deposit</strong> <span style="font-size:11px;color:var(--brown-light)">(financial)</span></td>
                    <td colspan="4" style="font-size:12px;color:var(--brown-light)">${depositOk ? 'Deposit confirmed received.' : 'Confirm the customer deposit was received before approving production.'}</td>
                    <td>${depositOk ? '<span class="badge badge-prod">OK</span>' : '<span class="badge badge-pending">On Hold</span>'}</td>
                    <td>
                      ${depositOk
                        ? `<button class="btn btn-icon btn-sm" onclick="setDepositStatus('${po.id}','on_hold')">Hold</button>`
                        : `<button class="btn btn-icon btn-sm" onclick="setDepositStatus('${po.id}','ok')">Set OK</button>`
                      }
                    </td>
                  </tr>
                  ${ingIds.map(ingId => {
                    const ing = getIngredient(ingId);
                    const need = req[ingId];
                    const stock = ing?.stock || 0;
                    const otherAllocAmt = otherAlloc[ingId] || 0;
                    const net = stock - otherAllocAmt;
                    const st = lineStatus(po, ingId, need, net);
                    const isShort = net < need;
                    let badge;
                    if (st === 'ok') badge = '<span class="badge badge-prod">OK</span>';
                    else if (st === 'on_hold') badge = '<span class="badge badge-pending">On Hold</span>';
                    else badge = '<span class="badge badge-low">Short '+(need-net).toFixed(2)+'</span>';
                    let action;
                    if (st === 'on_hold') {
                      action = isShort
                        ? `<button class="btn btn-icon btn-sm" disabled title="Net available is short - receive inventory or revoke another PO first">Set OK</button>`
                        : `<button class="btn btn-icon btn-sm" onclick="setLineStatus('${po.id}','${ingId}','ok')">Set OK</button>`;
                    } else if (st === 'ok') {
                      action = `<button class="btn btn-icon btn-sm" onclick="setLineStatus('${po.id}','${ingId}','on_hold')">Hold</button>`;
                    } else {
                      action = `<button class="btn btn-icon btn-sm" onclick="setLineStatus('${po.id}','${ingId}','on_hold')">Hold</button>`;
                    }
                    return `<tr class="sc-status-${st}">
                      <td>${escapeHtml(ing?.name||'(missing)')}</td>
                      <td>${need.toFixed(2)} ${escapeHtml(ing?.unit||'')}</td>
                      <td>${stock} ${escapeHtml(ing?.unit||'')}</td>
                      <td>${otherAllocAmt > 0 ? '<span style="color:var(--brown)">'+otherAllocAmt.toFixed(2)+' '+escapeHtml(ing?.unit||'')+'</span>' : '<span style="color:var(--brown-light)">-</span>'}</td>
                      <td><strong style="color:${net < need ? 'var(--danger)' : 'var(--success)'}">${net.toFixed(2)} ${escapeHtml(ing?.unit||'')}</strong></td>
                      <td>${badge}</td>
                      <td>${action}</td>
                    </tr>`;
                  }).join('')}
                  </tbody>
                </table></div>
              </div>
              ${banner}
              <div class="form-actions">
                <button class="btn btn-icon" onclick="viewPO('${po.id}')">View Detail</button>
                <button class="btn btn-icon" onclick="printPickList('${po.id}')">&#128462; Print Pick List</button>
                <button class="btn" ${allOk ? '' : 'disabled title="All items must be OK before approving"'} onclick="approveForProduction('${po.id}')">Approve &rarr; Production</button>
              </div>
            </div>
          `;
        }).join('')
      }
    </div>
  `;
}
async function approveForProduction(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  if (po.depositStatus !== 'ok') { toast('Cannot approve ? Customer Deposit must be set to OK.'); return; }
  // re-validate against Net Available: all ingredients must be OK after subtracting other PO allocations
  const req = poRequirements(po, false, true); // include 5% waste buffer
  const ingIds = Object.keys(req);
  const otherAlloc = allocatedInventory(po.id);
  const allOk = ingIds.length > 0 && ingIds.every(ingId => {
    const ing = getIngredient(ingId);
    const net = (ing?.stock || 0) - (otherAlloc[ingId] || 0);
    return lineStatus(po, ingId, req[ingId], net) === 'ok';
  });
  if (!allOk) { toast('Cannot approve ? every item must be set to OK.'); return; }
  if (po._backendId && backendApiState.status !== 'local') {
    try {
      await reviewBackendSupplyChainLines(po, 'available');
      await approveBackendPurchaseOrder(po);
      toast(`${id} approved through backend. Schedule it on the Production calendar.`);
      router('production');
      return;
    } catch (error) {
      markBackendUnavailable(error);
      toast(error?.message || 'Backend approval failed ? local PO was not approved.');
      renderSupplyChain(document.getElementById('content'));
      return;
    }
  }
  po.status = 'approved_for_production';
  saveState();
  toast(`${id} approved. Schedule it on the Production calendar.`);
  router('production');
}

// Print a warehouse-friendly pick list for a PO - grouped by Building -> Location with checkboxes
function printPickList(id) {
  const po = state.purchaseOrders.find(p => p.id === id);
  if (!po) return;
  const cust = getCustomer(po.customerId);
  const req = poRequirements(po, false, true); // pick 5% extra to cover waste
  const ingIds = Object.keys(req);
  if (ingIds.length === 0) { toast('No ingredients on this PO to pick.'); return; }
  // Build rows: { building, location, name, need, unit, onHand, ingredient }
  const rows = ingIds.map(ingId => {
    const ing = getIngredient(ingId);
    return {
      ingredient: ing,
      building: ing?.building || '(Unassigned Building)',
      location: ing?.location || '(No Location)',
      name: ing?.name || '(missing)',
      need: req[ingId],
      unit: ing?.unit || '',
      onHand: ing?.stock || 0
    };
  });
  // Sort by Building -> Location -> name for pick path efficiency
  rows.sort((a, b) => {
    if (a.building !== b.building) return a.building.localeCompare(b.building);
    if (a.location !== b.location) return a.location.localeCompare(b.location);
    return a.name.localeCompare(b.name);
  });
  // Group by building for rendering
  const byBuilding = {};
  rows.forEach(r => { (byBuilding[r.building] = byBuilding[r.building] || []).push(r); });

  // Line items table (products on the PO) - for picker reference
  const productLines = po.lines.map(l => {
    const p = getProduct(l.productId);
    return { sku: p?.sku || '', name: p?.name || '', qty: l.qty, room: p?.room || '-' };
  });

  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups to print.'); return; }
  w.document.write(`
    <html><head><title>Pick List - ${escapeHtml(po.id)}</title>
    <style>
      body{font-family:Helvetica,Arial,sans-serif;padding:30px;color:#1A1A1A;font-size:13px}
      h1{color:#5C3A21;margin:0 0 4px;font-size:22px}
      h2{color:#5C3A21;margin:18px 0 6px;font-size:16px;border-bottom:2px solid #5C3A21;padding-bottom:4px}
      h3{color:#8B5E3C;margin:14px 0 4px;font-size:14px}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #E07B2A;padding-bottom:10px;margin-bottom:14px}
      .label{font-size:10px;color:#8B5E3C;text-transform:uppercase;font-weight:700;letter-spacing:0.5px}
      table{width:100%;border-collapse:collapse;margin-top:4px;font-size:12px}
      th{background:#F5E9D3;text-align:left;padding:6px 8px;border-bottom:1px solid #5C3A21;font-size:11px;text-transform:uppercase}
      td{padding:8px;border-bottom:1px solid #E9E2D2}
      .pick-row td{font-size:13px}
      .pick-check{width:22px;height:22px;border:2px solid #5C3A21;display:inline-block;border-radius:3px}
      .building-block{margin-bottom:18px;page-break-inside:avoid}
      .building-pill{background:#5C3A21;color:#fff;padding:4px 12px;border-radius:14px;font-size:13px;font-weight:600;display:inline-block;margin-bottom:6px}
      .needed{font-weight:700;color:#5C3A21;font-size:14px}
      .signature{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:12px}
      .sig-line{border-bottom:1px solid #1A1A1A;height:24px;margin-bottom:2px}
      @media print { body { padding: 18px; } .no-print { display:none } }
    </style></head><body>
    <div class="head">
      <div>
        <h1>Warehouse Pick List</h1>
        <div style="color:#8B5E3C;font-size:14px">${escapeHtml(po.id)}${po.brand ? ' &middot; '+escapeHtml(po.brand) : ''} &middot; ${escapeHtml(cust?.name||'')}</div>
      </div>
      <div style="text-align:right">
        <div class="label">PO Date</div>
        <div>${fmtDate(po.poDate)}</div>
        <div class="label" style="margin-top:6px">Needed By</div>
        <div>${fmtDate(po.requestedDate)}</div>
        <div class="label" style="margin-top:6px">Printed</div>
        <div>${new Date().toLocaleString()}</div>
      </div>
    </div>

    <h2>Products to Produce</h2>
    <table>
      <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Production Room</th></tr></thead>
      <tbody>
        ${productLines.map(l => `<tr><td><strong>${escapeHtml(l.sku)}</strong></td><td>${escapeHtml(l.name)}</td><td>${l.qty}</td><td>${escapeHtml(l.room)}</td></tr>`).join('')}
      </tbody>
    </table>

    <h2>Pick List <span style="font-size:12px;color:#8B5E3C;font-weight:400">(sorted by Building &rarr; Location)</span></h2>
    ${Object.keys(byBuilding).map(building => `
      <div class="building-block">
        <div class="building-pill">&#127970; ${escapeHtml(building)}</div>
        <table>
          <thead><tr>
            <th style="width:30px"></th>
            <th style="width:90px">Location</th>
            <th>Item</th>
            <th style="width:120px">Needed</th>
            <th style="width:100px">On Hand</th>
            <th style="width:90px">Picked Qty</th>
            <th>Picker Initials</th>
          </tr></thead>
          <tbody>
            ${byBuilding[building].map(r => {
              const short = r.onHand < r.need;
              return `<tr class="pick-row">
                <td><span class="pick-check"></span></td>
                <td><strong>${escapeHtml(r.location)}</strong></td>
                <td>${escapeHtml(r.name)}</td>
                <td><span class="needed">${r.need.toFixed(2)} ${escapeHtml(r.unit)}</span></td>
                <td style="${short?'color:#B23A3A;font-weight:700':''}">${r.onHand} ${escapeHtml(r.unit)}${short?' &#9888;':''}</td>
                <td>_____________</td>
                <td>_____________</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div class="signature">
      <div>
        <div class="label">Picker Name</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="label">Date / Time Completed</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="label">Picker Signature</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="label">Verified By</div>
        <div class="sig-line"></div>
      </div>
    </div>

    ${po.notes ? `<p style="margin-top:18px;font-size:12px"><strong>PO Notes:</strong> ${escapeHtml(po.notes)}</p>` : ''}
    <script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script>
    </body></html>
  `);
  w.document.close();
}

