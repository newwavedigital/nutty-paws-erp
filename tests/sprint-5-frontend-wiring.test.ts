import { describe, expect, test } from "vitest";
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
      expect(rootHtml).toContain(marker);
    }
  });

  test("defines backend save functions for Product, Master List, Inventory, Receiving, and Move workflows", () => {
    for (const marker of [
      "async function saveBackendProduct",
      "async function saveBackendMasterItem",
      "async function saveBackendInventoryItem",
      "async function saveBackendReceivingEntry",
      "async function saveBackendMoveEntry",
      "async function uploadBackendProductMedia",
      "async function uploadBackendInventoryCoa",
    ]) {
      expect(rootHtml).toContain(marker);
    }
  });

  test("uses Sprint 5 backend endpoints and file categories", () => {
    for (const marker of [
      "/api/inventory",
      "/api/inventory/receiving",
      "/api/inventory/moves",
      "/api/inventory/signals",
      "product_image",
      "nutrition_facts",
      "inventory_coa",
      "inventory_item",
    ]) {
      expect(rootHtml).toContain(marker);
    }
  });

  test("keeps public entrypoint mirrored for Sprint 5 frontend markers", () => {
    for (const marker of [
      "const backendInventoryState",
      "async function saveBackendProduct",
      "async function saveBackendInventoryItem",
      "async function saveBackendReceivingEntry",
      "async function saveBackendMoveEntry",
      "async function uploadBackendInventoryCoa",
      "/api/inventory/signals",
    ]) {
      expect(publicHtml).toContain(marker);
    }
  });
});
