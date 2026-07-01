import { describe, expect, test } from "vitest";
import { publicApp } from "./frontend-assets";

describe("protected frontend reads fail closed", () => {
  test("removes signed-in protected read fallback copy", () => {
    const retiredReadFallbacks = [
      "Inventory backend data is unavailable, so local demo inventory remains visible.",
      "Customer backend data is unavailable, so local demo customers remain visible.",
      "Customer profile backend data is unavailable, so local demo customer details remain visible.",
      "Product backend data is unavailable, so local demo products remain visible.",
      "Master List backend data is unavailable, so local demo master items remain visible.",
      "Procurement backend data is unavailable, so local demo procurement remains visible.",
      "Production backend data is unavailable, so local demo production remains visible.",
      "Quality backend data is unavailable, so local QA demo records remain visible.",
      "Shipping backend data is unavailable, so local demo shipping remains visible.",
      "Pick & Pack backend data is unavailable, so local Pick & Pack records remain visible.",
      "Research backend data is unavailable, so local demo R&D requests remain visible.",
      "Browser inventory preview data remains visible while backend data is unavailable.",
      "Browser customer/product preview data remains visible while backend data is unavailable.",
      "Browser procurement preview data remains visible while backend data is unavailable.",
      "Browser production preview data remains visible while backend data is unavailable.",
      "Browser QA preview data remains visible while backend data is unavailable.",
      "Browser shipping preview data remains visible while backend data is unavailable.",
      "Browser Pick & Pack preview data remains visible while backend data is unavailable.",
      "Offline preview is visible. Sign in to load and save protected backend records.",
      "Offline preview is visible until protected backend records load.",
    ];

    for (const marker of retiredReadFallbacks) {
      expect(publicApp).not.toContain(marker);
    }
  });

  test("uses a hard backend read failure message and clears protected operational arrays", () => {
    expect(publicApp).toContain("const BACKEND_READ_FAILED_MESSAGE = 'Backend read failed. No local or preview data is shown.'");
    expect(publicApp).toContain("function clearProtectedBackendRows");
    expect(publicApp).toContain("function setBackendReadFailed");

    for (const marker of [
      "state.users = [];",
      "state.customers = [];",
      "state.products = [];",
      "state.masterItems = [];",
      "state.ingredients = [];",
      "state.receivingLog = [];",
      "state.moveLog = [];",
      "state.procurementOrders = [];",
      "state.productionLog = [];",
      "state.shippingLog = [];",
      "state.pickPackOrders = [];",
      "state.rdRequests = [];",
      "state.purchaseOrders = [];",
      "backendInventoryState.signals = null;",
      "backendProcurementState.needRows = [];",
      "backendProductionState.runs = [];",
      "backendProductionState.logs = [];",
      "backendQualityState.queue = [];",
      "backendShippingState.queue = [];",
      "backendShippingState.logs = [];",
      "backendPickPackState.orders = [];",
      "backendResearchState.requests = [];",
    ]) {
      expect(publicApp).toContain(marker);
    }

    for (const area of [
      "account-management",
      "customers",
      "products",
      "master-items",
      "inventory",
      "procurement",
      "production",
      "quality",
      "shipping",
      "pick-pack",
      "research",
      "purchase-orders",
    ]) {
      expect(publicApp).toContain(`clearProtectedBackendRows('${area}')`);
    }
  });

  test("blocks inventory low-stock fallback from browser-local ingredients after backend error", () => {
    expect(publicApp).toContain("const protectedInventoryUnavailable = !!backendAuthState.token && backendAuthState.user?.userType !== 'customer' && backendInventoryState.status !== 'connected';");
    expect(publicApp).toContain("const low = signals && !protectedInventoryUnavailable ? signals.lowStockCount : protectedInventoryUnavailable ? 0 : state.ingredients.filter");
    expect(publicApp).toContain("const inventoryRowsReady = !backendAuthState.token || backendAuthState.user?.userType === 'customer' || backendInventoryState.status === 'connected';");
    expect(publicApp).toContain("const lowStock = backendSignals ? backendSignals.lowStockCount : protectedInventoryUnavailable ? 0 : state.ingredients.filter");
    expect(publicApp).toContain("Open Inventory after backend records load to view item details.");
    expect(publicApp).toContain("clearProtectedBackendRows('inventory');");
    expect(publicApp).toContain("setBackendReadFailed(backendInventoryState);");

    const dashboardStart = publicApp.indexOf("function renderDashboard");
    const dashboardEnd = publicApp.indexOf("/* ----- KPI card helper", dashboardStart);
    const dashboardBody = publicApp.slice(dashboardStart, dashboardEnd);
    expect(dashboardBody.indexOf("const protectedInventoryUnavailable")).toBeGreaterThan(0);
    expect(dashboardBody.indexOf("const protectedInventoryUnavailable")).toBeLessThan(dashboardBody.indexOf("const lowStock"));
  });

  test("keeps backend writes fail-closed instead of local-saving", () => {
    expect(publicApp).toContain("Backend save failed. Nothing was saved locally.");
    expect(publicApp).toContain("Sign in before saving. Nothing was saved locally.");
  });
});
