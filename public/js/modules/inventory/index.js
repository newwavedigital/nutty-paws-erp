/* =========================================================================
   INVENTORY
   ========================================================================= */
let invTab = 'Finished Good';
function setInvTab(t) { invTab = t; renderInventory(document.getElementById('content')); }

// derive linked customer for an inventory item:
// - if item has customerId set, use that
// - for Packaging items: derive from products that use this in their BOM
// Keep item.stock + primary lot/location synced to the lots[] array (the source of truth for lots/locations)
function syncItemLots(item) {
  if (!Array.isArray(item.lots) || item.lots.length === 0) {
    item.lots = [{ lotNumber: item.lotNumber||'', building: item.building||'', location: item.location||'', qty: parseFloat(item.stock)||0 }];
  }
  item.lots = item.lots.map(l => {
    const qty = parseFloat(l.qty ?? l.quantity) || 0;
    return { ...l, qty, quantity: qty };
  });
  item.stock = item.lots.reduce((s, l) => s + (parseFloat(l.qty ?? l.quantity)||0), 0);
  // primary entry (used by pick list, lot pre-fill, etc.)
  item.lotNumber = item.lots[0].lotNumber || '';
  item.building = item.lots[0].building || '';
  item.location = item.lots[0].location || '';
}
function inventoryCustomer(item) {
  if (item.customerId === 'general') return '<span class="pill">General</span>';
  if (item.customerId) return getCustomer(item.customerId)?.name || '-';
  if ((item.category || 'Ingredient') === 'Packaging') {
    const productIds = Object.keys(state.boms || {}).filter(pid => (state.boms[pid] || []).some(b => b.ingredientId === item.id));
    const customerIds = [...new Set(productIds.map(pid => getProduct(pid)?.customerId).filter(Boolean))];
    if (customerIds.length === 0) return '<span class="pill">General</span>';
    if (customerIds.length === 1) return getCustomer(customerIds[0])?.name || '-';
    return `<span class="pill">${customerIds.length} customers</span>`;
  }
  return '<span class="pill">General</span>';
}

