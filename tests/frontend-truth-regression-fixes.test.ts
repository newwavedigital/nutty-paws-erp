import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "..");
const backendBridge = readFileSync(resolve(repoRoot, "public", "js", "api", "backend-bridge.js"), "utf8");
const qualityModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "quality", "index.js"), "utf8");
const shippingModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "shipping", "index.js"), "utf8");
const procurementModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "procurement", "index.js"), "utf8");
const contentLibraryModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "content-library", "index.js"), "utf8");
const pickPackModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "pick-pack", "index.js"), "utf8");
const purchaseOrdersModule = readFileSync(resolve(repoRoot, "public", "js", "modules", "purchase-orders", "index.js"), "utf8");

describe("frontend/backend truth regression fixes", () => {
  test("post-shipment COA uses backend contract and hydrates from the saved file id", () => {
    expect(backendBridge).toContain("coaFileId: uploaded?.id || null");
    expect(backendBridge).toContain("file.id === po.postShipmentCoaFileId");
    expect(backendBridge).toContain("local.postShipmentCoa = mapBackendFileToPrototype(uploaded)");
    expect(backendBridge).not.toContain("fileCategory === 'post_shipment_coa'");
    expect(qualityModule).toContain("qualityPostShipmentCoaSelected");
  });

  test("shipment documents distinguish pending browser selection from backend upload", () => {
    expect(shippingModule).toContain("Shipment document selected. Save or mark shipped to upload it to the backend.");
    expect(shippingModule).toContain("const pending = pendingShipmentDocumentFiles.get(po?.id || '') || null");
    expect(shippingModule).toContain("ready: !!confirmedId || !!pending");
    expect(shippingModule).not.toContain("localOnly");
    expect(shippingModule).not.toContain("Local only");
    expect(shippingModule).toContain("if (!backendAuthSessionActive()) saveState();");
    expect(backendBridge).toContain("const existingShipping = backendAuthSessionActive() ? {} : (existing.shipping || {})");
    expect(backendBridge).not.toContain("shippingDetails.bolNumber || existing.shipping?.bol");
    expect(backendBridge).toContain("const shipmentDocumentFileId = shippingShipmentDocumentFileId(localPo)");
    expect(backendBridge).toContain("localPo.shipping.documents = mapBackendFileToPrototype(shipmentDocument)");
    expect(shippingModule).toContain("const confirmedDocumentId = shippingShipmentDocumentFileId(po)");
    expect(shippingModule).toContain("if (!confirmedDocumentId && !pendingFile)");
    expect(shippingModule).toContain("Shipment document must be reselected so it can be uploaded to the backend.");
    expect(shippingModule).not.toContain("toast('Shipment documents uploaded.')");
  });

  test("received procurement rows no longer show a live delete action", () => {
    expect(procurementModule).toContain("Received procurement POs are locked from cancellation");
    expect(procurementModule).not.toContain("onclick=\"deleteProc('${p.id}')\">Delete</button>\n              </td>");
  });

  test("content-library drag and drop moves surface backend failures", () => {
    expect(contentLibraryModule).toContain("Content Library item could not be moved.");
    expect(contentLibraryModule).toContain("try {\n    if (libDragPayload.kind === 'file')");
    expect(contentLibraryModule).toContain("try {\n    if (libDragPayload.kind === 'file') {\n      const f = state.libraryFiles.find(x => x.id === libDragPayload.id);\n      if (f) await saveA10DataRecord('contentLibrary', 'file', { ...f, folderId: null }");
  });

  test("signed-in backend sessions remove stale local PO rows instead of presenting live or draft actions", () => {
    expect(backendBridge).toContain("removeLocalOnlyPurchaseOrdersForBackendSession();");
    expect(backendBridge).toContain("removeLocalOnlyPickPackOrdersForBackendSession();");
    expect(backendBridge).not.toContain("_localOnlyBackendStale: true");
    expect(purchaseOrdersModule).not.toContain("Backend session active; local-only rows cannot be edited or cancelled");
    expect(pickPackModule).not.toContain("Backend session active; local-only rows cannot be edited, picked, or cancelled");
  });

  test("pick-pack shipping form state is applied only after backend save succeeds", () => {
    expect(pickPackModule).toContain("const shippingPatch = { shippingMode: mode }");
    expect(pickPackModule).toContain("await saveBackendPickPackShippingDetails({ ...p, ...shippingPatch })");
    expect(pickPackModule).toContain("Object.assign(p, shippingPatch)");
    expect(pickPackModule).toContain("if (!employeeBackendSessionActive())");
  });
});
