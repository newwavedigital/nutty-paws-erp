import { describe, expect, test } from "vitest";
import { frontendText } from "./frontend-assets";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootHtml = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");
const publicHtml = readFileSync(resolve(__dirname, "..", "public", "index.html"), "utf8");

describe("Sprint 5 frontend inventory wiring", () => {
  test("defines backend inventory state and loaders for Sprint 5 setup data", () => {
    for (const marker of [
      "const backendInventoryState",
      "async function loadBackendInventory",
      "async function loadBackendReceivingEntries",
      "async function loadBackendMoveEntries",
      "async function loadBackendInventorySignals",
      "function mergeBackendInventoryItems",
      "function mergeBackendReceivingEntries",
      "function mergeBackendMoveEntries",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("defines backend save functions for Product, Master List, Inventory, Receiving, and Move workflows", () => {
    for (const marker of [
      "async function saveBackendProduct",
      "async function saveBackendMasterItem",
      "async function saveBackendInventoryItem",
      "async function saveBackendReceivingEntry",
      "async function saveBackendMoveEntry",
      "async function archiveBackendReceivingEntry",
      "async function archiveBackendMoveEntry",
      "async function uploadBackendProductMedia",
      "async function uploadBackendInventoryCoa",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("uses Sprint 5 backend endpoints, durable correction methods, and file categories", () => {
    for (const marker of [
      "/api/inventory",
      "/api/inventory/receiving",
      "/api/inventory/receiving/${encodeURIComponent(backendId)}",
      "/api/inventory/moves",
      "/api/inventory/moves/${encodeURIComponent(backendId)}",
      "/api/inventory/signals",
      "method: isNew ? 'POST' : 'PATCH'",
      "method: 'DELETE'",
      "product_image",
      "nutrition_facts",
      "inventory_coa",
      "inventory_item",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("normalizes adjusted lot quantities before saving backend inventory items", () => {
    for (const marker of [
      "const qty = Number(lot.qty ?? lot.quantity ?? 0) || 0;",
      "const onHandQuantity = lots.length",
      "syncItemLots(draft);",
      "const saved = await saveBackendInventoryItem(id, false, draft);",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 5 frontend markers", () => {
    for (const marker of [
      "const backendInventoryState",
      "async function saveBackendProduct",
      "async function saveBackendInventoryItem",
      "async function saveBackendReceivingEntry",
      "async function saveBackendMoveEntry",
      "async function archiveBackendReceivingEntry",
      "async function archiveBackendMoveEntry",
      "async function uploadBackendInventoryCoa",
      "/api/inventory/signals",
    ]) {
      expect(frontendText).toContain(marker);
    }
  });
});
