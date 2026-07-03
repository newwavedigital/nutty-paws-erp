import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { frontendText, publicApp } from "./frontend-assets";

const catalogModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "catalog", "index.js"), "utf8");
const contentLibraryModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "content-library", "index.js"), "utf8");
const feedbackModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "feedback", "index.js"), "utf8");
const foodSafetyModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "food-safety", "index.js"), "utf8");
const inventoryModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "inventory", "index.js"), "utf8");
const pickPackModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "pick-pack", "index.js"), "utf8");
const productionModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "production", "index.js"), "utf8");
const qualityModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "quality", "index.js"), "utf8");
const shippingModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "shipping", "index.js"), "utf8");
const suppliersModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "suppliers", "index.js"), "utf8");
const teamChatModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "team-chat", "index.js"), "utf8");
const purchaseOrdersModule = readFileSync(resolve(__dirname, "..", "public", "js", "modules", "purchase-orders", "index.js"), "utf8");

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

  test("Requested PO's tab discloses unsupported backend status and disables signed-in fake actions", () => {
    expect(pickPackModule).toContain("function productionRequestsUnsupportedHtml");
    expect(pickPackModule).toContain("Requested PO's are not included in the backend automations yet");
    expect(pickPackModule).toContain("disabled title=\"Backend automation not confirmed yet\"");
    expect(pickPackModule).toContain("productionRequestActionsDisabled()");
  });

  test("Production Log hides dead-end delete/edit controls for signed-in backend sessions", () => {
    expect(productionModule).toContain("function productionLogImmutableNoticeHtml");
    expect(productionModule).toContain("Production Log entries are backend-immutable after finalization");
    expect(productionModule).toContain("!employeeBackendSessionActive()");
    expect(purchaseOrdersModule).toContain("productionValuesEditControlHtml(po)");
    expect(purchaseOrdersModule).toContain("Direct edit is disabled for signed-in backend records.");
    expect(purchaseOrdersModule).toContain("if (employeeBackendSessionActive())");
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
  });

  test("Food Safety lot tracking fails closed for signed-in backend sessions", () => {
    expect(foodSafetyModule).toContain("function foodSafetyLotsAreBackendLocked");
    expect(foodSafetyModule).toContain("Lot Tracking is read-only for signed-in sessions.");
    expect(foodSafetyModule).toContain("Food Safety lot tracking is not backend-backed yet. Nothing was saved locally.");
    expect(foodSafetyModule).toContain("disabled title=\"Backend lot tracking workflow not connected yet\"");
  });
});
