/* =========================================================================
   INVENTORY HELPERS
   ========================================================================= */
function poRequirements(po, useActual, withLoss) {
  const required = {};
  const factor = withLoss ? PLANNING_LOSS_FACTOR : 1;
  po.lines.forEach(line => {
    const bom = state.boms[line.productId] || [];
    const qty = (useActual && typeof line.actualQty === 'number') ? line.actualQty : line.qty;
    bom.forEach(b => {
      required[b.ingredientId] = (required[b.ingredientId] || 0) + b.qty * qty * factor;
    });
  });
  return required;
}
// Theoretical (no loss buffer) requirements - used to compute waste vs. actual at completion
function poTheoretical(po, useActual) { return poRequirements(po, useActual, false); }
function inventoryCheck(po) {
  const req = poRequirements(po);
  const issues = [];
  Object.keys(req).forEach(ingId => {
    const ing = getIngredient(ingId);
    if (!ing) return;
    if (ing.stock < req[ingId]) {
      issues.push({ ingredient: ing, needed: req[ingId], short: req[ingId] - ing.stock });
    }
  });
  return issues;
}
function consumeInventory(po) {
  // Prefer the ACTUAL materials used (captured at completion) for accurate deduction.
  if (Array.isArray(po.materialsUsed) && po.materialsUsed.length) {
    po.materialsUsed.forEach(m => {
      const ing = getIngredient(m.ingredientId);
      if (ing) ing.stock = Math.max(0, (ing.stock||0) - (parseFloat(m.actual)||0));
    });
    return;
  }
  // Fallback (legacy): theoretical requirement based on actual finished-good qty.
  const req = poRequirements(po, true);
  Object.keys(req).forEach(ingId => {
    const ing = getIngredient(ingId);
    if (ing) ing.stock = Math.max(0, ing.stock - req[ingId]);
  });
}

/* =========================================================================
   INVENTORY RESERVATION (multi-PO allocation tracking)
   - "Allocated" = ingredients committed to POs that haven't yet deducted inventory
   - That's any PO with status approved_for_production or in_production (and not finalized)
   - At ship/complete, inventory is already deducted, so those POs no longer count as allocating
   - At pending/in_supply_chain, the PO hasn't been approved yet so it's not committed
   ========================================================================= */
function isAllocating(po) {
  if (!po) return false;
  if (po.productionFinalized) return false;
  return po.status === 'approved_for_production' || po.status === 'in_production';
}
// Sum of allocated qty per ingredient across every active PO. Optionally exclude one PO (when checking that PO itself).
function allocatedInventory(excludePoId) {
  const allocated = {};
  state.purchaseOrders.forEach(po => {
    if (excludePoId && po.id === excludePoId) return;
    if (!isAllocating(po)) return;
    const req = poRequirements(po, false, true); // include 5% planning loss buffer
    Object.keys(req).forEach(ingId => {
      allocated[ingId] = (allocated[ingId] || 0) + req[ingId];
    });
  });
  return allocated;
}
// Net available for an ingredient (on hand minus other-PO allocations)
function netAvailableFor(ingredientId, excludePoId) {
  const ing = getIngredient(ingredientId);
  if (!ing) return 0;
  const alloc = allocatedInventory(excludePoId);
  return (ing.stock || 0) - (alloc[ingredientId] || 0);
}
// Demand from POs still awaiting Supply Chain approval (pending / in_supply_chain).
// These aren't "allocated" yet, but if we don't have enough to cover them, Procurement should order.
function supplyChainDemand() {
  const demand = {};
  state.purchaseOrders.forEach(po => {
    if (po.status !== 'pending' && po.status !== 'in_supply_chain') return;
    const req = poRequirements(po, false, true); // include 5% planning loss buffer
    Object.keys(req).forEach(ingId => { demand[ingId] = (demand[ingId] || 0) + req[ingId]; });
  });
  return demand;
}
// Which Supply Chain POs need a given ingredient (for "why" labels in Procurement)
function scPOsNeedingIngredient(ingId) {
  return state.purchaseOrders.filter(po => {
    if (po.status !== 'pending' && po.status !== 'in_supply_chain') return false;
    return (poRequirements(po)[ingId] || 0) > 0;
  });
}
// DISPLAY-ONLY total allocation per ingredient for the Inventory page:
// anything tied up by a PO that hasn't shipped yet - Supply Chain reviews +
// approved + in-production. Includes the 5% planning loss buffer.
// (Does NOT affect Supply Chain approval gating, which still uses allocatedInventory().)
function inventoryAllocation() {
  const total = {};
  const prod = allocatedInventory();           // approved_for_production + in_production
  const sc = supplyChainDemand();              // pending / in_supply_chain
  Object.keys(prod).forEach(id => { total[id] = (total[id] || 0) + prod[id]; });
  Object.keys(sc).forEach(id => { total[id] = (total[id] || 0) + sc[id]; });
  return total;
}
// Per-ingredient breakdown for the Allocation cell.
function inventoryAllocationBreakdown(ingredientId) {
  const sc = supplyChainDemand()[ingredientId] || 0;
  const prod = allocatedInventory()[ingredientId] || 0;
  return { sc, prod, total: sc + prod };
}
// List of inventory conflicts: any ingredient where total allocations exceed on-hand stock.
function inventoryConflicts() {
  const alloc = allocatedInventory();
  const conflicts = [];
  state.ingredients.forEach(ing => {
    const allocAmt = alloc[ing.id] || 0;
    if (allocAmt > (ing.stock || 0)) {
      const shortBy = allocAmt - (ing.stock || 0);
      // affected POs: any allocating PO that needs this ingredient
      const affected = state.purchaseOrders.filter(po => {
        if (!isAllocating(po)) return false;
        const req = poRequirements(po);
        return (req[ing.id] || 0) > 0;
      }).map(po => ({
        po,
        need: poRequirements(po)[ing.id] || 0,
        cust: getCustomer(po.customerId)
      }));
      conflicts.push({ ingredient: ing, allocated: allocAmt, onHand: ing.stock || 0, shortBy, affected });
    }
  });
  return conflicts;
}
// Simulate finalizing a PO with its current actualQty values and report any downstream POs that would be left short.
function downstreamShortageOnFinalize(po) {
  // simulated stock after consuming this PO's actualQty
  const reqThis = poRequirements(po, true);
  const simulatedStock = {};
  state.ingredients.forEach(ing => {
    simulatedStock[ing.id] = Math.max(0, (ing.stock || 0) - (reqThis[ing.id] || 0));
  });
  // sum allocations from all OTHER allocating POs
  const downstream = [];
  const otherAlloc = allocatedInventory(po.id);
  Object.keys(otherAlloc).forEach(ingId => {
    if (otherAlloc[ingId] > simulatedStock[ingId]) {
      const ing = getIngredient(ingId);
      const short = otherAlloc[ingId] - simulatedStock[ingId];
      // who is affected
      const affected = state.purchaseOrders.filter(p => {
        if (p.id === po.id) return false;
        if (!isAllocating(p)) return false;
        const r = poRequirements(p);
        return (r[ingId] || 0) > 0;
      });
      downstream.push({ ingredient: ing, short, affected });
    }
  });
  return downstream;
}

