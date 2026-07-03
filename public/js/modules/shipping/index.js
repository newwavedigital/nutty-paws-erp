/* =========================================================================
   SHIPPING
   ========================================================================= */
function renderShipping(el) {
  if (backendAuthState.token && backendAuthState.user?.userType !== 'customer' && !backendShippingState.loaded && !backendShippingState.loading) {
    loadBackendShipping().then(() => { if (currentPage === 'shipping') router('shipping'); });
  }
  const ship = state.purchaseOrders.filter(p => p.status === 'shipping' || p.status === 'completed');
  const open = ship.filter(p => p.status === 'shipping');
  const done = ship.filter(p => p.status === 'completed');
  const openExternal = open.filter(p => !isInternalBrand(p));
  const openInternal = open.filter(p => isInternalBrand(p));
  el.innerHTML = `
    ${renderBackendShippingBanner()}
    <div class="card">
      <div class="card-header">
        <h2>Ready to Ship</h2>
        <span style="font-size:13px;color:var(--brown-light)">${openExternal.length} order(s) for external customers</span>
      </div>
      ${openExternal.length === 0
        ? '<div class="empty">No external POs awaiting shipment.</div>'
        : openExternal.map(p => shippingCardHtml(p)).join('')
      }
    </div>

    <div class="card">
      <div class="card-header">
        <h2>To Stock in Warehouse</h2>
        <span style="font-size:13px;color:var(--brown-light)">${openInternal.length} internal-brand run(s)</span>
      </div>
      <div class="help-text" style="margin-bottom:8px">Internal-brand POs (Bnutty, Dilly's, Poochie Butter) don't ship &mdash; they go to the warehouse to stock the shelves. Confirm to mark complete.</div>
      ${openInternal.length === 0
        ? '<div class="empty">No internal-brand runs to stock.</div>'
        : openInternal.map(p => warehouseStockCardHtml(p)).join('')
      }
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Shipped / Stocked / Completed</h2>
        <button class="btn btn-secondary btn-sm" onclick="exportShipments()">Export CSV</button>
      </div>
      ${done.length === 0
        ? '<div class="empty">No completed orders yet.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>PO</th><th>Type</th><th>Customer / Brand</th><th>Units</th><th>Cases</th><th>BOL #</th><th>Carrier</th><th>Pallets</th><th></th></tr></thead>
            <tbody>
            ${done.map(p => {
              const internal = isInternalBrand(p);
              return `<tr>
                <td><strong>${p.id}</strong></td>
                <td>${internal ? '<span class="badge badge-prod">Stocked</span>' : '<span class="badge badge-shipping">Shipped</span>'}</td>
                <td>${escapeHtml(getCustomer(p.customerId)?.name||'')}${p.brand ? ' <span class="pill">'+escapeHtml(p.brand)+'</span>' : ''}</td>
                <td>${poTotalUnits(p) || '-'}</td>
                <td>${poTotalCases(p) || '-'}</td>
                <td>${internal ? '-' : escapeHtml(p.shipping?.bol||'-')}</td>
                <td>${internal ? '-' : escapeHtml(p.shipping?.carrier||'-')}</td>
                <td>${internal ? '-' : (shipPalletCount(p.shipping)||'-')}</td>
                <td>${internal ? '' : `<button class="btn btn-icon btn-sm" onclick="printDocuments('${p.id}')">Print Docs</button>`}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}