// Shared inner-tab row for the Inventory page (categories + Master List)
function inventoryTabsHtml() {
  const tabs = ['Finished Good', 'Ingredient', 'Packaging', 'Master List', 'Receiving Log', 'Move Log', 'Shipping Log'];
  const tabLabels = { 'Ingredient': 'Ingredients', 'Finished Good': 'Finished Goods', 'Packaging': 'Packaging', 'Master List': 'Master List', 'Receiving Log': 'Receiving Log', 'Move Log': 'Move Log', 'Shipping Log': 'Shipping Log' };
  return `<div class="tabs">${tabs.map(t => {
    let cnt;
    if (t === 'Master List') cnt = (state.masterItems || []).length;
    else if (t === 'Receiving Log') cnt = (state.receivingLog || []).length;
    else if (t === 'Move Log') cnt = (state.moveLog || []).length;
    else if (t === 'Shipping Log') cnt = (state.shippingLog || []).length;
    else cnt = state.ingredients.filter(i => (i.category||'Ingredient') === t).length;
    return `<button class="tab ${invTab===t?'active':''}" onclick="setInvTab('${t}')">${escapeHtml(tabLabels[t])} <span class="tab-count">${cnt}</span></button>`;
  }).join('')}</div>`;
}
function renderInventory(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendInventoryState.loaded && !backendInventoryState.loading) {
    loadBackendInventory().then(() => { if (currentPage === 'inventory') router('inventory'); });
  }
  if (invTab === 'Master List') { renderMasterList(el); return; }
  if (invTab === 'Receiving Log') { renderReceivingLog(el); return; }
  if (invTab === 'Move Log') { renderMoveLog(el); return; }
  if (invTab === 'Shipping Log') { renderShippingLog(el); return; }
  // Order: Finished Good first, then Ingredients, then Packaging
  const tabLabels = { 'Ingredient': 'Ingredients', 'Finished Good': 'Finished Goods', 'Packaging': 'Packaging' };
  const items = state.ingredients.filter(i => (i.category || 'Ingredient') === invTab);
  const showCustomer = true; // Customer applies to all categories now (General by default)
  const showLeadTime = (invTab === 'Ingredient' || invTab === 'Packaging');
  const showCoa = (invTab === 'Ingredient'); // CoA upload only for ingredients

  // build column headers based on tab
  const headers = ['Item', 'Lot #(s)'];
  if (showCustomer) headers.push('Customer');
  headers.push('Supplier', 'On Hand', 'Allocation', 'Net Available', 'Unit', 'Reorder At');
  if (showLeadTime) headers.push('Lead Time');
  if (showCoa) headers.push('CoA');
  headers.push('Locations', 'Status', '');
  const colCount = headers.length;
  // Allocation column includes BOTH Supply Chain (in-review) POs AND
  // approved/in-production POs, so the qty tied up while a PO awaits
  // review is visible. allocatedInventory() (approved/in-prod only) is
  // intentionally left unchanged so SC approval gating math doesn't shift.
  const scMap = supplyChainDemand();
  const prodMap = allocatedInventory();
  const allocMap = {};
  Object.keys(scMap).forEach(id => { allocMap[id] = (allocMap[id]||0) + scMap[id]; });
  Object.keys(prodMap).forEach(id => { allocMap[id] = (allocMap[id]||0) + prodMap[id]; });

  const tabDescriptions = {
    'Finished Good': 'Completed sellable inventory available for shipping, stocking, pick, and pack workflows.',
    Ingredient: 'Raw materials used in formulas and production. Watch lots, CoA files, allocations, and reorder points.',
    Packaging: 'Jars, lids, labels, pouches, cases, and other production or fulfillment materials.'
  };
  const filters = `${opsSelect('Status filter', ['All statuses','OK','Reorder','Over-allocated'])}${opsSelect('Scope filter', ['All scopes','General','Customer-specific'])}`;
  const actions = `
    <button class="btn btn-secondary btn-sm" onclick="exportCsv('inventory_${invTab.toLowerCase().replace(/\\s+/g,'_')}.csv', state.ingredients.filter(i=>(i.category||'Ingredient')==='${invTab}').map(i=>({...i,supplier:getSupplier(i.supplierId)?.name||'',customer:i.customerId?(getCustomer(i.customerId)?.name||''):''})))">Export CSV</button>
    <a class="btn btn-dark btn-sm" href="${SHAREPOINT_INVENTORY_URL}" target="_blank" rel="noopener" style="text-decoration:none">View Sheet</a>
    <button class="btn btn-sm" onclick="editIngredient()">+ Add Item</button>`;
  el.innerHTML = `
    <div class="ops-page">
      ${renderBackendDataStatusBanner('inventory', backendInventoryState)}
      ${inventorySummaryHtml()}
      <div class="ops-panel">
      ${inventoryTabsHtml()}
      <div class="ops-header">
        <div>
          <h2 class="ops-title">${escapeHtml(tabLabels[invTab])} Inventory</h2>
          <div class="ops-kicker">${escapeHtml(tabDescriptions[invTab] || '')}</div>
        </div>
        <div class="ops-actions">${actions}</div>
      </div>
      ${opsToolbarHtml({ filters })}
      <div class="table-wrap"><table>
        <thead><tr>
          ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${items.length === 0 ? `<tr><td colspan="${colCount}" class="empty">No ${escapeHtml(tabLabels[invTab].toLowerCase())} items yet.</td></tr>` :
            items.map(i => {
              const allocated = allocMap[i.id] || 0;
              const net = (i.stock || 0) - allocated;
              const conflict = allocated > (i.stock || 0);
              const low = net <= i.reorderLevel;
              let statusBadge;
              if (conflict) statusBadge = `<span class="badge badge-low">Over-allocated</span>`;
              else if (low) statusBadge = '<span class="badge badge-low">Reorder</span>';
              else statusBadge = '<span class="badge badge-prod">OK</span>';
              const lotsArr = Array.isArray(i.lots) ? i.lots : [];
              const lotPills = lotsArr.filter(l => l.lotNumber).map(l => '<span class="pill">'+escapeHtml(l.lotNumber)+'</span>').join('');
              const locLines = lotsArr.filter(l => l.building || l.location).map(l =>
                `<div style="font-size:12px">${l.building ? '<span class="pill">'+escapeHtml(l.building)+'</span> ' : ''}${escapeHtml(l.location||'')}${l.qty ? ' <span style="color:var(--brown-light)">('+l.qty+')</span>' : ''}</div>`
              ).join('');
              const cells = [`<td><strong>${escapeHtml(i.name)}</strong></td>`];
              cells.push(`<td>${lotPills || '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>`);
              if (showCustomer) cells.push(`<td>${inventoryCustomer(i)}</td>`);
              const scAlloc = scMap[i.id] || 0;
              const prodAlloc = prodMap[i.id] || 0;
              const allocCell = allocated > 0
                ? `<div style="color:var(--brown);font-weight:600">${allocated.toFixed(2)}</div>`
                  + ((scAlloc > 0 || prodAlloc > 0)
                      ? `<div style="font-size:11px;color:var(--brown-light);margin-top:2px">`
                          + (scAlloc > 0 ? `<span title="Pending Supply Chain review">SC ${scAlloc.toFixed(2)}</span>` : '')
                          + (scAlloc > 0 && prodAlloc > 0 ? ' &middot; ' : '')
                          + (prodAlloc > 0 ? `<span title="Approved / In Production">Prod ${prodAlloc.toFixed(2)}</span>` : '')
                          + `</div>`
                      : '')
                : '<span style="color:var(--brown-light)">-</span>';
              cells.push(
                `<td>${escapeHtml(getSupplier(i.supplierId)?.name || '-')}</td>`,
                `<td>${i.stock}</td>`,
                `<td>${allocCell}</td>`,
                `<td><strong style="color:${conflict ? 'var(--danger)' : (low ? '#a0470c' : 'var(--success)')}">${net.toFixed(2)}</strong></td>`,
                `<td>${escapeHtml(i.unit)}</td>`,
                `<td>${i.reorderLevel}</td>`
              );
              if (showLeadTime) cells.push(`<td>${i.leadTimeDays ? i.leadTimeDays + ' days' : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>`);
              if (showCoa) cells.push(`<td>${i.coa ? `<a href="${i.coa.dataUrl}" download="${escapeHtml(i.coa.name)}" class="btn btn-icon btn-sm" style="text-decoration:none" title="${escapeHtml(i.coa.name)}">&#128196; CoA</a>` : '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>`);
              cells.push(
                `<td>${locLines || '<span style="color:var(--brown-light);font-size:12px">-</span>'}</td>`,
                `<td>${statusBadge}</td>`,
                `<td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="adjustStock('${i.id}')">Adjust</button>
                  <button class="btn btn-icon btn-sm" onclick="editIngredient('${i.id}')">Edit</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteIngredient('${i.id}')">Delete</button>
                </td>`
              );
              return `<tr style="${conflict?'background:#fff5f4':''}">${cells.join('')}</tr>`;
            }).join('')
          }
        </tbody>
      </table></div>
    </div>
  `;
}

/* =========================================================================
   MASTER LIST - single source of truth for inventory item names.
   Every inventory item's name is chosen from here. New ingredients,
   finished goods, or packaging must be added to the Master List first.
   ========================================================================= */
function masterCustomerName(m) {
  if (!m.customerId || m.customerId === 'general') return '<span class="pill">General</span>';
  return escapeHtml(getCustomer(m.customerId)?.name || '-');
}
function masterTypeLabel(m) {
  const raw = (m.itemType || '').replace(/_/g, ' ').trim();
  if (raw) return raw.replace(/\b\w/g, c => c.toUpperCase());
  const inv = (state.ingredients || []).find(i => i.name === m.name || i.masterItemId === m.id);
  return inv ? (inv.category || 'Ingredient') : 'Other';
}
function masterUsedInHtml(m) {
  const used = [];
  if ((state.ingredients || []).some(i => i.name === m.name || i.masterItemId === m.id)) used.push('Inventory');
  if (Object.values(state.boms || {}).some(rows => (rows || []).some(b => b.ingredientId === m.id || b.masterItemId === m.id))) used.push('Formula/BOM');
  if ((state.receivingLog || []).some(r => r.masterItemId === m.id || r.itemName === m.name)) used.push('Receiving');
  return used.length ? used.map(u => `<span class="pill">${escapeHtml(u)}</span>`).join(' ') : '<span style="color:var(--brown-light);font-size:12px">Not used yet</span>';
}
function renderMasterList(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendMasterItemState.loaded && !backendMasterItemState.loading) {
    loadBackendMasterItems().then(() => { if (currentPage === 'inventory' && invTab === 'Master List') router('inventory'); });
  }
  const items = (state.masterItems || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  const filters = `${opsSelect('Item type filter', ['All types','Ingredient','Packaging','Finished Good','Other'])}${opsSelect('Customer scope filter', ['All scopes','General','Customer-specific'])}${opsSelect('Allergen filter', ['All allergens','None','Peanut','Tree Nut','Milk','Soy','Wheat'])}`;
  const actions = `
    <button class="btn btn-secondary btn-sm" onclick="exportCsv('master_list.csv', (state.masterItems||[]).map(m=>({name:m.name,type:masterTypeLabel(m),uom:m.uom,allergens:(m.allergens||[]).join('; '),customer:(!m.customerId||m.customerId==='general')?'General':(getCustomer(m.customerId)?.name||'')})))">Export CSV</button>
    <button class="btn btn-sm" onclick="editMasterItem()">+ Add Master Item</button>`;
  el.innerHTML = `
    <div class="ops-page">
      ${renderBackendDataStatusBanner('master-items', backendMasterItemState)}
      ${inventorySummaryHtml()}
      <div class="ops-panel">
        ${inventoryTabsHtml()}
        <div class="ops-header">
          <div>
            <h2 class="ops-title">Master List</h2>
            <div class="ops-kicker">Item definitions used by inventory, product formulas, receiving, and moves. This is setup data, not stock count data.</div>
          </div>
          <div class="ops-actions">${actions}</div>
        </div>
        ${opsToolbarHtml({ filters })}
        <div class="ops-note">Master List is the source of truth for stocked item names. Add raw materials, packaging, finished goods, and other items here before creating inventory records or formulas.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Item Name</th><th>Type</th><th>Unit of Measure</th><th>Allergens</th><th>Customer Scope</th><th>Used In</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${items.length === 0 ? `<tr><td colspan="8" class="empty">No master items yet. Add item definitions before creating inventory records or product formulas.</td></tr>` :
              items.map(m => `<tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td>${escapeHtml(masterTypeLabel(m))}</td>
                <td>${escapeHtml(m.uom || '')}</td>
                <td>${(m.allergens && m.allergens.length) ? m.allergens.map(a => '<span class="badge badge-low" style="margin:1px 2px">'+escapeHtml(a)+'</span>').join('') : '<span style="color:var(--brown-light);font-size:12px">None</span>'}</td>
                <td>${masterCustomerName(m)}</td>
                <td>${masterUsedInHtml(m)}</td>
                <td>${opsStatus('Active','ok')}</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="editMasterItem('${m.id}')">Edit</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteMasterItem('${m.id}')">Delete</button>
                </td>
              </tr>`).join('')
            }
          </tbody>
        </table></div>
      </div>
    </div>
  `;
}function editMasterItem(id) {
  const m = (state.masterItems || []).find(x => x.id === id) || { id: uid('m'), name:'', uom:'LBS', allergens:[], customerId:'general' };
  const isNew = !id;
  const allergens = Array.isArray(m.allergens) ? m.allergens : [];
  openModal((isNew?'Add':'Edit')+' Master Item', `
    <form onsubmit="event.preventDefault();saveMasterItem('${m.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Item Name</label><input id="mi_name" value="${escapeHtml(m.name)}" required placeholder="e.g. Raw peanuts, 16oz jars, Bnutty Classic 16oz" /></div>
        <div class="form-row"><label>Unit of Measurement</label>
          <select id="mi_uom">
            ${MASTER_UOMS.map(u => `<option ${m.uom===u?'selected':''}>${escapeHtml(u)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Customer</label>
          <select id="mi_customer">
            <option value="general" ${(!m.customerId || m.customerId==='general')?'selected':''}>General (used by multiple customers)</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${m.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:4px">
        <label>Allergen(s)</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;padding:10px 12px;background:var(--beige-light);border-radius:8px">
          ${ALLERGENS.map(a => `<label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;cursor:pointer;margin:0">
            <input type="checkbox" class="mi_allergen" value="${escapeHtml(a)}" ${allergens.includes(a)?'checked':''} style="width:15px;height:15px;cursor:pointer" /> ${escapeHtml(a)}
          </label>`).join('')}
        </div>
        <div class="help-text">Check every allergen present in this item.</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Master Item':'Save Changes'}</button>
      </div>
    </form>
  `);
}
async function saveMasterItem(id, isNew) {
  const name = (document.getElementById('mi_name').value || '').trim();
  if (!name) { toast('Item Name is required.'); return; }
  const allergens = Array.from(document.querySelectorAll('.mi_allergen')).filter(c => c.checked).map(c => c.value);
  const data = {
    id,
    sku: name,
    itemType: 'other',
    name,
    uom: document.getElementById('mi_uom').value || 'LBS',
    allergens,
    customerId: document.getElementById('mi_customer').value || 'general'
  };
  state.masterItems = state.masterItems || [];
  // prevent duplicate names (case-insensitive)
  const dup = state.masterItems.find(x => x.id !== id && (x.name||'').toLowerCase() === name.toLowerCase());
  if (dup) { toast('A master item with that name already exists.'); return; }
  const existing = state.masterItems.find(x => x.id === id);
  if (!requireEmployeeBackendWrite(backendMasterItemState)) return;
  try {
    const saved = await saveBackendMasterItem(id, isNew, { ...data, _backendId: existing?._backendId });
    data.id = saved.id;
    data._backendId = saved.id;
    id = saved.id;
    backendMasterItemState.status = 'connected';
    backendMasterItemState.loaded = false;
    backendMasterItemState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendMasterItemState);
    return;
  }
  if (isNew) state.masterItems.push(data);
  else Object.assign(state.masterItems.find(x => x.id === id), data);
  saveState();
  closeModal();
  invTab = 'Master List';
  router('inventory');
  toast('Master item saved.');
}
async function deleteMasterItem(id) {
  const m = (state.masterItems || []).find(x => x.id === id);
  if (!m) return;
  if (employeeBackendSessionActive()) {
    return failBackendRequiredWrite(null, backendMasterItemState, 'Master item delete requires backend archive support. Nothing was saved locally.');
  }
  const inUse = state.ingredients.some(i => (i.name||'').toLowerCase() === (m.name||'').toLowerCase());
  const ok = await openConfirmModal({
    title: 'Delete master item',
    record: m.name || id,
    message: 'Delete this Master List item?',
    risk: inUse
      ? 'It is used by one or more inventory items. Those items will not be deleted, but this name will no longer be selectable.'
      : 'This removes the item definition from setup lists.',
    confirmLabel: 'Delete Master Item',
    tone: 'danger'
  });
  if (!ok) return;
  state.masterItems = state.masterItems.filter(x => x.id !== id);
  saveState();
  router('inventory');
  toast('Master item deleted.');
}

