import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inventoryModule = readFileSync(
  resolve(__dirname, "..", "public", "js", "modules", "inventory", "index.js"),
  "utf8",
).replace(/\r\n/g, "\n");
const backendBridge = readFileSync(
  resolve(__dirname, "..", "public", "js", "api", "backend-bridge.js"),
  "utf8",
).replace(/\r\n/g, "\n");

function renderInventoryEditor(inventoryItem: Record<string, unknown>, masterItems: Array<Record<string, unknown>>) {
  let modalHtml = "";
  const editIngredient = new Function(
    "state",
    "backendRowsReady",
    "backendInventoryState",
    "backendAuthState",
    "uid",
    "openModal",
    "escapeHtml",
    "document",
    `${inventoryModule}\nreturn editIngredient;`,
  )(
    {
      ingredients: [inventoryItem],
      masterItems,
      suppliers: [],
      customers: [],
    },
    () => true,
    {},
    { token: "", user: null },
    () => "new-inventory-item",
    (_title: string, html: string) => { modalHtml = html; },
    (value: unknown) => String(value),
    { getElementById: () => null },
  ) as (id: string) => void;

  editIngredient(String(inventoryItem.id));
  return modalHtml;
}

function inventorySaveWithBridge(state: { masterItems: Array<Record<string, unknown>> }, capturePayload: (payload: Record<string, unknown>) => void) {
  const start = backendBridge.indexOf("function masterItemForInventoryId(masterItemId)");
  const end = backendBridge.indexOf("async function archiveBackendInventoryItem", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return new Function(
    "state",
    "apiRequest",
    "mergeBackendInventoryItems",
    `${backendBridge.slice(start, end)}\nreturn saveBackendInventoryItem;`,
  )(
    state,
    async (_path: string, options: { body?: string }) => {
      capturePayload(JSON.parse(options.body || "{}") as Record<string, unknown>);
      return { id: "inventory-1" };
    },
    () => {},
  ) as (id: string, isNew: boolean, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

describe("Inventory Master List ID selection", () => {
  test("renders duplicate display names with distinct ID-backed values and keeps the existing link selected", () => {
    const modalHtml = renderInventoryEditor(
      {
        id: "inventory-1",
        masterItemId: "master-b",
        name: "Duplicate item",
        category: "Ingredient",
        supplierId: "",
        customerId: "general",
        stock: 0,
        reorderLevel: 0,
        unit: "lb",
        cost: 0,
        lots: [],
      },
      [
        { id: "master-a", _backendId: "master-a", name: "Duplicate item", itemType: "raw_material", uom: "LBS", customerId: "general" },
        { id: "master-b", _backendId: "master-b", name: "Duplicate item", itemType: "packaging", uom: "Each", customerId: "general" },
      ],
    );

    expect(modalHtml).toContain('id="ing_master_item_id"');
    expect(modalHtml).toMatch(/<option value="master-a"[^>]*>Duplicate item<\/option>/);
    expect(modalHtml).toMatch(/<option value="master-b"[^>]*selected[^>]*>Duplicate item<\/option>/);
    expect(modalHtml).not.toContain('<option value="Duplicate item"');
  });

  test("preserves an unresolved legacy display without selecting a same-name Master List row", () => {
    const modalHtml = renderInventoryEditor(
      {
        id: "inventory-legacy",
        masterItemId: "master-missing",
        name: "Legacy duplicate",
        category: "Ingredient",
        supplierId: "",
        customerId: "general",
        stock: 0,
        reorderLevel: 0,
        unit: "lb",
        cost: 0,
        lots: [],
      },
      [{ id: "master-name-match", name: "Legacy duplicate", itemType: "raw_material", uom: "LBS", customerId: "general" }],
    );

    expect(modalHtml).toMatch(/<option value="master-name-match"[^>]*>Legacy duplicate<\/option>/);
    expect(modalHtml).not.toMatch(/<option value="master-name-match"[^>]*selected/);
    expect(modalHtml).toContain('value="master-missing"');
    expect(modalHtml).toContain('data-legacy-master-link="unresolved" selected');
  });

  test("sends the selected Master List ID even when another Master row has the same display name", async () => {
    let submittedPayload: Record<string, unknown> = {};
    const saveBackendInventoryItem = inventorySaveWithBridge(
      {
        masterItems: [
          { id: "master-a", _backendId: "master-a", name: "Duplicate item", unitOfMeasure: "lb" },
          { id: "master-b", _backendId: "master-b", name: "Duplicate item", unitOfMeasure: "ea" },
        ],
      },
      (payload) => { submittedPayload = payload; },
    );

    await saveBackendInventoryItem("inventory-1", true, {
      masterItemId: "master-b",
      name: "Duplicate item",
      category: "Packaging",
      supplierId: null,
      customerId: "general",
      unit: "ea",
      cost: 0,
      reorderLevel: 0,
      leadTimeDays: 0,
      lots: [],
    });

    expect(submittedPayload).toMatchObject({ masterItemId: "master-b", category: "Packaging" });
    expect(backendBridge).toContain("function masterItemForInventoryId(masterItemId)");
    expect(backendBridge).not.toContain("masterItemForInventoryName");
  });
});
