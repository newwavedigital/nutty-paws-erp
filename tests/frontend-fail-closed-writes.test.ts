import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

describe("frontend fail-closed backend writes", () => {
  test("does not advertise local-only success after backend write failures", () => {
    const forbiddenFallbacks = [
      "saved PO locally instead",
      "saved editable fields locally",
      "deposit status saved locally",
      "stayed local/demo only",
      "local demo fallback remains visible",
      "Saved locally only",
      "User saved locally.",
    ];

    for (const marker of forbiddenFallbacks) {
      expect(publicApp).not.toContain(marker);
    }
  });

  test("defines a shared guard for backend-required write failures", () => {
    expect(publicApp).toContain("function failBackendRequiredWrite");
    expect(publicApp).toContain("function requireBackendWriteSession");
    expect(publicApp).toContain("Backend save failed. Nothing was saved locally.");
    expect(publicApp).toContain("Sign in before saving. Nothing was saved locally.");
  });

  test("keeps Account Management delete from falling through to local delete after backend failure", () => {
    const deleteUserStart = publicApp.indexOf("async function deleteUser");
    expect(deleteUserStart).toBeGreaterThan(0);
    const deleteUserBody = publicApp.slice(deleteUserStart, publicApp.indexOf("/* ----- Customer Portal preview -----", deleteUserStart));

    expect(deleteUserBody).toContain("failBackendRequiredWrite");
    expect(deleteUserBody).not.toContain("Account Management could not reach the backend user API; keeping browser-preview users active.");
  });

  test("keeps Receiving and Move Log corrections backend-required", () => {
    const saveReceivingStart = publicApp.indexOf("async function saveReceiving");
    const deleteReceivingStart = publicApp.indexOf("async function deleteReceiving");
    const saveMoveStart = publicApp.indexOf("async function saveMove");
    const deleteMoveStart = publicApp.indexOf("async function deleteMove");

    expect(saveReceivingStart).toBeGreaterThan(0);
    expect(deleteReceivingStart).toBeGreaterThan(0);
    expect(saveMoveStart).toBeGreaterThan(0);
    expect(deleteMoveStart).toBeGreaterThan(0);

    const saveReceivingBody = publicApp.slice(saveReceivingStart, deleteReceivingStart);
    const deleteReceivingBody = publicApp.slice(deleteReceivingStart, publicApp.indexOf("/* =========================================================================", deleteReceivingStart));
    const saveMoveBody = publicApp.slice(saveMoveStart, deleteMoveStart);
    const deleteMoveBody = publicApp.slice(deleteMoveStart, publicApp.indexOf("/* =========================================================================", deleteMoveStart));

    expect(saveReceivingBody).toContain("saveBackendReceivingEntry(id, isNew, data)");
    expect(saveReceivingBody).not.toContain("Receiving Log edits are not backend-backed yet");
    expect(deleteReceivingBody).toContain("archiveBackendReceivingEntry");
    expect(deleteReceivingBody.indexOf("archiveBackendReceivingEntry")).toBeLessThan(deleteReceivingBody.indexOf("state.receivingLog"));

    expect(saveMoveBody).toContain("saveBackendMoveEntry(id, isNew, data)");
    expect(saveMoveBody).not.toContain("Move Log edits are not backend-backed yet");
    expect(deleteMoveBody).toContain("archiveBackendMoveEntry");
    expect(deleteMoveBody.indexOf("archiveBackendMoveEntry")).toBeLessThan(deleteMoveBody.indexOf("state.moveLog"));
  });

  test("keeps audited action buttons backend-confirmed or fail-closed", () => {
    const requiredMarkers = [
      "Customer delete requires backend confirmation. Nothing was saved locally.",
      "Product delete requires backend confirmation. Nothing was saved locally.",
      "Master item archive requires backend confirmation. Nothing was saved locally.",
      "Inventory item archive requires backend confirmation. Nothing was saved locally.",
      "Inventory adjustment requires backend confirmation. Nothing was saved locally.",
      "Purchase order cancellation requires backend confirmation. Nothing was saved locally.",
      "Procurement PO cancellation requires backend confirmation. Nothing was saved locally.",
      "Production value edits require backend correction support. Nothing was saved locally.",
      "Requested production requests are not backend-supported yet. Nothing was saved locally.",
      "QA notes require backend confirmation. Nothing was saved locally.",
      "Warehouse notes require backend confirmation. Nothing was saved locally.",
      "Pick & Pack PO cancellation requires backend confirmation. Nothing was saved locally.",
    ];

    for (const marker of requiredMarkers) {
      expect(publicApp).toContain(marker);
    }

    expect(publicApp).toContain("archiveBackendCustomer");
    expect(publicApp).toContain("archiveBackendProduct");
    expect(publicApp).toContain("archiveBackendMasterItem");
    expect(publicApp).toContain("archiveBackendInventoryItem");
    expect(publicApp).toContain("adjustBackendInventoryItem");
    expect(publicApp).toContain("cancelBackendPurchaseOrder");
    expect(publicApp).toContain("cancelBackendProcurementOrder");
    expect(publicApp).toContain("saveBackendQualityNotes");
    expect(publicApp).toContain("saveBackendShippingDetails(po)");
    expect(publicApp).toContain("cancelBackendPickPackOrder");
  });
});