/* =========================================================================
   RECEIVING LOG - record of inbound product receipts. Item Name, Unit of
   Measure, and Allergen all pull from the Master List; Vendor from Suppliers.
   ========================================================================= */
function nextReceivingId() {
  const nums = (state.receivingLog || [])
    .map(r => parseInt((String(r.receivingId || '').match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return 'RCV-' + next;
}
function renderReceivingLog(el) {
  const rows = (state.receivingLog || []).slice().sort((a,b) => {
    const ka = (a.date||'') + 'T' + (a.time||''), kb = (b.date||'') + 'T' + (b.time||'');
    return kb.localeCompare(ka); // newest first
  });
  const headers = ['Receiving ID','Date','Time','Item Name','# Packages','Qty / Package','Total Qty','UOM','Lot #','Allergen','Received By','Carrier','Vendor',''];
  const filters = `${opsSelect('Date range filter', ['All dates','Today','This week','This month'])}${opsSelect('Item filter', ['All items', ...rows.map(r=>r.itemName).filter(Boolean).slice(0,6)])}${opsSelect('Vendor filter', ['All vendors', ...state.suppliers.map(s=>s.name).slice(0,6)])}`;
  const actions = `
    <button class="btn btn-secondary btn-sm" onclick="exportCsv('receiving_log.csv', (state.receivingLog||[]).map(r=>({receiving_id:r.receivingId,date:r.date,time:r.time,item:r.itemName,packages:r.packages,qty_per_package:r.qtyPerPackage,total_qty:r.totalQty,uom:r.uom,lot:r.lot,allergens:(r.allergens||[]).join('; '),received_by:r.receivedBy,carrier:r.carrier,vendor:getSupplier(r.supplierId)?.name||''})))">Export CSV</button>
    <button class="btn btn-sm" onclick="editReceiving()">+ Log Receipt</button>`;
  el.innerHTML = `
    <div class="ops-page">
    ${renderBackendDataStatusBanner('inventory', backendInventoryState)}
    ${inventorySummaryHtml()}
    <div class="ops-panel">
      ${inventoryTabsHtml()}
      <div class="ops-header">
        <div>
          <h2 class="ops-title">Receiving Log</h2>
          <div class="ops-kicker">Inbound inventory receipts with generated RCV IDs and Master List autofill.</div>
        </div>
        <div class="ops-actions">${actions}</div>
      </div>
      ${opsToolbarHtml({ filters })}
      <div class="ops-note">Record inbound inventory receipts. Item, Unit of Measure, and Allergen are pulled from Master List; Total Qty is packages times quantity per package.</div>
      <div class="table-wrap"><table>
        <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="${headers.length}" class="empty">No receipts logged yet. Click "+ Log Receipt".</td></tr>` :
            rows.map(r => `<tr>
              <td><strong>${escapeHtml(r.receivingId||'')}</strong></td>
              <td>${fmtDate(r.date)}</td>
              <td>${escapeHtml(r.time||'-')}</td>
              <td>${escapeHtml(r.itemName||'-')}</td>
              <td>${r.packages!=null?escapeHtml(String(r.packages)):'-'}</td>
              <td>${r.qtyPerPackage!=null?escapeHtml(String(r.qtyPerPackage)):'-'}</td>
              <td><strong>${r.totalQty!=null?escapeHtml(String(r.totalQty)):'-'}</strong></td>
              <td>${escapeHtml(r.uom||'-')}</td>
              <td>${r.lot?'<span class="pill">'+escapeHtml(r.lot)+'</span>':'-'}</td>
              <td>${(r.allergens&&r.allergens.length)?r.allergens.map(a=>'<span class="badge badge-low" style="margin:1px 2px">'+escapeHtml(a)+'</span>').join(''):'<span style="color:var(--brown-light);font-size:12px">None</span>'}</td>
              <td>${escapeHtml(r.receivedBy||'-')}</td>
              <td>${escapeHtml(r.carrier||'-')}</td>
              <td>${escapeHtml(getSupplier(r.supplierId)?.name||'-')}</td>
              <td class="row-actions">
                <button class="btn btn-icon btn-sm" onclick="editReceiving('${r.id}')">Edit</button>
                <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteReceiving('${r.id}')">Delete</button>
              </td>
            </tr>`).join('')
          }
        </tbody>
      </table></div>
    </div>
    </div>
  `;
}
function editReceiving(id) {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const nowTime = now.toTimeString().slice(0,5);
  const r = (state.receivingLog || []).find(x => x.id === id) || {
    id: uid('rcv'), receivingId: nextReceivingId(), date: today, time: nowTime,
    masterItemId: '', itemName: '', packages: '', qtyPerPackage: '', totalQty: 0,
    uom: '', lot: '', allergens: [], receivedBy: '', carrier: '', supplierId: ''
  };
  const isNew = !id;
  const masterOpts = (state.masterItems || []).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  openModal((isNew?'Log':'Edit')+' Receipt', `
    <form onsubmit="event.preventDefault();saveReceiving('${r.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Receiving ID</label><input id="rcv_id" value="${escapeHtml(r.receivingId||'')}" readonly style="background:var(--beige-light)" /></div>
        <div class="form-row"><label>Date</label><input type="date" id="rcv_date" value="${escapeHtml(r.date||today)}" required /></div>
        <div class="form-row"><label>Time</label><input type="time" id="rcv_time" value="${escapeHtml(r.time||nowTime)}" required /></div>
        <div class="form-row"><label>Item Name</label>
          ${masterOpts.length ? `
            <select id="rcv_item" required onchange="receivingItemSelected()">
              <option value="">- Select from Master List -</option>
              ${masterOpts.map(m=>`<option value="${m.id}" data-uom="${escapeHtml(m.uom||'')}" data-allergens="${escapeHtml((m.allergens||[]).join('|'))}" ${r.masterItemId===m.id?'selected':''}>${escapeHtml(m.name)}</option>`).join('')}
            </select>
            <div class="help-text">Unit of Measure &amp; Allergen are pulled from this item's Master List entry.</div>
          ` : `
            <input type="hidden" id="rcv_item" value="" />
            <div class="help-text" style="color:#a0470c">No items in the <strong>Master List</strong> yet. Add the item there first.</div>
          `}
        </div>
        <div class="form-row"><label># of Packages</label><input type="number" min="0" step="1" id="rcv_packages" value="${escapeHtml(String(r.packages??''))}" oninput="computeReceivingTotal()" /></div>
        <div class="form-row"><label>Quantity Per Package</label><input type="number" min="0" step="0.01" id="rcv_qtypp" value="${escapeHtml(String(r.qtyPerPackage??''))}" oninput="computeReceivingTotal()" /></div>
        <div class="form-row"><label>Total Quantity</label>
          <input id="rcv_total" value="${escapeHtml(String(r.totalQty??0))}" readonly style="background:var(--beige-light);font-weight:600" />
          <div class="help-text">Auto-calculated: # of Packages &times; Quantity per Package.</div>
        </div>
        <div class="form-row"><label>Unit of Measure</label>
          <input id="rcv_uom" value="${escapeHtml(r.uom||'')}" readonly placeholder="-" style="background:var(--beige-light)" />
          <div class="help-text">From the Master List.</div>
        </div>
        <div class="form-row"><label>Lot #</label><input type="text" id="rcv_lot" value="${escapeHtml(r.lot||'')}" placeholder="Lot #" /></div>
        <div class="form-row"><label>Received By</label><input type="text" id="rcv_by" value="${escapeHtml(r.receivedBy||'')}" placeholder="Employee name" /></div>
        <div class="form-row"><label>Carrier</label><input type="text" id="rcv_carrier" value="${escapeHtml(r.carrier||'')}" placeholder="Shipping company" /></div>
        <div class="form-row"><label>Vendor</label>
          <select id="rcv_vendor">
            <option value="">- Select Vendor -</option>
            ${state.suppliers.map(s=>`<option value="${s.id}" ${r.supplierId===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-top:4px">
        <label>Allergen (from Master List)</label>
        <div id="rcv_allergen_display" style="padding:8px 12px;background:var(--beige-light);border-radius:8px;min-height:20px">${(r.allergens&&r.allergens.length)?r.allergens.map(a=>'<span class="badge badge-low" style="margin:1px 2px">'+escapeHtml(a)+'</span>').join(''):'<span style="color:var(--brown-light);font-size:12px">Select an item to see its allergens.</span>'}</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Receipt':'Save Changes'}</button>
      </div>
    </form>
  `);
}
// When an item is picked, pull its UOM + allergens from the Master List.
function receivingItemSelected() {
  const sel = document.getElementById('rcv_item');
  if (!sel || !sel.options) return;
  const opt = sel.options[sel.selectedIndex];
  const uomEl = document.getElementById('rcv_uom');
  const allergenEl = document.getElementById('rcv_allergen_display');
  const uom = opt ? (opt.getAttribute('data-uom') || '') : '';
  if (uomEl) uomEl.value = uom;
  const allergens = (opt && opt.getAttribute('data-allergens')) ? opt.getAttribute('data-allergens').split('|').filter(Boolean) : [];
  if (allergenEl) allergenEl.innerHTML = allergens.length ? allergens.map(a=>'<span class="badge badge-low" style="margin:1px 2px">'+escapeHtml(a)+'</span>').join('') : '<span style="color:var(--brown-light);font-size:12px">No allergens on this item.</span>';
}
function computeReceivingTotal() {
  const pkgs = parseFloat(document.getElementById('rcv_packages')?.value) || 0;
  const per = parseFloat(document.getElementById('rcv_qtypp')?.value) || 0;
  const totalEl = document.getElementById('rcv_total');
  if (totalEl) totalEl.value = +(pkgs * per).toFixed(2);
}
async function saveReceiving(id, isNew) {
  const masterItemId = document.getElementById('rcv_item').value;
  const master = (state.masterItems || []).find(m => m.id === masterItemId);
  if (!master) { toast('Pick an Item Name from the Master List.'); return; }
  const existing = (state.receivingLog || []).find(x => x.id === id);
  const inventoryItem = (state.ingredients || []).find(i => i.masterItemId === masterItemId || i.name === master.name);
  const packages = parseFloat(document.getElementById('rcv_packages').value);
  const qtyPerPackage = parseFloat(document.getElementById('rcv_qtypp').value);
  const pk = isNaN(packages) ? 0 : packages;
  const pp = isNaN(qtyPerPackage) ? 0 : qtyPerPackage;
  const data = {
    id,
    receivingId: document.getElementById('rcv_id').value,
    _backendId: existing?._backendId,
    inventoryItemId: inventoryItem?._backendId || inventoryItem?.id || existing?.inventoryItemId || '',
    date: document.getElementById('rcv_date').value,
    time: document.getElementById('rcv_time').value,
    masterItemId,
    itemName: master.name,
    packages: pk,
    qtyPerPackage: pp,
    totalQty: +(pk * pp).toFixed(2),
    uom: master.uom || '',
    allergens: Array.isArray(master.allergens) ? master.allergens.slice() : [],
    lot: (document.getElementById('rcv_lot').value || '').trim(),
    receivedBy: (document.getElementById('rcv_by').value || '').trim(),
    carrier: (document.getElementById('rcv_carrier').value || '').trim(),
    supplierId: document.getElementById('rcv_vendor').value || ''
  };
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  try {
    const saved = await saveBackendReceivingEntry(id, isNew, data);
    data.id = saved.id;
    data._backendId = saved.id;
    data.receivingId = saved.receivingId;
    data.inventoryItemId = saved.inventoryItemId || data.inventoryItemId;
    data.stockAppliedQuantity = saved.stockAppliedQuantity || 0;
    data.stockAppliedInventoryItemId = saved.stockAppliedInventoryItemId || '';
    backendInventoryState.status = 'connected';
    backendInventoryState.loaded = false;
    backendInventoryState.signals = null;
    backendInventoryState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
    return;
  }
  state.receivingLog = state.receivingLog || [];
  if (isNew) state.receivingLog.push(data);
  else Object.assign(state.receivingLog.find(x => x.id === id), data);
  saveState();
  closeModal();
  invTab = 'Receiving Log';
  router('inventory');
  toast('Receipt logged.');
}
async function deleteReceiving(id) {
  const ok = await openConfirmModal({
    title: 'Delete receiving record',
    record: id,
    message: 'Delete this receiving record?',
    risk: 'This removes the receipt from the visible Receiving Log.',
    confirmLabel: 'Delete Receipt',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  try {
    await archiveBackendReceivingEntry(id);
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
    return;
  }
  state.receivingLog = (state.receivingLog || []).filter(x => x.id !== id);
  saveState();
  backendInventoryState.loaded = false;
  backendInventoryState.signals = null;
  router('inventory');
  toast('Receiving record archived.');
}

/* =========================================================================
   MOVE LOG - record of inventory moves between locations, tied to a receipt.
   Receiving ID comes from the Receiving Log; locations are drawn from every
   location used anywhere (inventory lots + prior moves), with an inline
   "add new location" option.
   ========================================================================= */
// Every distinct location entered anywhere (inventory item, its lots, and the move log).
function allLocations() {
  const set = new Set();
  const add = v => { if (v && String(v).trim()) set.add(String(v).trim()); };
  (state.ingredients || []).forEach(i => {
    add(i.location);
    (i.lots || []).forEach(l => add(l.location));
  });
  (state.moveLog || []).forEach(mv => { add(mv.fromLocation); add(mv.toLocation); });
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}
function nextMoveId() {
  const nums = (state.moveLog || [])
    .map(r => parseInt((String(r.moveId || '').match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return 'MV-' + next;
}
function renderMoveLog(el) {
  const rows = (state.moveLog || []).slice().sort((a,b) => {
    const ka = (a.date||'') + 'T' + (a.time||''), kb = (b.date||'') + 'T' + (b.time||'');
    return kb.localeCompare(ka);
  });
  const headers = ['Move ID','Date','Receiving ID','Item','Lot #','Case Count','Qty / Case','Qty Moved','UOM','Moved By','From Location','To Location',''];
  const hasReceipts = (state.receivingLog || []).length > 0;
  const filters = `${opsSelect('Date range filter', ['All dates','Today','This week','This month'])}${opsSelect('Item filter', ['All items', ...rows.map(r=>r.itemName).filter(Boolean).slice(0,6)])}${opsSelect('Location filter', ['All locations', ...allLocations().slice(0,8)])}`;
  const actions = `
    <button class="btn btn-secondary btn-sm" onclick="exportCsv('move_log.csv', (state.moveLog||[]).map(r=>({move_id:r.moveId,date:r.date,time:r.time,receiving_id:r.receivingId,item:r.itemName,lot:r.lot,case_count:r.caseCount,qty_per_case:r.qtyPerCase,qty_moved:r.qtyMoved,uom:r.uom,moved_by:r.movedBy,from_location:r.fromLocation,to_location:r.toLocation})))">Export CSV</button>
    <button class="btn btn-sm" onclick="editMove()" ${hasReceipts?'':'disabled title="Log a receipt first" style="opacity:.55"'}>+ Log Move</button>`;
  el.innerHTML = `
    <div class="ops-page">
    ${renderBackendDataStatusBanner('inventory', backendInventoryState)}
    ${inventorySummaryHtml()}
    <div class="ops-panel">
      ${inventoryTabsHtml()}
      <div class="ops-header">
        <div>
          <h2 class="ops-title">Move Log</h2>
          <div class="ops-kicker">Internal movement between receiving, storage, production, dock, and warehouse locations.</div>
        </div>
        <div class="ops-actions">${actions}</div>
      </div>
      ${opsToolbarHtml({ filters })}
      <div class="ops-note">Receiving ID fills item, lot, and unit when available. Qty Moved is calculated from Case Count times Qty / Case.${hasReceipts?'':' Log a receipt before moving inventory.'}</div>
      <div class="table-wrap"><table>
        <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="${headers.length}" class="empty">No moves logged yet.</td></tr>` :
            rows.map(r => {
              const rec = (state.receivingLog || []).find(x => x.receivingId === r.receivingId);
              const itemName = r.itemName || rec?.itemName || '-';
              return `<tr>
                <td><strong>${escapeHtml(r.moveId||'')}</strong></td>
                <td>${fmtDate(r.date)}</td>
                <td>${escapeHtml(r.receivingId||'-')}</td>
                <td>${escapeHtml(itemName)}</td>
                <td>${r.lot?'<span class="pill">'+escapeHtml(r.lot)+'</span>':'-'}</td>
                <td>${r.caseCount!=null&&r.caseCount!==''?escapeHtml(String(r.caseCount)):'-'}</td>
                <td>${r.qtyPerCase!=null&&r.qtyPerCase!==''?escapeHtml(String(r.qtyPerCase)):'-'}</td>
                <td><strong>${r.qtyMoved!=null?escapeHtml(String(r.qtyMoved)):'-'}</strong></td>
                <td>${escapeHtml(r.uom||'-')}</td>
                <td>${escapeHtml(r.movedBy||'-')}</td>
                <td>${r.fromLocation?'<span class="pill">'+escapeHtml(r.fromLocation)+'</span>':'-'}</td>
                <td>${r.toLocation?'<span class="pill">'+escapeHtml(r.toLocation)+'</span>':'-'}</td>
                <td class="row-actions">
                  <button class="btn btn-icon btn-sm" onclick="editMove('${r.id}')">Edit</button>
                  <button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteMove('${r.id}')">Delete</button>
                </td>
              </tr>`;
            }).join('')
          }
        </tbody>
      </table></div>
    </div>
    </div>
  `;
}
// Build a location <select> with every known location + an inline "add new" option.
// If `current` isn't one of the known locations, treat it as a custom value: select
// the "add new" option and pre-fill its text box.
function locationSelectHtml(which, current) {
  const locs = allLocations();
  const isCustom = current && !locs.includes(current);
  return `
    <select id="mv_${which}" onchange="moveLocChanged('${which}')">
      <option value="">- Select location -</option>
      ${locs.map(l => `<option value="${escapeHtml(l)}" ${current===l?'selected':''}>${escapeHtml(l)}</option>`).join('')}
      <option value="__new__" ${isCustom?'selected':''}>+ Add new location...</option>
    </select>
    <input type="text" id="mv_${which}_new" placeholder="New location" value="${isCustom?escapeHtml(current):''}" style="margin-top:6px;display:${isCustom?'block':'none'}" />
  `;
}
function moveLocChanged(which) {
  const sel = document.getElementById('mv_'+which);
  const inp = document.getElementById('mv_'+which+'_new');
  if (!sel || !inp) return;
  if (sel.value === '__new__') { inp.style.display = 'block'; inp.focus(); }
  else { inp.style.display = 'none'; }
}
function editMove(id) {
  if ((state.receivingLog || []).length === 0) { toast('Log a receipt on the Receiving Log tab first.'); return; }
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const nowTime = now.toTimeString().slice(0,5);
  const r = (state.moveLog || []).find(x => x.id === id) || {
    id: uid('mv'), moveId: nextMoveId(), date: today, time: nowTime,
    receivingId: '', masterItemId: '', itemName: '', lot: '', caseCount: '', qtyPerCase: '', qtyMoved: 0,
    uom: '', movedBy: '', fromLocation: '', toLocation: ''
  };
  const isNew = !id;
  const receipts = (state.receivingLog || []).slice().sort((a,b)=>(b.date+'T'+b.time).localeCompare(a.date+'T'+a.time));
  const masterOpts = (state.masterItems || []).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  openModal((isNew?'Log':'Edit')+' Move', `
    <form onsubmit="event.preventDefault();saveMove('${r.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Move ID</label><input id="mv_id" value="${escapeHtml(r.moveId||'')}" readonly style="background:var(--beige-light)" /></div>
        <div class="form-row"><label>Date</label><input type="date" id="mv_date" value="${escapeHtml(r.date||today)}" required /></div>
        <div class="form-row"><label>Time</label><input type="time" id="mv_time" value="${escapeHtml(r.time||nowTime)}" required /></div>
        <div class="form-row"><label>Receiving ID</label>
          <select id="mv_receiving" required onchange="moveReceivingSelected()">
            <option value="">- Select Receiving ID -</option>
            ${receipts.map(rc => `<option value="${escapeHtml(rc.receivingId)}" ${r.receivingId===rc.receivingId?'selected':''}>${escapeHtml(rc.receivingId)}${rc.itemName?' - '+escapeHtml(rc.itemName):''}</option>`).join('')}
          </select>
          <div class="help-text">Pulled from the Receiving Log. Selecting one fills in the item, lot &amp; unit.</div>
        </div>
        <div class="form-row"><label>Item Name</label>
          <select id="mv_item" onchange="moveItemSelected()">
            <option value="">- Select from Master List -</option>
            ${masterOpts.map(m=>`<option value="${m.id}" data-uom="${escapeHtml(m.uom||'')}" ${r.masterItemId===m.id?'selected':''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
          <div class="help-text">Pulled from the Master List.</div>
        </div>
        <div class="form-row"><label>Lot #</label><input type="text" id="mv_lot" value="${escapeHtml(r.lot||'')}" placeholder="Lot #" /></div>
        <div class="form-row"><label>Case Count</label><input type="number" min="0" step="1" id="mv_cases" value="${escapeHtml(String(r.caseCount??''))}" oninput="computeMoveQty()" /></div>
        <div class="form-row"><label>Quantity Per Case</label><input type="number" min="0" step="0.01" id="mv_qtypc" value="${escapeHtml(String(r.qtyPerCase??''))}" oninput="computeMoveQty()" /></div>
        <div class="form-row"><label>Quantity Moved</label>
          <input id="mv_qtymoved" value="${escapeHtml(String(r.qtyMoved??0))}" readonly style="background:var(--beige-light);font-weight:600" />
          <div class="help-text">Auto-calculated: Case Count &times; Quantity per Case.</div>
        </div>
        <div class="form-row"><label>Unit of Measurement</label>
          <input id="mv_uom" value="${escapeHtml(r.uom||'')}" readonly placeholder="-" style="background:var(--beige-light)" />
          <div class="help-text">From the Master List.</div>
        </div>
        <div class="form-row"><label>Moved By</label><input type="text" id="mv_by" value="${escapeHtml(r.movedBy||'')}" placeholder="Employee name" /></div>
        <div class="form-row"><label>From Location</label>
          ${locationSelectHtml('from', r.fromLocation)}
        </div>
        <div class="form-row"><label>To Location</label>
          ${locationSelectHtml('to', r.toLocation)}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Log Move':'Save Changes'}</button>
      </div>
    </form>
  `);
}
function moveLocValue(which) {
  const sel = document.getElementById('mv_'+which);
  if (!sel) return '';
  if (sel.value === '__new__') return (document.getElementById('mv_'+which+'_new').value || '').trim();
  return sel.value;
}
// When a Receiving ID is picked, fill in its item, lot, and unit from that receipt.
function moveReceivingSelected() {
  const rid = document.getElementById('mv_receiving').value;
  const rec = (state.receivingLog || []).find(x => x.receivingId === rid);
  if (!rec) return;
  const itemSel = document.getElementById('mv_item');
  if (itemSel && rec.masterItemId) itemSel.value = rec.masterItemId;
  const lotEl = document.getElementById('mv_lot');
  if (lotEl && !lotEl.value) lotEl.value = rec.lot || '';
  moveItemSelected();
}
// Pull the Unit of Measurement from the selected Master List item.
function moveItemSelected() {
  const sel = document.getElementById('mv_item');
  const uomEl = document.getElementById('mv_uom');
  if (!sel || !uomEl) return;
  const opt = sel.options[sel.selectedIndex];
  uomEl.value = opt ? (opt.getAttribute('data-uom') || '') : '';
}
function computeMoveQty() {
  const cases = parseFloat(document.getElementById('mv_cases')?.value) || 0;
  const per = parseFloat(document.getElementById('mv_qtypc')?.value) || 0;
  const el = document.getElementById('mv_qtymoved');
  if (el) el.value = +(cases * per).toFixed(2);
}
async function saveMove(id, isNew) {
  const receivingId = document.getElementById('mv_receiving').value;
  if (!receivingId) { toast('Select a Receiving ID.'); return; }
  const fromLocation = moveLocValue('from');
  const toLocation = moveLocValue('to');
  if (!fromLocation) { toast('Select or enter a From Location.'); return; }
  if (!toLocation) { toast('Select or enter a To Location.'); return; }
  const masterItemId = document.getElementById('mv_item').value;
  const master = (state.masterItems || []).find(m => m.id === masterItemId);
  const cc = parseFloat(document.getElementById('mv_cases').value);
  const qpc = parseFloat(document.getElementById('mv_qtypc').value);
  const caseCount = isNaN(cc) ? 0 : cc;
  const qtyPerCase = isNaN(qpc) ? 0 : qpc;
  const data = {
    id,
    moveId: document.getElementById('mv_id').value,
    _backendId: (state.moveLog || []).find(x => x.id === id)?._backendId,
    date: document.getElementById('mv_date').value,
    time: document.getElementById('mv_time').value,
    receivingId,
    masterItemId,
    itemName: master ? master.name : '',
    lot: (document.getElementById('mv_lot').value || '').trim(),
    caseCount,
    qtyPerCase,
    qtyMoved: +(caseCount * qtyPerCase).toFixed(2),
    uom: master ? (master.uom || '') : (document.getElementById('mv_uom').value || ''),
    movedBy: (document.getElementById('mv_by').value || '').trim(),
    fromLocation,
    toLocation
  };
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  try {
    const saved = await saveBackendMoveEntry(id, isNew, data);
    data.id = saved.id;
    data._backendId = saved.id;
    data.moveId = saved.moveId;
    data.masterItemId = saved.masterItemId;
    data.itemName = saved.itemName;
    data.lot = saved.lotNumber || data.lot;
    data.qtyMoved = saved.quantityMoved;
    data.uom = saved.unitOfMeasure;
    backendInventoryState.status = 'connected';
    backendInventoryState.loaded = false;
    backendInventoryState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
    return;
  }
  state.moveLog = state.moveLog || [];
  if (isNew) state.moveLog.push(data);
  else Object.assign(state.moveLog.find(x => x.id === id), data);
  saveState();
  closeModal();
  invTab = 'Move Log';
  router('inventory');
  toast('Move logged.');
}
async function deleteMove(id) {
  const ok = await openConfirmModal({
    title: 'Delete move record',
    record: id,
    message: 'Delete this move record?',
    risk: 'This removes the movement entry from the visible Move Log.',
    confirmLabel: 'Delete Move',
    tone: 'danger'
  });
  if (!ok) return;
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  try {
    await archiveBackendMoveEntry(id);
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
    return;
  }
  state.moveLog = (state.moveLog || []).filter(x => x.id !== id);
  saveState();
  backendInventoryState.loaded = false;
  router('inventory');
  toast('Move record archived.');
}

/* =========================================================================
   SHIPPING LOG - auto-generated when a PO is marked shipped on the Shipping
   page (completeShipment). Read-only history of outbound shipments.
   ========================================================================= */
function nextShippingId() {
  const nums = (state.shippingLog || [])
    .map(r => parseInt((String(r.shipId || '').match(/\d+/) || [0])[0], 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return 'SHP-' + next;
}
// Build a shipping-log entry from a PO. Stores IDs (customer/product) and resolves
// names at render time so renamed records stay accurate.
function buildShippingLogEntry(po) {
  const sh = po.shipping || {};
  const palletList = sh.palletList || [];
  return {
    id: uid('shp'),
    shipId: nextShippingId(),
    poId: po.id,
    date: (po.shippedAt || new Date().toISOString()).slice(0,10),
    customerId: po.customerId || '',
    brand: po.brand || '',
    carrier: sh.carrier || '',
    bol: sh.bol || '',
    proNumber: sh.proNumber || '',
    pallets: palletList.length,
    weight: palletList.reduce((sum,pl)=>sum+(parseFloat(pl.weight)||0),0),
    items: (po.lines || []).map(l => ({ productId: l.productId, qty: (typeof l.actualQty==='number'?l.actualQty:l.qty), lot: l.lotNumber||'' }))
  };
}
// Record a shipment in the Shipping Log (idempotent per PO). Called from completeShipment.
function logShipment(po) {
  state.shippingLog = state.shippingLog || [];
  if (state.shippingLog.some(l => l.poId === po.id)) return;
  state.shippingLog.push(buildShippingLogEntry(po));
}
function shippingLogRowsForDisplay() {
  return shippingBackendIsConnected() ? backendShippingState.logs : (state.shippingLog || []);
}
function shippingLogExportRows() {
  return shippingLogRowsForDisplay().map(r=>({
    shipping_id: r.shipId,
    date: r.date,
    po: r.poId,
    customer: getCustomer(r.customerId)?.name || '',
    brand: r.brand,
    carrier: r.carrier,
    bol: r.bol,
    pro: r.proNumber,
    pallets: r.pallets,
    weight: r.weight,
    items: (r.items||[]).map(it=>(getProduct(it.productId)?.sku||'')+' x'+it.qty).join('; ')
  }));
}
function renderShippingLog(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendShippingState.loaded && !backendShippingState.loading) {
    loadBackendShipping().then(() => { if (currentPage === 'inventory' && invTab === 'Shipping Log') router('inventory'); });
  }
  const rows = shippingLogRowsForDisplay().slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const headers = ['Shipping ID','Date','Order (PO)','Customer','Brand','Carrier','BOL #','PRO #','Pallets','Weight','Items',''];
  const filters = `${opsSelect('Date range filter', ['All dates','Today','This week','This month'])}${opsSelect('Customer filter', ['All customers', ...state.customers.map(c=>c.name).slice(0,6)])}${opsSelect('Carrier filter', ['All carriers','UPS','FedEx','USPS','LTL'])}`;
  const actions = `<button class="btn btn-secondary btn-sm" onclick="exportCsv('shipping_log.csv', shippingLogExportRows())">Export CSV</button>`;
  el.innerHTML = `
    <div class="ops-page">
    ${renderBackendDataStatusBanner('inventory', backendInventoryState)}
    ${renderBackendShippingBanner()}
    ${inventorySummaryHtml()}
    <div class="ops-panel">
      ${inventoryTabsHtml()}
      <div class="ops-header">
        <div>
          <h2 class="ops-title">Shipping Log</h2>
          <div class="ops-kicker">Read-only shipment history generated from the Shipping workflow.</div>
        </div>
        <div class="ops-actions">${actions}</div>
      </div>
      ${opsToolbarHtml({ filters })}
      <div class="ops-note">Shipping records are generated from the Shipping workflow. Manual Shipping Log creation stays disabled here.</div>
      <div class="table-wrap"><table>
        <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="${headers.length}" class="empty">No shipments logged yet. Mark a PO shipped on the Shipping page to create one.</td></tr>` :
            rows.map(r => {
              const items = (r.items || []).filter(it => it.qty);
              const itemsHtml = items.length ? items.map(it => {
                const p = getProduct(it.productId);
                return `<div style="font-size:12px">${escapeHtml(p?.sku || p?.name || '-')} <span style="color:var(--brown-light)">&times;${escapeHtml(String(it.qty))}</span>${it.lot?' <span class="pill">'+escapeHtml(it.lot)+'</span>':''}</div>`;
              }).join('') : '<span style="color:var(--brown-light);font-size:12px">-</span>';
              return `<tr>
                <td><strong>${escapeHtml(r.shipId||'')}</strong></td>
                <td>${fmtDate(r.date)}</td>
                <td>${escapeHtml(r.poId||'-')}</td>
                <td>${escapeHtml(getCustomer(r.customerId)?.name || '-')}</td>
                <td>${r.brand?'<span class="pill">'+escapeHtml(r.brand)+'</span>':'-'}</td>
                <td>${escapeHtml(r.carrier||'-')}</td>
                <td>${escapeHtml(r.bol||'-')}</td>
                <td>${escapeHtml(r.proNumber||'-')}</td>
                <td>${r.pallets||0}</td>
                <td>${r.weight?escapeHtml(String(r.weight))+' lb':'-'}</td>
                <td>${itemsHtml}</td>
                <td class="row-actions">
                  ${r._backendId ? '<span style="font-size:12px;color:var(--brown-light)">Backend</span>' : `<button class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="deleteShippingLog('${r.id}')">Delete</button>`}
                </td>
              </tr>`;
            }).join('')
          }
        </tbody>
      </table></div>
    </div>
    </div>
  `;
}
async function deleteShippingLog(id) {
  const ok = await openConfirmModal({
    title: 'Delete shipping log',
    record: id,
    message: 'Delete this shipping log record?',
    risk: 'This does not affect the related PO, but removes the log row from Inventory.',
    confirmLabel: 'Delete Shipping Log',
    tone: 'danger'
  });
  if (!ok) return;
  state.shippingLog = (state.shippingLog || []).filter(x => x.id !== id);
  saveState();
  router('inventory');
  toast('Shipping record deleted.');
}

let ingEditingLots = [];
let pendingInventoryCoaFile = null;
function editIngredient(id) {
  const defaultCat = (invTab && invTab !== 'Master List') ? invTab : 'Ingredient';
  const i = state.ingredients.find(x=>x.id===id) || { id: uid('i'), name:'', supplierId:'', stock:0, reorderLevel:0, unit:'lb', cost:0, category: defaultCat, customerId: 'general', leadTimeDays: 0, building: '', location: '', lotNumber: '', coa: null, lots: [] };
  const isNew = !id;
  const cat = i.category || 'Ingredient';
  ingEditingLots = Array.isArray(i.lots) && i.lots.length
    ? i.lots.map(l => ({ ...l }))
    : [{ lotNumber: i.lotNumber||'', building: i.building||'', location: i.location||'', qty: i.stock||0 }];
  const masterOpts = (state.masterItems || []).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const nameInMaster = i.name && masterOpts.some(m => m.name === i.name);
  openModal((isNew?'Add':'Edit')+' Inventory Item', `
    <form onsubmit="event.preventDefault();saveIngredient('${i.id}', ${isNew})">
      <div class="form-grid">
        <div class="form-row"><label>Item</label>
          ${masterOpts.length ? `
            <select id="ing_name" required onchange="masterItemSelected()">
              <option value="">- Select from Master List -</option>
              ${masterOpts.map(m=>`<option value="${escapeHtml(m.name)}" data-uom="${escapeHtml(m.uom||'')}" data-customer="${escapeHtml(m.customerId||'general')}" ${i.name===m.name?'selected':''}>${escapeHtml(m.name)}</option>`).join('')}
              ${(i.name && !nameInMaster) ? `<option value="${escapeHtml(i.name)}" selected>${escapeHtml(i.name)} (not in Master List)</option>` : ''}
            </select>
            <div class="help-text">Item names come from the <strong>Master List</strong> tab. Picking one fills in its unit &amp; customer.</div>
          ` : `
            <input type="hidden" id="ing_name" value="${escapeHtml(i.name)}" />
            <div class="help-text" style="color:#a0470c">No items in the <strong>Master List</strong> yet. Add the item there first, then come back to stock it.</div>
          `}
        </div>
        <div class="form-row"><label>Category</label>
          <select id="ing_category" onchange="toggleIngredientFields()">
            <option ${cat==='Finished Good'?'selected':''}>Finished Good</option>
            <option ${cat==='Ingredient'?'selected':''}>Ingredient</option>
            <option ${cat==='Packaging'?'selected':''}>Packaging</option>
          </select>
        </div>
        <div class="form-row"><label>Supplier</label>
          <select id="ing_supplier">
            <option value="">- Select -</option>
            ${state.suppliers.map(s=>`<option value="${s.id}" ${i.supplierId===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row" id="ing_customer_row">
          <label>Customer</label>
          <select id="ing_customer">
            <option value="general" ${(!i.customerId || i.customerId==='general')?'selected':''}>General (used by multiple customers)</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${i.customerId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <div class="help-text">Pick the customer this item is dedicated to, or leave on General if it's shared.</div>
        </div>
        <div class="form-row"><label>Unit</label><input id="ing_unit" value="${escapeHtml(i.unit)}" placeholder="lb, ea, gal..." /></div>
        <div class="form-row"><label>Reorder Level</label><input type="number" step="0.01" id="ing_reorder" value="${i.reorderLevel}" /></div>
        <div class="form-row" id="ing_lead_row">
          <label>Lead Time (days)</label>
          <input type="number" min="0" step="1" id="ing_lead" value="${i.leadTimeDays||0}" />
          <div class="help-text">Supplier lead time. Factored into reorder timing.</div>
        </div>
        <div class="form-row"><label>Unit Cost</label><input type="number" step="0.01" id="ing_cost" value="${i.cost}" /></div>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--beige-light);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:var(--brown);font-size:13px">Lots &amp; Locations</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addIngredientLot()">+ Add Lot / Location</button>
        </div>
        <div class="help-text" style="margin-bottom:6px">One product can be in multiple locations and carry multiple lot #s. On Hand is the sum of all entries.</div>
        <div id="ing_lots_list"></div>
      </div>
      <div class="form-row" id="ing_coa_row" style="margin-top:14px">
        <label>Certificate of Analysis (CoA)</label>
        <div class="file-upload">
          <input type="file" id="ing_coa_input" accept=".pdf,.doc,.docx,image/*" onchange="ingredientCoaSelected(event)" />
          <div class="file-info ${i.coa?'has':''}" id="ing_coa_info">
            ${i.coa ? `&#128206; ${escapeHtml(i.coa.name)} (${Math.round((i.coa.size||0)/1024)} KB)` : 'No CoA uploaded.'}
          </div>
          ${i.coa ? `<button type="button" class="btn btn-icon btn-sm" onclick="clearIngredientCoa()">Remove</button>` : ''}
        </div>
        <input type="hidden" id="ing_coa_data" value='${i.coa ? JSON.stringify(i.coa).replace(/'/g,"&#039;") : ""}' />
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${isNew?'Add Item':'Save Changes'}</button>
      </div>
    </form>
  `);
  renderIngredientLots();
  toggleIngredientFields();
}
function renderIngredientLots() {
  const cont = document.getElementById('ing_lots_list');
  if (!cont) return;
  if (!ingEditingLots.length) ingEditingLots.push({ lotNumber:'', building:'', location:'', qty:0 });
  const grid = 'grid-template-columns:1.3fr 1fr 1.3fr 0.8fr 40px';
  const total = ingEditingLots.reduce((s,l)=>s+(parseFloat(l.qty)||0),0);
  cont.innerHTML = `
    <div class="po-line" style="${grid};font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>Lot #</div><div>Building</div><div>Location</div><div>Qty</div><div></div>
    </div>
    ${ingEditingLots.map((l, i) => `
      <div class="po-line" style="${grid}">
        <input type="text" value="${escapeHtml(l.lotNumber||'')}" placeholder="Lot #" onchange="ingLotChange(${i},'lotNumber',this.value)" />
        <select onchange="ingLotChange(${i},'building',this.value)">
          <option value="">- Building -</option>
          ${BUILDINGS.map(b=>`<option ${l.building===b?'selected':''}>${escapeHtml(b)}</option>`).join('')}
        </select>
        <input type="text" value="${escapeHtml(l.location||'')}" placeholder="e.g. A-12, Rack 3" onchange="ingLotChange(${i},'location',this.value)" />
        <input type="number" step="0.01" min="0" value="${l.qty!=null?l.qty:''}" placeholder="0" onchange="ingLotChange(${i},'qty',this.value); renderIngredientLots();" />
        <button type="button" onclick="removeIngredientLot(${i})">&times;</button>
      </div>
    `).join('')}
    <div style="text-align:right;margin-top:6px;font-size:13px;color:var(--brown-light)">Total On Hand: <strong style="color:var(--brown)">${total}</strong></div>
  `;
}
function addIngredientLot() {
  ingEditingLots.push({ lotNumber:'', building:'', location:'', qty:0 });
  renderIngredientLots();
}
function removeIngredientLot(i) {
  ingEditingLots.splice(i, 1);
  if (!ingEditingLots.length) ingEditingLots.push({ lotNumber:'', building:'', location:'', qty:0 });
  renderIngredientLots();
}
function ingLotChange(i, field, value) {
  if (field === 'qty') value = parseFloat(value) || 0;
  ingEditingLots[i][field] = value;
}
function ingredientCoaSelected(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  pendingInventoryCoaFile = f;
  const reader = new FileReader();
  reader.onload = () => {
    const data = { name: f.name, type: f.type, size: f.size, dataUrl: reader.result };
    document.getElementById('ing_coa_data').value = JSON.stringify(data);
    const info = document.getElementById('ing_coa_info');
    info.innerHTML = `&#128206; ${escapeHtml(f.name)} (${Math.round(f.size/1024)} KB)`;
    info.classList.add('has');
  };
  reader.readAsDataURL(f);
}
function clearIngredientCoa() {
  pendingInventoryCoaFile = null;
  document.getElementById('ing_coa_data').value = '';
  document.getElementById('ing_coa_input').value = '';
  const info = document.getElementById('ing_coa_info');
  info.textContent = 'No CoA uploaded.';
  info.classList.remove('has');
}
// When an item is picked from the Master List, fill in its unit & customer.
function masterItemSelected() {
  const sel = document.getElementById('ing_name');
  if (!sel || !sel.options) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const uom = opt.getAttribute('data-uom');
  const cust = opt.getAttribute('data-customer');
  const unitEl = document.getElementById('ing_unit');
  if (unitEl && uom) unitEl.value = uom === 'LBS' ? 'lb' : (uom === 'Each' ? 'ea' : unitEl.value);
  const custEl = document.getElementById('ing_customer');
  if (custEl && cust) custEl.value = cust;
}
function toggleIngredientFields() {
  const cat = document.getElementById('ing_category')?.value || 'Ingredient';
  const customerRow = document.getElementById('ing_customer_row');
  const leadRow = document.getElementById('ing_lead_row');
  const coaRow = document.getElementById('ing_coa_row');
  // Customer: show for all categories now (General by default)
  if (customerRow) customerRow.style.display = 'flex';
  // Lead Time: show for Ingredient and Packaging
  if (leadRow) leadRow.style.display = (cat === 'Ingredient' || cat === 'Packaging') ? 'flex' : 'none';
  // CoA: ingredients only
  if (coaRow) coaRow.style.display = (cat === 'Ingredient') ? 'flex' : 'none';
}
async function saveIngredient(id, isNew) {
  const cat = document.getElementById('ing_category').value;
  const itemName = (document.getElementById('ing_name').value || '').trim();
  if (!itemName) { toast('Pick an Item from the Master List. Add it on the Master List tab first if it isn\'t there.'); return; }
  // collect lots & locations (drop fully-empty rows)
  const lots = ingEditingLots
    .map(l => ({ lotNumber:(l.lotNumber||'').trim(), building:l.building||'', location:(l.location||'').trim(), qty: parseFloat(l.qty)||0 }))
    .filter(l => l.lotNumber || l.building || l.location || l.qty);
  if (lots.length === 0) lots.push({ lotNumber:'', building:'', location:'', qty:0 });
  const data = {
    id,
    name: itemName,
    category: cat,
    supplierId: document.getElementById('ing_supplier').value,
    customerId: document.getElementById('ing_customer').value || 'general',
    unit: document.getElementById('ing_unit').value,
    reorderLevel: parseFloat(document.getElementById('ing_reorder').value) || 0,
    leadTimeDays: (cat === 'Ingredient' || cat === 'Packaging') ? (parseInt(document.getElementById('ing_lead').value, 10) || 0) : 0,
    cost: parseFloat(document.getElementById('ing_cost').value) || 0,
    lots
  };
  // sync total stock + primary lot/building/location from the lots array
  data.stock = lots.reduce((s,l)=>s+(parseFloat(l.qty)||0),0);
  data.lotNumber = lots[0].lotNumber || '';
  data.building = lots[0].building || '';
  data.location = lots[0].location || '';
  // CoA: ingredients only
  let coa = null;
  const coaData = document.getElementById('ing_coa_data')?.value;
  if (cat === 'Ingredient' && coaData) { try { coa = JSON.parse(coaData); } catch(e){} }
  data.coa = coa;
  const existing = state.ingredients.find(i=>i.id===id);
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  try {
    const saved = await saveBackendInventoryItem(id, isNew, { ...data, _backendId: existing?._backendId });
    data.id = saved.id;
    data._backendId = saved.id;
    data.masterItemId = saved.masterItemId;
    if (pendingInventoryCoaFile) await uploadBackendInventoryCoa(saved.id, pendingInventoryCoaFile);
    pendingInventoryCoaFile = null;
    backendInventoryState.status = 'connected';
    backendInventoryState.loaded = false;
    backendInventoryState.lastError = '';
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
    return;
  }
  if (isNew) state.ingredients.push(data);
  else Object.assign(state.ingredients.find(i=>i.id===id), data);
  try { saveState(); }
  catch(err) { toast('Storage full - try a smaller CoA file.'); return; }
  closeModal();
  invTab = cat;
  router('inventory');
  toast('Inventory item saved.');
}
async function deleteIngredient(id) {
  const item = getIngredient(id);
  if (employeeBackendSessionActive()) {
    return failBackendRequiredWrite(null, backendInventoryState, 'Inventory item delete requires backend archive support. Nothing was saved locally.');
  }
  const ok = await openConfirmModal({
    title: 'Delete inventory item',
    record: item?.name || id,
    message: 'Delete this inventory item from the current workspace?',
    risk: 'This can affect low-stock, allocation, and procurement visibility in local/demo mode.',
    confirmLabel: 'Delete Item',
    tone: 'danger'
  });
  if (!ok) return;
  state.ingredients = state.ingredients.filter(i => i.id !== id);
  saveState();
  router('inventory');
  toast('Item deleted.');
}
function adjustStock(id) {
  const i = state.ingredients.find(x=>x.id===id);
  if (!i) return;
  const lots = Array.isArray(i.lots) && i.lots.length ? i.lots : [{ lotNumber: i.lotNumber||'', building: i.building||'', location: i.location||'', qty: i.stock||0 }];
  openModal('Adjust Stock - '+escapeHtml(i.name), `
    <p style="margin:0 0 10px;font-size:13px;color:var(--brown-light)">Update the quantity at each lot / location. Total On Hand updates automatically.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Lot #</th><th>Building</th><th>Location</th><th style="width:120px">Qty</th></tr></thead>
      <tbody>
        ${lots.map((l, idx) => `<tr>
          <td>${l.lotNumber ? '<span class="pill">'+escapeHtml(l.lotNumber)+'</span>' : '-'}</td>
          <td>${escapeHtml(l.building||'-')}</td>
          <td>${escapeHtml(l.location||'-')}</td>
          <td><input type="number" step="0.01" min="0" id="adj_qty_${idx}" value="${l.qty ?? l.quantity ?? 0}" style="width:100%;padding:6px 8px;border:1px solid var(--grey);border-radius:4px" /></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="form-row" style="margin-top:10px"><label>Reason</label>
      <select id="adj_reason">
        <option>Received from supplier</option>
        <option>Cycle count correction</option>
        <option>Damaged / Loss</option>
        <option>Other</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="doAdjust('${id}')">Apply</button>
    </div>
  `);
}
async function doAdjust(id) {
  const i = state.ingredients.find(x=>x.id===id);
  if (!i) return;
  if (!requireEmployeeBackendWrite(backendInventoryState)) return;
  if (!i._backendId) return failBackendRequiredWrite(null, backendInventoryState, 'Inventory adjustment requires backend confirmation. Nothing was saved locally.');
  const draft = {
    ...i,
    lots: (Array.isArray(i.lots) && i.lots.length ? i.lots : [{ lotNumber: i.lotNumber||'', building: i.building||'', location: i.location||'', qty: i.stock||0 }])
      .map(lot => ({ ...lot }))
  };
  draft.lots.forEach((l, idx) => {
    const inp = document.getElementById('adj_qty_'+idx);
    if (inp) {
      const qty = parseFloat(inp.value) || 0;
      l.qty = qty;
      l.quantity = qty;
    }
  });
  syncItemLots(draft);
  try {
    const saved = await saveBackendInventoryItem(id, false, draft);
    Object.assign(i, backendInventoryItemToLocalIngredient(saved, i));
    backendInventoryState.status = 'connected';
    backendInventoryState.loaded = false;
    backendInventoryState.lastError = '';
    saveState();
    closeModal();
    router('inventory');
    toast('Stock updated in backend.');
  } catch (error) {
    failBackendRequiredWrite(error, backendInventoryState);
  }
}