function productionTotalsHtml(p) {
  const units = poTotalUnits(p);
  const cases = poTotalCases(p);
  const lines = p.lines || [];
  const lotPills = lines
    .filter(l => l.lotNumber)
    .map(l => {
      const prod = getProduct(l.productId);
      return `<span class="pill" title="${escapeHtml(prod?.sku||'')}">${escapeHtml(l.lotNumber)}</span>`;
    }).join('');
  return `
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
      <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Units Produced</div>
        <div style="font-size:20px;font-weight:700;color:var(--brown)">${units || '-'}</div>
      </div>
      <div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Cases Produced</div>
        <div style="font-size:20px;font-weight:700;color:var(--brown)">${cases || '-'}</div>
      </div>
      ${lotPills ? `<div style="background:var(--white);border:1px solid var(--grey-light);border-radius:6px;padding:8px 14px;min-width:130px">
        <div style="font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">Lots</div>
        <div style="margin-top:3px">${lotPills}</div>
      </div>` : ''}
    </div>
  `;
}
function shipPalletList(p) {
  // ensure a palletList exists; migrate from old single-pallet fields if needed
  const s = p.shipping = p.shipping || {};
  if (!Array.isArray(s.palletList)) {
    if (s.length || s.width || s.height || s.weight) {
      s.palletList = [{ length: s.length||0, width: s.width||0, height: s.height||0, weight: s.weight||0 }];
    } else {
      s.palletList = [{ length:0, width:0, height:0, weight:0 }];
    }
  }
  if (s.palletList.length === 0) s.palletList.push({ length:0, width:0, height:0, weight:0 });
  return s.palletList;
}
function shipPalletRowsHtml(p) {
  const pallets = shipPalletList(p);
  const totalWt = pallets.reduce((sum, pl) => sum + (parseFloat(pl.weight)||0), 0);
  return `
    <div class="po-line" style="grid-template-columns:40px 1fr 1fr 1fr 1fr 40px;font-size:11px;color:var(--brown-light);text-transform:uppercase;font-weight:600">
      <div>#</div><div>Length (in)</div><div>Width (in)</div><div>Height (in)</div><div>Weight (lb)</div><div></div>
    </div>
    <div id="sh_pallets_${p.id}">
      ${pallets.map((pl, i) => `
        <div class="po-line pallet-row" style="grid-template-columns:40px 1fr 1fr 1fr 1fr 40px">
          <div style="text-align:center;font-weight:600;color:var(--brown)">${i+1}</div>
          <input type="number" step="0.1" min="0" value="${pl.length||''}" />
          <input type="number" step="0.1" min="0" value="${pl.width||''}" />
          <input type="number" step="0.1" min="0" value="${pl.height||''}" />
          <input type="number" step="0.1" min="0" value="${pl.weight||''}" />
          <button type="button" onclick="removeShippingPallet('${p.id}',${i})">&times;</button>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <button type="button" class="btn btn-secondary btn-sm" onclick="addShippingPallet('${p.id}')">+ Add Pallet</button>
      <div style="font-size:12px;color:var(--brown-light)">${pallets.length} pallet${pallets.length===1?'':'s'} &middot; <strong style="color:var(--brown)">${totalWt.toFixed(1)} lb total</strong></div>
    </div>
  `;
}
function shippingCardHtml(p) {
  const s = p.shipping || {};
  const cust = getCustomer(p.customerId);
  const docState = shippingDocumentState(p);
  const hasDocs = docState.ready;
  return `
    <div class="card" style="background:var(--beige-light)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0">${p.id} - ${escapeHtml(cust?.name||'')}</h3>
          <div style="font-size:12px;color:var(--brown-light)">${p.brand ? '<span class="pill">'+escapeHtml(p.brand)+'</span> ' : ''}Produced ${fmtDate(p.productionDate)}${p.productionEndDate && p.productionEndDate !== p.productionDate ? ' &rarr; ' + fmtDate(p.productionEndDate) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${docState.localOnly ? '<span class="badge badge-low">Local only</span>' : ''}${statusBadge(p.status)}</div>
      </div>
      ${productionTotalsHtml(p)}
      ${docState.localOnly ? '<div class="inv-check" style="margin-top:10px"><strong>Local-only row.</strong> This shipment is not attached to a backend PO, so live save and ship actions stay disabled.</div>' : ''}
      <fieldset ${docState.localOnly ? 'disabled' : ''} style="border:0;padding:0;margin:0">
        <div class="form-grid" style="margin-top:12px">
          <div class="form-row"><label>BOL #</label><input id="sh_bol_${p.id}" value="${escapeHtml(s.bol||'')}" /></div>
          <div class="form-row"><label>Pro #</label><input id="sh_pro_${p.id}" value="${escapeHtml(s.proNumber||'')}" /></div>
          <div class="form-row"><label>Carrier</label><input id="sh_carrier_${p.id}" value="${escapeHtml(s.carrier||'')}" /></div>
          <div class="form-row"><label>Freight Class</label><input id="sh_class_${p.id}" value="${escapeHtml(s.freightClass||'')}" /></div>
        </div>
        <div style="margin-top:14px;padding:12px;background:var(--white);border:1px solid var(--grey-light);border-radius:8px">
          <strong style="color:var(--brown);font-size:13px">Pallets</strong>
          <div class="help-text" style="margin-bottom:6px">Add a line per pallet - each can have its own dimensions and weight.</div>
          ${shipPalletRowsHtml(p)}
        </div>
        <div class="form-row" style="margin-top:14px">
          <label>Shipment Documents <span class="badge ${docState.confirmedId ? 'badge-prod' : 'badge-low'}">${docState.confirmedId ? 'Uploaded' : docState.pending ? 'Pending upload' : docState.localOnly ? 'Local only' : 'Required to ship'}</span></label>
          <div class="file-upload">
            <input type="file" id="sh_docs_input_${p.id}" accept=".pdf,.doc,.docx,image/*" onchange="shipDocsSelected(event,'${p.id}')" />
            <div class="file-info ${hasDocs?'has':''}" id="sh_docs_info_${p.id}">
              ${docState.confirmedId
                ? `&#128206; ${escapeHtml(s.documents?.name || 'shipment-document')} (${Math.round((s.documents?.size||0)/1024)} KB)`
                : docState.pending
                  ? `&#128206; ${escapeHtml(docState.pending.name)} (${Math.round((docState.pending.size||0)/1024)} KB) pending upload`
                  : docState.localOnly
                    ? 'This copy is local only and is not attached to the backend.'
                    : 'No backend shipment document uploaded. Required before marking shipped.'}
            </div>
            ${docState.confirmedId && s.documents ? shippingFileDownloadHtml(s.documents) : ''}
            ${docState.pending ? `<button type="button" class="btn btn-icon btn-sm" style="color:var(--danger)" onclick="clearShipDocs('${p.id}')">Remove</button>` : ''}
          </div>
        </div>
        <div class="form-row" style="margin-top:10px">
          <label>Shipping Notes</label>
          <textarea id="sh_notes_${p.id}">${escapeHtml(s.notes||'')}</textarea>
        </div>
      </fieldset>
      <div class="form-actions" style="flex-wrap:wrap">
        <button class="btn btn-icon" onclick="viewPO('${p.id}')">View PO</button>
        <button class="btn btn-icon" onclick="printPackingSlip('${p.id}')">Print Packing Slip</button>
        <button class="btn btn-dark" onclick="printDocuments('${p.id}')">Print Documents</button>
        <button class="btn btn-secondary" ${docState.localOnly ? 'disabled title="This shipment is local-only and cannot be saved back to the backend"' : ''} onclick="saveShipping('${p.id}')">Save</button>
        <button class="btn" ${hasDocs && !docState.localOnly ? '' : 'disabled title="Upload shipment documents before marking shipped"'} onclick="completeShipment('${p.id}')">Mark Shipped &rarr; Complete</button>
      </div>
    </div>
  `;
}
function addShippingPallet(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  captureShippingForm(po);          // preserve current input
  shipPalletList(po).push({ length:0, width:0, height:0, weight:0 });
  saveState();
  router('shipping');
}
function removeShippingPallet(id, idx) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  captureShippingForm(po);
  const list = shipPalletList(po);
  if (list.length > 1) list.splice(idx, 1);
  saveState();
  router('shipping');
}
function readShippingForm(po) {
  const id = po.id;
  const shipping = { ...(po.shipping || {}) };
  const g = (sel) => document.getElementById(sel);
  if (g('sh_bol_'+id)) shipping.bol = g('sh_bol_'+id).value;
  if (g('sh_pro_'+id)) shipping.proNumber = g('sh_pro_'+id).value;
  if (g('sh_carrier_'+id)) shipping.carrier = g('sh_carrier_'+id).value;
  if (g('sh_class_'+id)) shipping.freightClass = g('sh_class_'+id).value;
  if (g('sh_notes_'+id)) shipping.notes = g('sh_notes_'+id).value;
  const cont = document.getElementById('sh_pallets_'+id);
  if (cont) {
    const pallets = [];
    cont.querySelectorAll('.pallet-row').forEach(row => {
      const inputs = row.querySelectorAll('input');
      pallets.push({
        length: parseFloat(inputs[0].value)||0,
        width: parseFloat(inputs[1].value)||0,
        height: parseFloat(inputs[2].value)||0,
        weight: parseFloat(inputs[3].value)||0
      });
    });
    if (pallets.length) shipping.palletList = pallets;
  }
  return shipping;
}
// Read the visible form fields into the PO's shipping object (without clobbering documents)
function captureShippingForm(po) {
  po.shipping = readShippingForm(po);
}
function shipDocsSelected(e, id) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB).'); e.target.value=''; return; }
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  captureShippingForm(po);
  pendingShipmentDocumentFiles.set(id, f);
  toast('Shipment document selected. Save or mark shipped to upload it to the backend.');
  router('shipping');
}
function clearShipDocs(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  captureShippingForm(po);
  pendingShipmentDocumentFiles.delete(id);
  router('shipping');
}

function warehouseStockCardHtml(p) {
  const cust = getCustomer(p.customerId);
  return `
    <div class="card" style="background:var(--beige-light);border-left:4px solid var(--brown)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0">${p.id} - ${escapeHtml(p.brand||'')}</h3>
          <div style="font-size:12px;color:var(--brown-light)">${escapeHtml(cust?.name||'')} &middot; Produced ${fmtDate(p.productionDate)}${p.productionEndDate && p.productionEndDate !== p.productionDate ? ' &rarr; ' + fmtDate(p.productionEndDate) : ''}</div>
        </div>
        <div><span class="badge badge-supply">Internal Brand</span></div>
      </div>
      ${productionTotalsHtml(p)}
      <div class="form-row" style="margin-top:12px">
        <label>Warehouse Notes (optional)</label>
        <textarea id="sh_notes_${p.id}" placeholder="Stock location, special handling, etc.">${escapeHtml(p.shipping?.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-icon" onclick="viewPO('${p.id}')">View PO</button>
        <button class="btn btn-secondary" onclick="saveWarehouseNotes('${p.id}')">Save Notes</button>
        <button class="btn" style="background:var(--success)" onclick="confirmStocked('${p.id}')">&#10003; Confirm Stocked to Warehouse</button>
      </div>
    </div>
  `;
}
async function saveWarehouseNotes(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  po.shipping = po.shipping || {};
  po.shipping.notes = document.getElementById('sh_notes_'+id).value;
  if (!requireEmployeeBackendWrite(backendShippingState)) return;
  if (!po._backendId) return failBackendRequiredWrite(null, backendShippingState, 'Warehouse notes require backend confirmation. Nothing was saved locally.');
  try {
    await saveBackendShippingDetails(po);
    backendShippingState.status = 'connected';
    backendShippingState.lastError = '';
    saveState();
    toast('Warehouse notes saved to backend.');
  } catch (error) {
    failBackendRequiredWrite(error, backendShippingState);
  }
}

function shippingFileDownloadHtml(file) {
  const name = file?.name || file?.fileName || 'shipment-document';
  return backendFileActionHtml(file, {
    className: 'btn btn-icon btn-sm',
    style: 'text-decoration:none',
    label: 'Download',
    unavailableHtml: `<span class="pill" title="Backend file unavailable">${escapeHtml(name)}</span>`
  });
}

function shippingDocumentState(po) {
  const confirmedId = shippingShipmentDocumentFileId(po);
  const pending = pendingShipmentDocumentFiles.get(po?.id || '') || null;
  const localOnly = !!po?.shipping?.documents && !confirmedId && !pending;
  return {
    confirmedId,
    pending,
    localOnly,
    ready: !!confirmedId || !!pending
  };
}
async function confirmStocked(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  const ok = await openConfirmModal({
    title: 'Confirm warehouse stocking',
    record: `${id} - ${po.brand}`,
    message: 'Mark this internal-brand order as stocked to the warehouse and complete?',
    risk: 'This changes the order status to completed and removes it from the active Shipping queue.',
    confirmLabel: 'Confirm Stocked',
    tone: 'workflow'
  });
  if (!ok) return;
  const shipping = readShippingForm(po);
  if (!requireEmployeeBackendWrite(backendShippingState)) return;
  if (!po._backendId) return failBackendRequiredWrite(null, backendShippingState, 'This shipment is not backend-backed. Nothing was saved locally.');
  try {
    await markBackendStocked({ ...po, shipping });
    po.shipping = shipping;
    backendShippingState.status = 'connected';
    backendShippingState.lastError = '';
    router('shipping');
    toast(`${id} stocked to warehouse in backend.`);
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendShippingState);
    router('shipping');
    return;
  }
}
async function saveShipping(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  const shipping = readShippingForm(po);
  if (!requireEmployeeBackendWrite(backendShippingState)) return;
  if (!po?._backendId) return failBackendRequiredWrite(null, backendShippingState, 'This shipment is not backend-backed. Nothing was saved locally.');
  try {
    const pendingFile = pendingShipmentDocumentFiles.get(id);
    if (pendingFile) {
      const uploaded = await uploadBackendShipmentDocument(shippingPurchaseOrderBackendId(po), pendingFile);
      shipping.documents = mapBackendFileToPrototype(uploaded);
      shipping.shipmentDocumentFileId = uploaded?.id || '';
      pendingShipmentDocumentFiles.delete(id);
    } else if (shipping.documents && !shippingShipmentDocumentFileId({ ...po, shipping })) {
      shipping.documents = null;
      throw new Error('Shipment document must be reselected so it can be uploaded to the backend.');
    }
    await saveBackendShippingDetails({ ...po, shipping });
    po.shipping = shipping;
    backendShippingState.status = 'connected';
    backendShippingState.lastError = '';
    saveState();
    toast(`Shipping info saved to backend for ${id}.`);
    return;
  } catch (error) {
    failBackendRequiredWrite(error, backendShippingState);
    return;
  }
}
async function completeShipment(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  const shipping = readShippingForm(po);
  const s = shipping || {};
  const pendingFile = pendingShipmentDocumentFiles.get(id);
  const confirmedDocumentId = shippingShipmentDocumentFileId(po);
  if (!confirmedDocumentId && !pendingFile) {
    toast('Upload shipment documents before marking shipped.');
    return;
  }
  if (!s.bol || !s.carrier) {
    const ok = await openConfirmModal({
      title: 'Ship with missing details',
      record: id,
      message: 'BOL # or Carrier is missing. Mark this shipment complete anyway?',
      risk: 'The order will be completed, but shipping records may need cleanup later.',
      confirmLabel: 'Mark Shipped',
      tone: 'workflow'
    });
    if (!ok) return;
  }
  if (!requireEmployeeBackendWrite(backendShippingState)) return;
  if (!po._backendId) return failBackendRequiredWrite(null, backendShippingState, 'This shipment is not backend-backed. Nothing was saved locally.');
  try {
    if (pendingFile) {
      const uploaded = await uploadBackendShipmentDocument(shippingPurchaseOrderBackendId(po), pendingFile);
      shipping.documents = mapBackendFileToPrototype(uploaded);
      shipping.shipmentDocumentFileId = uploaded?.id || '';
      pendingShipmentDocumentFiles.delete(id);
    } else if (s.documents && !confirmedDocumentId) {
      shipping.documents = null;
      throw new Error('Shipment document must be reselected so it can be uploaded to the backend.');
    }
    await saveBackendShippingDetails({ ...po, shipping });
    await markBackendShipped({ ...po, shipping });
    po.shipping = shipping;
    backendShippingState.status = 'connected';
    backendShippingState.lastError = '';
    router('shipping');
    toast(`${id} marked as shipped in backend. Added to Shipping Log.`);
    return;
  } catch (error) {
    if (isBackendMissingCarrierBolWarning(error)) {
      const ok = await openConfirmModal({
        title: 'Ship with missing backend details',
        record: id,
        message: 'The backend reported a missing BOL # or Carrier. Mark this shipment complete anyway?',
        risk: 'The backend order will be completed, but shipping records may need cleanup later.',
        confirmLabel: 'Mark Shipped',
        tone: 'workflow'
      });
      if (!ok) return;
      try {
        await markBackendShipped(po, { confirmMissingCarrierBol: true });
        backendShippingState.status = 'connected';
        backendShippingState.lastError = '';
        router('shipping');
        toast(`${id} marked as shipped in backend. Added to Shipping Log.`);
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    failBackendRequiredWrite(error, backendShippingState);
    router('shipping');
    return;
  }
}
// totals helpers for a shipping object
function shipTotalWeight(s) { return (s?.palletList||[]).reduce((sum,pl)=>sum+(parseFloat(pl.weight)||0),0); }
function shipPalletCount(s) { return (s?.palletList||[]).length; }
function exportShipments() {
  const rows = state.purchaseOrders
    .filter(p => p.status === 'completed' || p.status === 'shipping')
    .map(p => ({
      PO: p.id,
      Customer: getCustomer(p.customerId)?.name || '',
      Status: p.status,
      Production_Date: p.productionDate || '',
      BOL: p.shipping?.bol || '',
      Pro_Number: p.shipping?.proNumber || '',
      Carrier: p.shipping?.carrier || '',
      Freight_Class: p.shipping?.freightClass || '',
      Pallets: shipPalletCount(p.shipping),
      Total_Weight_lb: shipTotalWeight(p.shipping),
      Documents: p.shipping?.documents ? 'Yes' : 'No'
    }));
  exportCsv('shipments.csv', rows);
}
// ---- shared print-section builders (used by Print Documents) ----
function bolSectionHtml(po) {
  const cust = getCustomer(po.customerId);
  const s = po.shipping || {};
  const pallets = s.palletList || [];
  const totalWt = shipTotalWeight(s);
  return `
    <div class="doc-page">
      <div class="head">
        <div><h1>BILL OF LADING</h1><div style="color:#8B5E3C">Nut House - Peanut Butter &amp; Dog Treat Co.</div></div>
        <div style="text-align:right">
          <div class="label">BOL #</div><div style="font-weight:700;font-size:18px">${escapeHtml(s.bol||'-')}</div>
          <div class="label" style="margin-top:6px">PRO #</div><div>${escapeHtml(s.proNumber||'-')}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">Shipper</div>
          <div style="font-weight:600">Nut House Manufacturing</div>
          <div>1234 Peanut Lane, Atlanta GA 30303</div>
        </div>
        <div class="box"><div class="label">Consignee</div>
          <div style="font-weight:600">${escapeHtml(cust?.name||'')}</div>
          <div>${escapeHtml(cust?.address||'')}</div>
          <div>${escapeHtml(cust?.phone||'')}</div>
        </div>
        <div class="box"><div class="label">Carrier</div><div>${escapeHtml(s.carrier||'-')}</div>
          <div class="label" style="margin-top:6px">Freight Class</div><div>${escapeHtml(s.freightClass||'-')}</div>
        </div>
        <div class="box"><div class="label">Shipment Totals</div>
          <div>${pallets.length} pallet${pallets.length===1?'':'s'} &middot; ${totalWt.toFixed(1)} lb total</div>
        </div>
      </div>
      <h3 style="color:#5C3A21;margin:12px 0 4px">Pallet Detail</h3>
      <table>
        <thead><tr><th>Pallet #</th><th>Length (in)</th><th>Width (in)</th><th>Height (in)</th><th>Weight (lb)</th></tr></thead>
        <tbody>
          ${pallets.length ? pallets.map((pl,i)=>`<tr><td>${i+1}</td><td>${pl.length||'-'}</td><td>${pl.width||'-'}</td><td>${pl.height||'-'}</td><td>${pl.weight||'-'}</td></tr>`).join('')
            : '<tr><td colspan="5">No pallets entered</td></tr>'}
        </tbody>
        <tfoot><tr><th colspan="4" style="text-align:right">Total Weight</th><th>${totalWt.toFixed(1)} lb</th></tr></tfoot>
      </table>
      <h3 style="color:#5C3A21;margin:12px 0 4px">Contents</h3>
      <table>
        <thead><tr><th>SKU</th><th>Description</th><th>Qty</th></tr></thead>
        <tbody>
          ${po.lines.map(l => { const p=getProduct(l.productId); return `<tr><td>${escapeHtml(p?.sku||'')}</td><td>${escapeHtml(p?.name||'')}</td><td>${typeof l.actualQty==='number'?l.actualQty:l.qty}</td></tr>`; }).join('')}
        </tbody>
      </table>
      ${s.notes ? `<p style="margin-top:14px"><strong>Notes:</strong> ${escapeHtml(s.notes)}</p>`:''}
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12px">
        <div>Shipper Signature: ___________________________ Date: __________</div>
        <div>Carrier Signature: ___________________________ Date: __________</div>
      </div>
    </div>
  `;
}
function poSectionHtml(po) {
  const cust = getCustomer(po.customerId);
  const total = po.lines.reduce((s,l)=>s+l.qty*l.price,0);
  return `
    <div class="doc-page">
      <div class="head">
        <div><h1>PURCHASE ORDER</h1><div style="color:#8B5E3C">${escapeHtml(po.id)}${po.brand ? ' &middot; '+escapeHtml(po.brand):''}</div></div>
        <div style="text-align:right">
          <div class="label">PO Date</div><div>${fmtDate(po.poDate)}</div>
          <div class="label" style="margin-top:6px">Requested Ship</div><div>${fmtDate(po.requestedDate)}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">Customer</div>
          <div style="font-weight:600">${escapeHtml(cust?.name||'')}</div>
          <div>${escapeHtml(cust?.address||'')}</div>
        </div>
        <div class="box"><div class="label">Status</div><div>${(po.status||'').replace(/_/g,' ')}</div></div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${po.lines.map(l => { const p=getProduct(l.productId); return `<tr><td>${escapeHtml(p?.sku||'')}</td><td>${escapeHtml(p?.name||'')}</td><td>${l.qty}</td><td>${fmtMoney(l.price)}</td><td>${fmtMoney(l.qty*l.price)}</td></tr>`; }).join('')}
        </tbody>
        <tfoot><tr><th colspan="4" style="text-align:right">Total</th><th>${fmtMoney(total)}</th></tr></tfoot>
      </table>
      ${po.notes ? `<p style="margin-top:14px"><strong>PO Notes:</strong> ${escapeHtml(po.notes)}</p>`:''}
    </div>
  `;
}
function packingSlipSectionHtml(po) {
  const cust = getCustomer(po.customerId);
  const s = po.shipping || {};
  const totalUnits = poTotalUnits(po);
  const totalCases = poTotalCases(po);
  return `
    <div class="doc-page">
      <div class="head">
        <div><h1>PACKING SLIP</h1><div style="color:#8B5E3C">${escapeHtml(po.id)} &middot; ${escapeHtml(cust?.name||'')}</div></div>
        <div style="text-align:right">
          <div class="label">Ship Date</div><div>${fmtDate((po.shippedAt||'').slice(0,10) || new Date().toISOString().slice(0,10))}</div>
          <div class="label" style="margin-top:6px">BOL #</div><div>${escapeHtml(s.bol||'-')}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">Ship To</div>
          <div style="font-weight:600">${escapeHtml(cust?.name||'')}</div>
          <div>${escapeHtml(cust?.address||'')}</div>
        </div>
        <div class="box"><div class="label">Shipment</div>
          <div>${shipPalletCount(s)} pallet${shipPalletCount(s)===1?'':'s'} &middot; ${shipTotalWeight(s).toFixed(1)} lb</div>
          <div>Carrier: ${escapeHtml(s.carrier||'-')}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Product</th><th>Size</th><th>Cases</th><th>Units</th><th>Lot #</th></tr></thead>
        <tbody>
          ${po.lines.map(l => {
            const p=getProduct(l.productId);
            const units = typeof l.actualQty==='number' ? l.actualQty : l.qty;
            return `<tr>
              <td>${escapeHtml(p?.sku||'')}</td>
              <td>${escapeHtml(p?.name||'')}</td>
              <td>${p?.size?escapeHtml(p.size+(p.sizeUnit||'oz')):'-'}</td>
              <td>${typeof l.casesProduced==='number'?l.casesProduced:'-'}</td>
              <td>${units}</td>
              <td>${escapeHtml(l.lotNumber||'-')}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><th colspan="3" style="text-align:right">Totals</th><th>${totalCases||'-'}</th><th>${totalUnits}</th><th></th></tr></tfoot>
      </table>
      <div style="margin-top:24px;font-size:12px">Packed By: ___________________________ &nbsp;&nbsp; Checked By: ___________________________ &nbsp;&nbsp; Date: __________</div>
    </div>
  `;
}
const PRINT_DOC_STYLES = `
  body{font-family:Helvetica,Arial,sans-serif;padding:30px;color:#1A1A1A}
  h1{color:#5C3A21;margin:0;font-size:22px}
  h3{font-size:14px}
  .head{display:flex;justify-content:space-between;border-bottom:3px solid #E07B2A;padding-bottom:10px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  th{background:#F5E9D3;text-align:left;padding:7px;border-bottom:2px solid #5C3A21;font-size:11px}
  td{padding:7px;border-bottom:1px solid #E9E2D2}
  tfoot th{background:#5C3A21;color:#fff}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
  .box{border:1px solid #C9BFAE;padding:10px;border-radius:6px;font-size:13px}
  .label{font-size:11px;color:#8B5E3C;text-transform:uppercase;font-weight:600}
  .doc-page{page-break-after:always}
  .doc-page:last-child{page-break-after:auto}
`;
function printPackingSlip(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups to print.'); return; }
  w.document.write(`<html><head><title>Packing Slip - ${escapeHtml(po.id)}</title><style>${PRINT_DOC_STYLES}</style></head><body>${packingSlipSectionHtml(po)}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}
// Print Documents: BOL + Purchase Order + Packing Slip in one document
function printDocuments(id) {
  const po = state.purchaseOrders.find(p=>p.id===id);
  if (!po) return;
  const w = window.open('', '_blank');
  if (!w) { toast('Popup blocked. Allow popups to print.'); return; }
  w.document.write(`<html><head><title>Shipping Documents - ${escapeHtml(po.id)}</title><style>${PRINT_DOC_STYLES}</style></head><body>
    ${bolSectionHtml(po)}
    ${poSectionHtml(po)}
    ${packingSlipSectionHtml(po)}
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}
// keep printBOL as an alias for any older references
function printBOL(id) { printDocuments(id); }

