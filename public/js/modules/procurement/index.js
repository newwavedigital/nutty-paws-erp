/* =========================================================================
   PROCUREMENT (Need To Order / In Order)
   ========================================================================= */
let procTab = 'need';
function setProcTab(t) { procTab = t; renderProcurement(document.getElementById('content')); }

function nextProcId() {
  const nums = (state.procurementOrders||[])
    .map(p => parseInt((p.id.match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  return 'PROC-' + ((nums.length ? Math.max(...nums) : 0) + 1);
}

function renderProcurement(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendProcurementState.loaded && !backendProcurementState.loading) {
    loadBackendProcurement().then(() => { if (currentPage === 'procurement') router('procurement'); });
  }
  const needCount = procurementNeedItems().length;
  const ordered = (state.procurementOrders||[]).filter(p => p.status !== 'Received').length;
  const completed = (state.procurementOrders||[]).filter(p => p.status === 'Received').length;
  el.innerHTML = `
    <div class="card">
      ${renderBackendProcurementBanner()}
      <div class="tabs">
        <button class="tab ${procTab==='need'?'active':''}" onclick="setProcTab('need')">Need To Order <span class="tab-count">${needCount}</span></button>
        <button class="tab ${procTab==='in'?'active':''}" onclick="setProcTab('in')">Ordered <span class="tab-count">${ordered}</span></button>
        <button class="tab ${procTab==='completed'?'active':''}" onclick="setProcTab('completed')">Completed <span class="tab-count">${completed}</span></button>
      </div>
      <div id="procBody" style="margin-top:14px"></div>
    </div>
  `;
  if (procTab === 'need') renderProcNeed(document.getElementById('procBody'));
  else if (procTab === 'completed') renderProcCompleted(document.getElementById('procBody'));
  else renderProcInOrder(document.getElementById('procBody'));
}

function procurementNeedItems() {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendProcurementState.status === 'error') {
    return [];
  }
  if (backendProcurementState.needRows && backendProcurementState.needRows.length) {
    return backendProcurementState.needRows.map(row => backendNeedRowToLocalIngredient(row, state.ingredients.find(i => i._backendId === row.inventoryItemId || i.id === row.inventoryItemId)));
  }
  const alloc = allocatedInventory();
  const scDemand = supplyChainDemand();
  return state.ingredients.filter(i => {
    const net = (i.stock || 0) - (alloc[i.id] || 0);
    const scNeed = scDemand[i.id] || 0;
    return i.stock <= i.reorderLevel || net <= i.reorderLevel || (scNeed > 0 && net < scNeed);
  });
}

// IDs of inventory items that are already on an active (non-Received) procurement PO
function activelyOrderedIngredientIds() {
  const ids = new Set();
  (state.procurementOrders || []).forEach(p => {
    if (p.status !== 'Received') {
      (p.items || []).forEach(it => ids.add(it.ingredientId));
    }
  });
  return ids;
}
// Map: ingredientId -> [{po, qty}] showing what active procurement POs cover this item
function activeOrdersByIngredient() {
  const map = {};
  (state.procurementOrders || []).forEach(p => {
    if (p.status === 'Received') return;
    (p.items || []).forEach(it => {
      (map[it.ingredientId] = map[it.ingredientId] || []).push({ po: p, qty: it.qty });
    });
  });
  return map;
}

function renderProcNeed(el) {
  const onOrder = activelyOrderedIngredientIds();
  const ordersByIng = activeOrdersByIngredient();
  const alloc = allocatedInventory();
  const scDemand = supplyChainDemand();
  const allLow = procurementNeedItems();
  const low = allLow.filter(i => !onOrder.has(i.id));
  const alreadyOrdered = allLow.filter(i => onOrder.has(i.id));
  const bySupplier = {};
  low.forEach(i => {
    const sid = i.supplierId || '_none';
    (bySupplier[sid] = bySupplier[sid] || []).push(i);
  });
  el.innerHTML = `
    <div class="card-header">
      <h2>Items That Need To Be Ordered</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('need_to_order.csv', state.ingredients.filter(i=>i.stock<=i.reorderLevel).map(i=>({item:i.name,supplier:getSupplier(i.supplierId)?.name||'',on_hand:i.stock,reorder_at:i.reorderLevel,lead_time_days:i.leadTimeDays||0,suggested_qty:Math.max(i.reorderLevel*2-i.stock, i.reorderLevel),unit:i.unit,unit_cost:i.cost})))">Export CSV</button>
        <button class="btn" onclick="procFormHtml()">+ Order</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:10px">
      Items at or below reorder level - <strong>plus</strong> any ingredient or packaging a PO awaiting Supply Chain approval is short on (so production isn't held up). Click <strong>+ Order</strong> on any vendor block to draft a supplier PO; items move to the Ordered tab and disappear from this list.
    </div>
    ${low.length === 0
      ? (allLow.length === 0
          ? '<div class="empty">All inventory levels are healthy. Nothing needs to be ordered.</div>'
          : '<div class="empty">All low-stock items are currently on order. See the "Already On Order" section below.</div>')
      : Object.keys(bySupplier).map(sid => {
          const sup = getSupplier(sid);
          const items = bySupplier[sid];
          const supLabel = sup ? escapeHtml(sup.name) : '<em>No vendor assigned</em>';
          return `
            <div class="card" style="background:var(--beige-light);margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div>
                  <h3 style="margin:0">${supLabel}</h3>
                  <div style="font-size:12px;color:var(--brown-light)">${sup?.contact ? escapeHtml(sup.contact)+' &middot; ' : ''}${sup?.email ? escapeHtml(sup.email) : ''}</div>
                </div>
                ${sid !== '_none' ? `
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="quickMoveToOrdered('${sid}')">Quick Move &rarr; Ordered</button>
                    <button class="btn" onclick="createProcFromNeed('${sid}')">+ Order</button>
                  </div>
                ` : ''}
              </div>
              <div class="table-wrap" style="margin-top:10px"><table>
                <thead><tr><th>Item</th><th>On Hand</th><th>Reorder At</th><th>Lead Time</th><th>Suggested Qty</th><th>Unit</th><th>Why Flagged</th></tr></thead>
                <tbody>
                  ${items.map(i => {
                    const net = (i.stock || 0) - (alloc[i.id] || 0);
                    const scNeed = scDemand[i.id] || 0;
                    const scShort = Math.max(0, scNeed - net);
                    const suggested = Math.max(i.reorderLevel * 2 - i.stock, i.reorderLevel, scShort + (i.reorderLevel||0));
                    const scPOs = scShort > 0 ? scPOsNeedingIngredient(i.id) : [];
                    let why;
                    if (scShort > 0) {
                      why = `<span class="badge badge-low">&#9888; Short ${scShort.toFixed(0)} for review</span><div style="font-size:11px;color:var(--brown-light);margin-top:2px">Needed by ${scPOs.map(p=>escapeHtml(p.id)).join(', ')} in Supply Chain</div>`;
                    } else if ((i.stock||0) <= i.reorderLevel) {
                      why = '<span class="badge badge-low">Below reorder</span>';
                    } else {
                      why = '<span class="badge badge-low">Net below reorder</span>';
                    }
                    return `<tr>
                      <td><strong>${escapeHtml(i.name)}</strong></td>
                      <td>${i.stock}</td>
                      <td>${i.reorderLevel}</td>
                      <td>${i.leadTimeDays ? i.leadTimeDays + ' days' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>
                      <td><strong>${suggested}</strong></td>
                      <td>${escapeHtml(i.unit)}</td>
                      <td>${why}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>
            </div>
          `;
        }).join('')
    }

    ${alreadyOrdered.length > 0 ? `
      <div style="margin-top:18px">
        <div class="card-header">
          <h3 style="margin:0;color:var(--brown)">Already On Order <span style="font-size:13px;color:var(--brown-light);font-weight:400">(${alreadyOrdered.length} item${alreadyOrdered.length===1?'':'s'})</span></h3>
          <button class="btn btn-secondary btn-sm" onclick="setProcTab('in')">View Ordered Tab</button>
        </div>
        <div class="help-text" style="margin-bottom:8px">These items are below reorder level <strong>but already covered</strong> by an active supplier PO. They're not duplicated above to prevent over-ordering. Click an order ID to jump to it.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>On Hand</th><th>Reorder At</th><th>Supplier</th><th>On Order</th><th>Procurement PO</th></tr></thead>
          <tbody>
            ${alreadyOrdered.map(i => {
              const orders = ordersByIng[i.id] || [];
              const totalOnOrder = orders.reduce((s, o) => s + (o.qty || 0), 0);
              return `<tr>
                <td><strong>${escapeHtml(i.name)}</strong> <span class="badge badge-low">Low</span></td>
                <td>${i.stock}</td>
                <td>${i.reorderLevel}</td>
                <td>${escapeHtml(getSupplier(i.supplierId)?.name || '-')}</td>
                <td>${totalOnOrder} ${escapeHtml(i.unit||'')}</td>
                <td>${orders.map(o => `<span class="pill" style="cursor:pointer" onclick="setProcTab('in')" title="Click to view in Ordered tab">${escapeHtml(o.po.id)}${o.po.qbPoNumber ? ' / '+escapeHtml(o.po.qbPoNumber) : ''}</span>`).join(' ')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    ` : ''}
  `;
}

// Items that need ordering for a supplier - matches the Need To Order display logic
// (low stock OR net below reorder OR short for a PO awaiting Supply Chain approval), excluding already-ordered.
function needToOrderItemsForSupplier(supplierId) {
  if (backendProcurementState.needRows && backendProcurementState.needRows.length) {
    return backendProcurementState.needRows
      .filter(row => (row.supplierId || '') === supplierId)
      .map(row => ({
        ingredientId: row.inventoryItemId,
        masterItemId: row.masterItemId,
        qty: row.suggestedQuantity,
        unitCost: typeof row.unitCostCents === 'number' ? row.unitCostCents / 100 : 0,
        _needRow: row
      }));
  }
  const alloc = allocatedInventory();
  const scDemand = supplyChainDemand();
  const onOrder = activelyOrderedIngredientIds();
  return state.ingredients
    .filter(i => i.supplierId === supplierId && !onOrder.has(i.id))
    .filter(i => {
      const net = (i.stock || 0) - (alloc[i.id] || 0);
      const scNeed = scDemand[i.id] || 0;
      return i.stock <= i.reorderLevel || net <= i.reorderLevel || (scNeed > 0 && net < scNeed);
    })
    .map(i => {
      const net = (i.stock || 0) - (alloc[i.id] || 0);
      const scShort = Math.max(0, (scDemand[i.id] || 0) - net);
      const qty = Math.max(i.reorderLevel * 2 - i.stock, i.reorderLevel, scShort + (i.reorderLevel||0));
      return { ingredientId: i.id, masterItemId: i.masterItemId, qty, unitCost: i.cost };
    });
}
function createProcFromNeed(supplierId) {
  procFormHtml(null, { supplierId, items: needToOrderItemsForSupplier(supplierId) });
}

// One-click: create a draft procurement PO with all flagged items for this supplier and jump to Ordered tab.
async function quickMoveToOrdered(supplierId) {
  const sup = getSupplier(supplierId);
  const items = needToOrderItemsForSupplier(supplierId);
  if (!items.length) { toast('Nothing to move.'); return; }
  const ok = await openConfirmModal({
    title: 'Draft supplier PO',
    record: sup?.name || 'No vendor assigned',
    message: `Move ${items.length} item${items.length===1?'':'s'} into a new Ordered PO?`,
    risk: 'You can edit the QuickBooks PO# afterward.',
    confirmLabel: 'Create Ordered PO',
    tone: 'workflow'
  });
  if (!ok) return;
  const newOrder = {
    id: nextProcId(),
    qbPoNumber: '',
    supplierId,
    dateOrdered: new Date().toISOString().slice(0,10),
    expectedDate: '',
    status: 'In Order',
    notes: 'Quick move from Need To Order',
    items
  };
  if (!requireEmployeeBackendWrite(backendProcurementState)) return;
  try {
    const saved = await saveBackendProcurementOrder(newOrder.id, true, newOrder);
    backendProcurementState.status = 'connected';
    backendProcurementState.loaded = false;
    backendProcurementState.lastError = '';
    mergeBackendProcurementOrders([saved]);
  } catch (error) {
    failBackendRequiredWrite(error, backendProcurementState);
    return;
  }
  procTab = 'in';
  router('procurement');
  toast(`${newOrder.id} created in backend. Add the QuickBooks PO# in the Ordered tab.`);
}

function renderProcInOrder(el) {
  const orders = (state.procurementOrders||[])
    .filter(p => p.status !== 'Received')
    .slice()
    .sort((a,b)=>(b.dateOrdered||'').localeCompare(a.dateOrdered||''));
  el.innerHTML = `
    <div class="card-header">
      <h2>Ordered - Awaiting Arrival</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('ordered_pos.csv', state.procurementOrders.filter(p=>p.status!=='Received').map(p=>({id:p.id,qb_po:p.qbPoNumber,supplier:getSupplier(p.supplierId)?.name||'',date_ordered:p.dateOrdered,expected:p.expectedDate,status:p.status,total:p.items.reduce((s,it)=>s+it.qty*it.unitCost,0).toFixed(2)})))">Export CSV</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Supplier POs you've placed. Each references the matching PO # in QuickBooks. Click "Mark Arrived" once items are received - they'll move to Completed and inventory will update automatically.</div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Internal ID</th><th>QuickBooks PO #</th><th>Supplier</th><th>Items</th><th>Total</th>
        <th>Date Ordered</th><th>Expected</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${orders.length === 0 ? `<tr><td colspan="9" class="empty">No supplier POs ordered yet. Use the Need To Order tab to create one.</td></tr>` :
          orders.map(p => {
            const total = p.items.reduce((s,it)=>s+it.qty*it.unitCost, 0);
            return `<tr>
              <td><strong>${escapeHtml(p.id)}</strong></td>
              <td><span class="pill">${escapeHtml(p.qbPoNumber || '-')}</span></td>
              <td>${escapeHtml(getSupplier(p.supplierId)?.name||'-')}</td>
              <td>${p.items.length}</td>
              <td>${fmtMoney(total)}</td>
              <td>${fmtDate(p.dateOrdered)}</td>
              <td>${fmtDate(p.expectedDate)}</td>
              <td><span class="badge ${p.status==='In Order'?'badge-supply':'badge-pending'}">${escapeHtml(p.status||'')}</span></td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="procFormHtml('${p.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" onclick="receiveProc('${p.id}')">Mark Arrived</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteProc('${p.id}')">Delete</button>
              </td>
            </tr>`;
          }).join('')
        }
      </tbody>
    </table></div>
  `;
}

function renderProcCompleted(el) {
  const orders = (state.procurementOrders||[])
    .filter(p => p.status === 'Received')
    .slice()
    .sort((a,b)=>(b.dateOrdered||'').localeCompare(a.dateOrdered||''));
  el.innerHTML = `
    <div class="card-header">
      <h2>Completed Supplier POs</h2>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="exportCsv('completed_pos.csv', state.procurementOrders.filter(p=>p.status==='Received').map(p=>({id:p.id,qb_po:p.qbPoNumber,supplier:getSupplier(p.supplierId)?.name||'',date_ordered:p.dateOrdered,received_on:p.receivedDate||'',total:p.items.reduce((s,it)=>s+it.qty*it.unitCost,0).toFixed(2)})))">Export CSV</button>
      </div>
    </div>
    <div class="help-text" style="margin-bottom:8px">Supplier POs that have been received. Items have been added to active inventory.</div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Internal ID</th><th>QuickBooks PO #</th><th>Supplier</th><th>Items</th><th>Total</th>
        <th>Date Ordered</th><th>Received On</th><th></th>
      </tr></thead>
      <tbody>
        ${orders.length === 0 ? `<tr><td colspan="8" class="empty">No completed POs yet.</td></tr>` :
          orders.map(p => {
            const total = p.items.reduce((s,it)=>s+it.qty*it.unitCost, 0);
            return `<tr>
              <td><strong>${escapeHtml(p.id)}</strong></td>
              <td><span class="pill">${escapeHtml(p.qbPoNumber || '-')}</span></td>
              <td>${escapeHtml(getSupplier(p.supplierId)?.name||'-')}</td>
              <td>${p.items.length}</td>
              <td>${fmtMoney(total)}</td>
              <td>${fmtDate(p.dateOrdered)}</td>
              <td>${fmtDate(p.receivedDate)}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="procFormHtml('${p.id}')">View</button>
                <span class="pill" title="Received procurement POs are locked from cancellation">Locked</span>
              </td>
            </tr>`;
          }).join('')
        }
      </tbody>
    </table></div>
  `;
}

function procFormHtml(id, prefill) {
  const isNew = !id;
  const p = id
    ? state.procurementOrders.find(x=>x.id===id)
    : { id: nextProcId(), qbPoNumber: '', supplierId: prefill?.supplierId || '', dateOrdered: new Date().toISOString().slice(0,10), expectedDate: '', status: 'In Order', notes: '', items: prefill?.items || [] };
  openModal((isNew?'New':'Edit')+' Procurement PO', `
    <form onsubmit="event.preventDefault();saveProc('${p.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Internal ID</label><input id="prc_id" value="${escapeHtml(p.id)}" readonly /></div>
        <div class="form-row"><label>QuickBooks PO #</label>
          <input id="prc_qb" value="${escapeHtml(p.qbPoNumber||'')}" placeholder="Optional, e.g. QB-5544" />
        </div>
        <div class="form-row"><label>Supplier *</label>
          <select id="prc_sup" required onchange="prcSupplierChange()">
            <option value="">- Select -</option>
            ${state.suppliers.map(s=>`<option value="${s.id}" ${p.supplierId===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Date Ordered</label><input type="date" id="prc_date" value="${p.dateOrdered||''}" /></div>
        <div class="form-row"><label>Expected Delivery</label><input type="date" id="prc_exp" value="${p.expectedDate||''}" /></div>
        <div class="form-row"><label>Status</label>
          <select id="prc_status">
            <option ${p.status==='Draft'?'selected':''}>Draft</option>
            <option ${p.status==='In Order'?'selected':''}>In Order</option>
            <option ${p.status==='Partial Receipt'?'selected':''}>Partial Receipt</option>
            <option ${p.status==='Received'?'selected':''}>Received</option>
          </select>
        </div>
      </div>
      <div style="margin-top:18px">
        <label style="font-weight:600;color:var(--brown);font-size:13px">Items</label>
        <div class="po-line" style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
          <div>Inventory Item</div><div>Qty</div><div>Unit Cost</div><div>Subtotal</div><div></div>
        </div>
        <div id="prcItems">
          ${p.items.map((it,i)=>prcItemHtml(it,i,p.supplierId)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="addPrcItem()" style="margin-top:8px">+ Add Item</button>
      </div>
      <div class="form-row" style="margin-top:14px"><label>Notes</label>
        <textarea id="prc_notes">${escapeHtml(p.notes||'')}</textarea>
      </div>
      <div id="prcTotal" style="margin-top:12px;text-align:right;font-weight:700;color:var(--brown);font-size:16px">Total: $0.00</div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'+ Order':'Save Changes'}</button>
      </div>
    </form>
  `);
  setTimeout(recalcPrcTotal, 30);
}
function prcItemHtml(it, idx, supplierId) {
  // filter ingredients by supplier if set
  const opts = state.ingredients.filter(i => !supplierId || i.supplierId === supplierId);
  return `
    <div class="po-line" data-idx="${idx}">
      <select onchange="prcItemChange(${idx})">
        <option value="">- Select Item -</option>
        ${opts.map(i=>`<option value="${i.id}" data-cost="${i.cost}" ${it.ingredientId===i.id?'selected':''}>${escapeHtml(i.name)} (${escapeHtml(i.unit)})</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" value="${it.qty||0}" onchange="recalcPrcTotal()" />
      <input type="number" min="0" step="0.01" value="${(it.unitCost ?? 0).toFixed(2)}" onchange="recalcPrcTotal()" />
      <div class="line-sub" style="text-align:right;font-weight:600;color:var(--brown)">$0.00</div>
      <button type="button" onclick="removePrcItem(${idx})">&times;</button>
    </div>
  `;
}
function prcSupplierChange() {
  // re-render items section with supplier filter
  const sid = document.getElementById('prc_sup').value;
  const cont = document.getElementById('prcItems');
  cont.innerHTML = '';
  recalcPrcTotal();
}
function addPrcItem() {
  const sid = document.getElementById('prc_sup').value;
  const cont = document.getElementById('prcItems');
  const idx = cont.children.length;
  const div = document.createElement('div');
  div.innerHTML = prcItemHtml({ ingredientId: '', qty: 0, unitCost: 0 }, idx, sid);
  cont.appendChild(div.firstElementChild);
  recalcPrcTotal();
}
function removePrcItem(idx) {
  const rows = document.querySelectorAll('#prcItems .po-line');
  if (rows[idx]) rows[idx].remove();
  recalcPrcTotal();
}
function prcItemChange(idx) {
  const row = document.querySelectorAll('#prcItems .po-line')[idx];
  if (!row) return;
  const sel = row.querySelector('select');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cost) {
    row.querySelectorAll('input')[1].value = parseFloat(opt.dataset.cost).toFixed(2);
  }
  recalcPrcTotal();
}
function recalcPrcTotal() {
  let total = 0;
  document.querySelectorAll('#prcItems .po-line').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const qty = parseFloat(inputs[0].value) || 0;
    const cost = parseFloat(inputs[1].value) || 0;
    const sub = qty * cost;
    total += sub;
    row.querySelector('.line-sub').textContent = fmtMoney(sub);
  });
  const t = document.getElementById('prcTotal');
  if (t) t.textContent = 'Total: ' + fmtMoney(total);
}
async function saveProc(id, isNew) {
  const items = [];
  document.querySelectorAll('#prcItems .po-line').forEach(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    if (sel.value && parseFloat(inputs[0].value) > 0) {
      items.push({ ingredientId: sel.value, qty: parseFloat(inputs[0].value), unitCost: parseFloat(inputs[1].value) });
    }
  });
  if (!items.length) { toast('Add at least one item.'); return; }
  const data = {
    id,
    qbPoNumber: document.getElementById('prc_qb').value,
    supplierId: document.getElementById('prc_sup').value,
    dateOrdered: document.getElementById('prc_date').value,
    expectedDate: document.getElementById('prc_exp').value,
    status: document.getElementById('prc_status').value,
    notes: document.getElementById('prc_notes').value,
    items
  };
  if (!requireEmployeeBackendWrite(backendProcurementState)) return;
  try {
    const saved = await saveBackendProcurementOrder(id, isNew, data);
    backendProcurementState.status = 'connected';
    backendProcurementState.loaded = false;
    backendProcurementState.lastError = '';
    mergeBackendProcurementOrders([saved]);
  } catch (error) {
    failBackendRequiredWrite(error, backendProcurementState);
    return;
  }
  closeModal();
  procTab = 'in';
  router('procurement');
  toast('Procurement PO saved to backend.');
}
async function deleteProc(id) {
  const p = state.procurementOrders.find(x => x.id === id);
  if (!p) return;
  const ok = await openConfirmModal({
    title: 'Cancel procurement PO',
    record: id,
    message: 'Cancel this procurement PO in the backend?',
    risk: 'Received procurement POs cannot be cancelled here.',
    confirmLabel: 'Cancel PO',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendProcurementState)) return;
  if (!p._backendId) return failBackendRequiredWrite(null, backendProcurementState, 'Procurement PO cancellation requires backend confirmation. Nothing was saved locally.');
  try {
    await cancelBackendProcurementOrder(p._backendId);
    backendProcurementState.status = 'connected';
    backendProcurementState.lastError = '';
    router('procurement');
    toast('Procurement PO cancelled in backend.');
  } catch (error) {
    failBackendRequiredWrite(error, backendProcurementState);
  }
}
async function receiveProc(id) {
  const p = state.procurementOrders.find(x=>x.id===id);
  if (!p) return;
  const ok = await openConfirmModal({
    title: 'Mark procurement arrived',
    record: id,
    message: 'Mark this PO as Arrived?',
    risk: 'This adds the items to inventory and moves the procurement PO to Completed.',
    confirmLabel: 'Mark Arrived',
    tone: 'workflow'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendProcurementState)) return;
  if (!p._backendId) return failBackendRequiredWrite(null, backendProcurementState, 'This procurement PO is not backend-backed. Nothing was saved locally.');
  try {
    const receiptLines = (p.items || [])
      .filter(it => it._backendLineId && (it.qty || 0) > (it.receivedQty || 0))
      .map(it => ({
        procurementOrderLineId: it._backendLineId,
        receivedQuantity: +(it.qty - (it.receivedQty || 0)).toFixed(2),
        lotNumber: null,
        location: null
      }));
    if (!receiptLines.length) { toast('Nothing remains to receive for this supplier PO.'); return; }
    await receiveBackendProcurementOrder(p._backendId, receiptLines);
    backendProcurementState.status = 'connected';
    backendProcurementState.loaded = false;
    backendProcurementState.lastError = '';
    procTab = 'completed';
    router('procurement');
    toast(`${p.id} marked as arrived. Backend inventory updated.`);
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendProcurementState);
    return;
  }
}

