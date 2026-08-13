import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inventoryModule = readFileSync(
  resolve(__dirname, "..", "public", "js", "modules", "inventory", "index.js"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("frontend Inventory and Master List type wiring", () => {
  test("exposes every backend Master List type with readable labels", () => {
    for (const [value, label] of [
      ["raw_material", "Raw Material"],
      ["packaging", "Packaging"],
      ["finished_good", "Finished Good"],
      ["other", "Other"],
    ]) {
      expect(inventoryModule).toContain(`{ value: '${value}', label: '${label}' }`);
    }

    expect(inventoryModule).toContain("const itemType = normalizeMasterItemType(m.itemType);");
    expect(inventoryModule).toContain("<label>Master List Type</label>");
    expect(inventoryModule).toContain("id=\"mi_item_type\"");
  });

  test("preserves the current Master List type while editing", () => {
    const editStart = inventoryModule.indexOf("function editMasterItem(id)");
    const saveStart = inventoryModule.indexOf("async function saveMasterItem(id, isNew)");
    expect(editStart).toBeGreaterThan(-1);
    expect(saveStart).toBeGreaterThan(editStart);

    const editBody = inventoryModule.slice(editStart, saveStart);
    expect(editBody).toContain("const itemType = normalizeMasterItemType(m.itemType);");
    expect(editBody).toContain("itemType===option.value?'selected':''");

    const saveBody = inventoryModule.slice(saveStart, inventoryModule.indexOf("async function deleteMasterItem", saveStart));
    expect(saveBody).toContain("const selectedItemType = document.getElementById('mi_item_type').value;");
    expect(saveBody).toContain("const itemType = normalizeMasterItemType(selectedItemType);");
  });

  test("uses a selected Master List type to suggest the Inventory category", () => {
    for (const [itemType, category] of [
      ["raw_material", "Ingredient"],
      ["packaging", "Packaging"],
      ["finished_good", "Finished Good"],
    ]) {
      expect(inventoryModule).toContain(`${itemType}: '${category}'`);
    }

    expect(inventoryModule).toContain("data-item-type=\"${escapeHtml(itemType)}\"");
    expect(inventoryModule).toContain("data-category=\"${escapeHtml(category)}\"");
    expect(inventoryModule).toContain("categoryEl.value = category;");
    expect(inventoryModule).toContain("toggleIngredientFields();");
    expect(inventoryModule).toContain("data.category = saved.category || cat;");
    expect(inventoryModule).toContain("linkedMasterItem.itemType = normalizeMasterItemType(saved.itemType);");
  });

  test("uses the backend-returned category after an Inventory save", () => {
    expect(inventoryModule).toContain("data.category = saved.category || cat;");
    expect(inventoryModule).toContain("invTab = data.category;");
  });

  test("invalidates and reloads Inventory after a direct Master List type edit succeeds", () => {
    const saveStart = inventoryModule.indexOf("async function saveMasterItem(id, isNew)");
    const saveEnd = inventoryModule.indexOf("async function deleteMasterItem", saveStart);
    const saveBody = inventoryModule.slice(saveStart, saveEnd);

    expect(saveBody).toContain("const masterItemTypeChanged = !isNew && normalizeMasterItemType(existing?.itemType) !== itemType;");
    expect(saveBody).toContain("if (masterItemTypeChanged) {");
    expect(saveBody).toContain("backendInventoryState.loaded = false;");
    expect(saveBody).toContain("backendInventoryState.signals = null;");
    expect(saveBody).toContain("await loadBackendInventory();");
  });

  test("loads the Master List when Inventory opens and never shows a false zero while it is unavailable", () => {
    const countStart = inventoryModule.indexOf("function inventoryTabCount(t)");
    const tabsStart = inventoryModule.indexOf("function inventoryTabsHtml()", countStart);
    const countBody = inventoryModule.slice(countStart, tabsStart);
    expect(countBody).toContain("if (t === 'Master List') return backendRowsReady(backendMasterItemState) ? (state.masterItems || []).length : '…';");

    const renderStart = inventoryModule.indexOf("function renderInventory(el)");
    const nextFunction = inventoryModule.indexOf("function ", renderStart + 1);
    const renderBody = inventoryModule.slice(renderStart, nextFunction);
    expect(renderBody).toContain("!backendMasterItemState.loaded && !backendMasterItemState.loading");
    expect(renderBody).toContain("loadBackendMasterItems().then(() => { if (currentPage === 'inventory') router('inventory'); });");
  });
});
