import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerPickPackRoutes } from "../src/pick-pack/routes";
import type { PickPackOrderRecord, PickPackStore } from "../src/pick-pack/service";

function makeOrder(overrides: Partial<PickPackOrderRecord> = {}): PickPackOrderRecord {
  return {
    id: "pp-1",
    pickPackNumber: "PP-1001",
    customerId: "customer-1",
    customerPoNumber: "CHEWY-1009",
    dateSubmitted: "2026-06-20",
    dateNeededToShip: "2026-06-27",
    status: "open",
    poFileId: null,
    notes: null,
    pickedAt: null,
    shippedAt: null,
    shortStockConfirmed: false,
    shortStock: [],
    lines: [
      {
        id: "line-1",
        inventoryItemId: "inv-fg-1",
        itemName: "Finished Good 1",
        sku: "FG-1",
        customerId: "customer-1",
        quantity: 12,
        onHandQuantity: 5,
        pickedQuantity: 0,
        shortQuantity: 0,
      },
    ],
    shippingDetails: null,
    ...overrides,
  };
}

function createStore(): PickPackStore {
  let order = makeOrder();
  return {
    async listOrders() {
      return [order];
    },
    async getOrder() {
      return order;
    },
    async customerExists() {
      return true;
    },
    async getFinishedGoodInventoryItem(inventoryItemId) {
      return {
        id: inventoryItemId,
        itemName: "Finished Good 1",
        sku: "FG-1",
        customerId: "customer-1",
        onHandQuantity: 5,
      };
    },
    async nextPickPackSequence() {
      return 1001;
    },
    async createOrder(input) {
      order = makeOrder({
        id: input.id,
        pickPackNumber: input.pickPackNumber,
        customerPoNumber: input.customerPoNumber ?? null,
        lines: input.lines.map((line, index) => ({
          id: `line-${index + 1}`,
          inventoryItemId: line.inventoryItemId,
          itemName: "Finished Good 1",
          sku: "FG-1",
          customerId: "customer-1",
          quantity: line.quantity,
          onHandQuantity: 5,
          pickedQuantity: 0,
          shortQuantity: 0,
        })),
      });
      return order;
    },
    async replaceOrderLines(orderId, lines) {
      order = { ...order, lines };
    },
    async updateOrder() {
      return order;
    },
    async completePickPackPick(input) {
      order = {
        ...order,
        status: "picked",
        pickedAt: input.pickedAt,
        shortStockConfirmed: input.shortStockConfirmed,
        shortStock: input.shortStock,
        lines: input.lines ?? order.lines,
      };
      return order;
    },
    async markOrderShipped(input) {
      order = { ...order, status: "shipped", shippedAt: input.shippedAt };
      return order;
    },
    async cancelOrder() {
      order = { ...order, status: "cancelled" };
      return order;
    },
    async upsertShippingDetails(input) {
      order = {
        ...order,
        shippingDetails: {
          id: "shipping-details-1",
          pickPackOrderId: input.orderId,
          shippingMode: input.shippingMode,
          carrier: input.carrier ?? null,
          trackingNumber: input.trackingNumber ?? null,
          bolNumber: input.bolNumber ?? null,
          palletCount: input.palletCount ?? null,
          weight: input.weight ?? null,
          dimensionsJson: input.dimensionsJson ?? "{}",
          notes: input.notes ?? null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
      };
      return order.shippingDetails!;
    },
    async createStatusEvent() {},
    async createAuditEvent() {},
  };
}

function createRouteApp() {
  const store = createStore();
  return createApp((app) => registerPickPackRoutes(app, () => store));
}

describe("pick pack routes", () => {
  it("lists, creates, updates, warns on short stock, saves shipping, and ships", async () => {
    const app = createRouteApp();

    const list = await app.request("/api/pick-pack/orders");
    const created = await app.request("/api/pick-pack/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        dateSubmitted: "2026-06-20",
        lines: [{ inventoryItemId: "inv-fg-1", quantity: 12 }],
      }),
    });
    const updated = await app.request("/api/pick-pack/orders/pp-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        dateSubmitted: "2026-06-20",
        lines: [{ inventoryItemId: "inv-fg-1", quantity: 10 }],
      }),
    });
    const warning = await app.request("/api/pick-pack/orders/pp-1/mark-picked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const confirmed = await app.request("/api/pick-pack/orders/pp-1/mark-picked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmShortStock: true }),
    });
    const shipping = await app.request("/api/pick-pack/orders/pp-1/shipping", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shippingMode: "parcel", carrier: "UPS" }),
    });
    const shipped = await app.request("/api/pick-pack/orders/pp-1/mark-shipped", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ ok: true, data: [makeOrder()] });
    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(warning.status).toBe(409);
    await expect(warning.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "SHORT_STOCK_WARNING" },
    });
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toMatchObject({ ok: true, data: { status: "picked" } });
    expect(shipping.status).toBe(200);
    expect(shipped.status).toBe(200);
    await expect(shipped.json()).resolves.toMatchObject({ ok: true, data: { status: "shipped" } });
  });

  it("cancels open Pick & Pack orders through backend status", async () => {
    const app = createRouteApp();

    const cancelled = await app.request("/api/pick-pack/orders/pp-1/cancel", { method: "POST" });

    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({ ok: true, data: { status: "cancelled" } });
  });

  it("rejects malformed optional JSON before cancelling a Pick & Pack order", async () => {
    const app = createRouteApp();

    const malformed = await app.request("/api/pick-pack/orders/pp-1/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const list = await app.request("/api/pick-pack/orders");

    expect(malformed.status).toBe(400);
    await expect(list.json()).resolves.toMatchObject({ ok: true, data: [{ status: "open" }] });
  });
});
