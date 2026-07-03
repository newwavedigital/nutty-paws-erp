import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { frontendText, publicApp } from "./frontend-assets";

const catalogModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "catalog", "index.js"), "utf8");
const contentLibraryModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "content-library", "index.js"), "utf8");
const backendBridgeModule = readFileSync(resolve(__dirname, "..", "public", "js", "api", "backend-bridge.js"), "utf8");
const feedbackModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "feedback", "index.js"), "utf8");
const foodSafetyModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "food-safety", "index.js"), "utf8");
const inventoryModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "inventory", "index.js"), "utf8");
const pickPackModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "pick-pack", "index.js"), "utf8");
const productionModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "production", "index.js"), "utf8");
const procurementModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "procurement", "index.js"), "utf8");
const qualityModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "quality", "index.js"), "utf8");
const shippingModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "shipping", "index.js"), "utf8");
const suppliersModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "suppliers", "index.js"), "utf8");
const teamChatModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "team-chat", "index.js"), "utf8");
const purchaseOrdersModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "purchase-orders", "index.js"), "utf8");

function sliceBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return source.slice(start, end >= 0 ? end : undefined);
}

describe("frontend truth hardening", () => {
  test("backend files render durable download URLs instead of empty dataUrl anchors", () => {
    expect(frontendText).toContain("function backendFileHref");
    expect(frontendText).toContain("function backendFileActionHtml");
    expect(frontendText).toContain("async function previewBackendFile");
    expect(frontendText).toContain("const downloadUrl = backendFileHref(file)");
    expect(frontendText).toContain("downloadUrl");
    expect(contentLibraryModule).toContain("backendFileActionHtml(f");
    expect(feedbackModule).toContain("feedbackAttachmentLinkHtml");
    expect(inventoryModule).toContain("backendFileActionHtml(coa");
    expect(qualityModule).not.toContain('href="${p.coa.dataUrl}"');
    expect(qualityModule).not.toContain('href="${p.postShipmentCoa.dataUrl}"');
    expect(qualityModule).not.toContain('href="${po.coa.dataUrl}"');
    expect(shippingModule).not.toContain('href="${s.documents.dataUrl}"');
    expect(purchaseOrdersModule).not.toContain('href="${po.coa.dataUrl}"');
    expect(pickPackModule).toContain("previewBackendFile(fileId");
    expect(pickPackModule).not.toContain('href="${p.poFile.dataUrl}"');
    expect(suppliersModule).toContain("backendFileActionHtml(f");
    expect(teamChatModule).toContain("teamChatAttachmentHtml");
  });

  test("quality post-shipment COAs rehydrate by backend file id and render immediately", () => {
    expect(backendBridgeModule).toContain("postShipmentCoaFileId");
    expect(backendBridgeModule).not.toContain("post_shipment_coa");
    expect(backendBridgeModule).toContain("local.postShipmentCoa = mapBackendFileToPrototype(uploaded)");
    expect(qualityModule).toContain("qualityPostShipmentCoaSelected");
    expect(qualityModule).toContain("p.postShipmentCoa ? `<div style=\"margin-top:4px\">");
  });

  test("Requested PO's tab discloses unsupported backend status and disables signed-in fake actions", () => {
    expect(pickPackModule).toContain("function productionRequestsUnsupportedHtml");
    expect(pickPackModule).toContain("Requested PO's are not included in the backend automations yet");
    expect(pickPackModule).toContain("disabled title=\"Backend automation not confirmed yet\"");
    expect(pickPackModule).toContain("productionRequestActionsDisabled()");
  });

  test("completed procurement rows no longer expose a live delete action", () => {
    const completedBlock = sliceBlock(procurementModule, "function renderProcCompleted(el)", "function procFormHtml");
    expect(completedBlock).toContain("Locked");
    expect(completedBlock).not.toContain("deleteProc('${p.id}')");
  });

  test("content library drag/drop move failures surface backend errors instead of failing silently", () => {
    const dropBlock = sliceBlock(contentLibraryModule, "async function libDrop(e, targetFolderId)", "async function libDropOnRoot");
    const rootDropBlock = sliceBlock(contentLibraryModule, "async function libDropOnRoot(e)", "function fileIcon");
    expect(dropBlock).toContain("toast(err.message || 'Content Library item could not be moved.')");
    expect(rootDropBlock).toContain("toast(err.message || 'Content Library item could not be moved.')");
    expect(rootDropBlock).toContain("toast('Moved to root.')");
  });

  test("shipping documents stay pending until backend upload succeeds", () => {
    const shipDocsSelectedBlock = sliceBlock(shippingModule, "function shipDocsSelected(e, id)", "function clearShipDocs");
    const completeShipmentBlock = sliceBlock(shippingModule, "async function completeShipment(id)", "function shipTotalWeight");
    expect(shipDocsSelectedBlock).toContain("pendingShipmentDocumentFiles.set(id, f)");
    expect(shipDocsSelectedBlock).toContain("Shipment document selected. Save or mark shipped to upload it to the backend.");
    expect(shipDocsSelectedBlock).not.toContain("saveState();");
    expect(shipDocsSelectedBlock).not.toContain("po.shipping.documents = { name: f.name");
    expect(completeShipmentBlock).toContain("const confirmedDocumentId = shippingShipmentDocumentFileId(po)");
    expect(completeShipmentBlock).toContain("const pendingFile = pendingShipmentDocumentFiles.get(id)");
    expect(completeShipmentBlock).toContain("if (!confirmedDocumentId && !pendingFile)");
  });

  test("Production Log hides dead-end delete/edit controls for signed-in backend sessions", () => {
    expect(productionModule).toContain("function productionLogImmutableNoticeHtml");
    expect(productionModule).toContain("Production Log entries are backend-immutable after finalization");
    expect(productionModule).toContain("!employeeBackendSessionActive()");
    expect(purchaseOrdersModule).toContain("productionValuesEditControlHtml(po)");
    expect(purchaseOrdersModule).toContain("Direct edit is disabled for signed-in backend records.");
    expect(purchaseOrdersModule).toContain("if (employeeBackendSessionActive())");
  });

  test("stale local purchase orders and Pick & Pack rows are visibly local-only in signed-in sessions", () => {
    expect(purchaseOrdersModule).toContain("Local-only");
    expect(purchaseOrdersModule).toContain("p._localOnlyBackendStale");
    expect(pickPackModule).toContain("Local-only");
    expect(pickPackModule).toContain("Backend required");
    expect(pickPackModule).toContain("This shipping draft is local-only and cannot be saved to the backend");
    expect(pickPackModule).toContain("This shipping draft is local-only and cannot be marked shipped");
  });

  test("pick-pack shipping mode changes do not persist local backend-session mutations before save succeeds", () => {
    const toggleBlock = sliceBlock(pickPackModule, "function togglePickPackMode(id, mode)", "function renderPickPackShipped");
    const saveBlock = sliceBlock(pickPackModule, "async function savePickPackShippingForm(id)", "async function markPickPackShipped(id)");
    expect(toggleBlock).toContain("if (!employeeBackendSessionActive())");
    expect(toggleBlock).toContain("saveState();");
    expect(toggleBlock).toContain("document.getElementById('pp_mode_fields_'+id).innerHTML = pickPackModeFieldsHtml(preview, mode);");
    expect(saveBlock).toContain("const shippingPatch = { shippingMode: mode };");
    expect(saveBlock).toContain("await saveBackendPickPackShippingDetails({ ...p, ...shippingPatch });");
    expect(saveBlock).toContain("Object.assign(p, shippingPatch);");
  });

  test("customer and product media are rehydrated from backend file metadata", () => {
    for (const marker of [
      "async function hydrateBackendCustomerFiles",
      "async function hydrateBackendProductFiles",
      "customer_spec_sheet",
      "co_packing_agreement",
      "product_image",
      "nutrition_facts",
      "mapBackendFileToPrototype",
    ]) {
      expect(publicApp).toContain(marker);
    }
    expect(catalogModule).toContain("catalogFileLinkHtml(sheet");
    expect(catalogModule).toContain("catalogProductMediaDownloadHtml(img");
    expect(catalogModule).not.toContain('href="${sheet.dataUrl}"');
    expect(catalogModule).not.toContain('href="${agreement.dataUrl}"');
    expect(catalogModule).not.toContain('href="${img.dataUrl}" download');
  });

  test("team chat author comes from the signed-in user and backend attachments use auth-aware controls", () => {
    expect(teamChatModule).toContain("function signedInChatAuthorName");
    expect(teamChatModule).toContain("user.displayName || user.email || 'You'");
    expect(teamChatModule).not.toContain("author: 'Henry'");
    expect(teamChatModule).toContain("currentPage === 'slack'");
    expect(teamChatModule).toContain("backendFileActionHtml(attachment");
  });

  test("A10 attachment uploads clean up records instead of leaving visible broken attachments", () => {
    expect(contentLibraryModule).toContain("await archiveA10DataRecord('contentLibrary', saved.id)");
    expect(feedbackModule).toContain("await archiveA10DataRecord('feedback', saved.id)");
    expect(teamChatModule).toContain("await archiveA10DataRecord('teamChat', saved.id)");
    expect(suppliersModule).toContain("!supplierEditingDocs[d.key].file");
    expect(suppliersModule).toContain("await archiveA10DataRecord('suppliers', saved.id)");
    expect(contentLibraryModule).toContain("toast(err.message || 'Content Library item could not be moved.')");
  });

  test("Food Safety lot tracking fails closed for signed-in backend sessions", () => {
    expect(foodSafetyModule).toContain("function foodSafetyLotsAreBackendLocked");
    expect(foodSafetyModule).toContain("Lot Tracking is read-only for signed-in sessions.");
    expect(foodSafetyModule).toContain("Food Safety lot tracking is not backend-backed yet. Nothing was saved locally.");
    expect(foodSafetyModule).toContain("disabled title=\"Backend lot tracking workflow not connected yet\"");
  });
});
