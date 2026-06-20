import { describe, expect, it } from "vitest";
import {
  PickPackError,
  createPickPackOrder,
  listPickPackOrders,
  markPickPackPicked,
  markPickPackShipped,
  updatePickPackOrder,
  updatePickPackShippingDetails,
  type PickPackOrderRecord,
  type PickPackStore,
} from "../src/pick-pack/service";

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

function createStore(overrides: Partial<PickPackStore> = {}) {
  const calls: string[] = [];
  let order = makeOrder();
  let sequence = 1000;
  const inventoryOnHand = new Map<string, number>([["inv-fg-1", 5]]);
  const store: PickPackStore & {
    calls: string[];
    setOrder(next: PickPackOrderRecord): void;
    setOnHand(id: string, quantity: number): void;
  } = {
    calls,
    setOrder(next) {
      order = next;
    },
    setOnHand(id, quantity) {
      inventoryOnHand.set(id, quantity);
    },
    async listOrders() {
      calls.push("listOrders");
      return [order];
    },
    async getOrder(id) {
      calls.push(`getOrder:${id}`);
      return id === order.id ? order : null;
    },
    async customerExists(customerId) {
      calls.push(`customerExists:${customerId}`);
      return customerId === "customer-1";
    },
    async getFinishedGoodInventoryItem(inventoryItemId) {
      calls.push(`getFinishedGoodInventoryItem:${inventoryItemId}`);
      if (!inventoryOnHand.has(inventoryItemId)) return null;
      return {
        id: inventoryItemId,
        itemName: inventoryItemId === "inv-fg-1" ? "Finished Good 1" : "Finished Good 2",
        sku: inventoryItemId === "inv-fg-1" ? "FG-1" : "FG-2",
        customerId: inventoryItemId === "inv-fg-1" ? "customer-1" : null,
        onHandQuantity: inventoryOnHand.get(inventoryItemId) ?? 0,
      };
    },
    async nextPickPackSequence() {
      calls.push("nextPickPackSequence");
      sequence += 1;
      return sequence;
    },
    async createOrder(input) {
      calls.push(`createOrder:${input.pickPackNumber}`);
      order = makeOrder({
        id: input.id,
        pickPackNumber: input.pickPackNumber,
        customerId: input.customerId,
        customerPoNumber: input.customerPoNumber ?? null,
        dateSubmitted: input.dateSubmitted,
        dateNeededToShip: input.dateNeededToShip ?? null,
        poFileId: input.poFileId ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line, index) => ({
          id: `line-${index + 1}`,
          inventoryItemId: line.inventoryItemId,
          itemName: line.inventoryItemId === "inv-fg-1" ? "Finished Good 1" : "Finished Good 2",
          sku: line.inventoryItemId === "inv-fg-1" ? "FG-1" : "FG-2",
          customerId: line.inventoryItemId === "inv-fg-1" ? "customer-1" : null,
          quantity: line.quantity,
          onHandQuantity: inventoryOnHand.get(line.inventoryItemId) ?? 0,
          pickedQuantity: 0,
          shortQuantity: 0,
        })),
      });
      return order;
    },
    async replaceOrderLines(orderId, lines) {
      calls.push(`replaceOrderLines:${orderId}`);
      order = { ...order, lines };
    },
    async updateOrder(input) {
      calls.push(`updateOrder:${input.orderId}`);
      order = {
        ...order,
        customerPoNumber: input.customerPoNumber ?? order.customerPoNumber,
        dateNeededToShip: input.dateNeededToShip ?? order.dateNeededToShip,
        notes: input.notes ?? order.notes,
      };
      return order;
    },
    async completePickPackPick(input) {
      calls.push(`completePickPackPick:${input.orderId}`);
      for (const adjustment of input.inventoryAdjustments) {
        calls.push(`adjustFinishedGoodInventory:${adjustment.inventoryItemId}:${adjustment.quantityDelta}`);
        const next = (inventoryOnHand.get(adjustment.inventoryItemId) ?? 0) + adjustment.quantityDelta;
        inventoryOnHand.set(adjustment.inventoryItemId, next);
      }
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
      calls.push(`markOrderShipped:${input.orderId}`);
      order = { ...order, status: "shipped", shippedAt: input.shippedAt };
      return order;
    },
    async upsertShippingDetails(input) {
      calls.push(`upsertShippingDetails:${input.orderId}`);
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
    async createStatusEvent(input) {
      calls.push(`createStatusEvent:${input.eventType}`);
    },
    async createAuditEvent(input) {
      calls.push(`audit:${input.action}`);
    },
    ...overrides,
  };
  return store;
}

describe("pick pack service", () => {
  it("lists, creates, updates, picks, ships, and preserves stock and timestamps", async () => {
    const store = createStore();

    await expect(listPickPackOrders(store)).resolves.toHaveLength(1);

    const created = await createPickPackOrder(store, {
      customerId: "customer-1",
      customerPoNumber: "CHEWY-1009",
      dateSubmitted: "2026-06-20",
      dateNeededToShip: "2026-06-27",
      poFileId: "file-1",
      notes: "rush",
      lines: [{ inventoryItemId: "inv-fg-1", quantity: 12 }],
      actorUserId: "user-1",
    });

    expect(created.pickPackNumber).toBe("PP-1001");
    expect(store.calls).toContain("createOrder:PP-1001");

    await expect(
      updatePickPackOrder(store, {
        orderId: created.id,
        customerId: "customer-1",
        customerPoNumber: "CHEWY-1010",
        dateSubmitted: "2026-06-20",
        dateNeededToShip: "2026-06-28",
        notes: "updated",
        lines: [{ inventoryItemId: "inv-fg-1", quantity: 10 }],
        actorUserId: "user-1",
      }),
    ).resolves.toMatchObject({ customerPoNumber: "CHEWY-1010", notes: "updated" });

    await expect(markPickPackPicked(store, { orderId: created.id })).rejects.toMatchObject({
      code: "SHORT_STOCK_WARNING",
      status: 409,
    });

    const confirmed = await markPickPackPicked(store, {
      orderId: created.id,
      confirmShortStock: true,
      actorUserId: "warehouse-user",
    });
    const repeatPicked = await markPickPackPicked(store, {
      orderId: created.id,
      confirmShortStock: true,
      actorUserId: "warehouse-user",
    });

    expect(confirmed.status).toBe("picked");
    expect(confirmed.shortStockConfirmed).toBe(true);
    expect(confirmed.lines[0]).toMatchObject({ pickedQuantity: 5, shortQuantity: 5 });
    expect(repeatPicked.pickedAt).toBe(confirmed.pickedAt);
    expect(store.calls.filter((call) => call.startsWith("completePickPackPick:"))).toHaveLength(1);
    expect(store.calls.filter((call) => call.startsWith("adjustFinishedGoodInventory:inv-fg-1"))).toHaveLength(1);

    const shipping = await updatePickPackShippingDetails(store, {
      orderId: created.id,
      shippingMode: "parcel",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      notes: "Leave at dock",
      actorUserId: "warehouse-user",
    });
    expect(shipping.shippingMode).toBe("parcel");

    const shipped = await markPickPackShipped(store, { orderId: created.id, actorUserId: "warehouse-user" });
    const shippedAgain = await markPickPackShipped(store, { orderId: created.id, actorUserId: "warehouse-user" });
    expect(shipped.status).toBe("shipped");
    expect(shippedAgain.shippedAt).toBe(shipped.shippedAt);
    expect(store.calls).toContain("audit:pick_pack_order.shipped");
  });

  it("rejects create and update without valid positive finished good lines", async () => {
    const store = createStore();

    await expect(
      createPickPackOrder(store, {
        customerId: "customer-1",
        dateSubmitted: "2026-06-20",
        lines: [],
      }),
    ).rejects.toMatchObject({ code: "PICK_PACK_LINES_REQUIRED" });

    await expect(
      createPickPackOrder(store, {
        customerId: "customer-1",
        dateSubmitted: "2026-06-20",
        lines: [{ inventoryItemId: "inv-missing", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PICK_PACK_INVENTORY_ITEM_NOT_FOUND" });
  });

  it("rejects customer mismatches for customer-scoped finished goods", async () => {
    const store = createStore({
      async getFinishedGoodInventoryItem(inventoryItemId) {
        return {
          id: inventoryItemId,
          itemName: "Finished Good 2",
          sku: "FG-2",
          customerId: "customer-2",
          onHandQuantity: 10,
        };
      },
    });

    await expect(
      createPickPackOrder(store, {
        customerId: "customer-1",
        dateSubmitted: "2026-06-20",
        lines: [{ inventoryItemId: "inv-fg-2", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PICK_PACK_CUSTOMER_MISMATCH" });
  });

  it("returns existing shipped records without changing shippedAt", async () => {
    const store = createStore();
    const first = await markPickPackPicked(store, { orderId: "pp-1", confirmShortStock: true });
    const firstShipped = await markPickPackShipped(store, { orderId: first.id });
    const secondShipped = await markPickPackShipped(store, { orderId: first.id });
    expect(secondShipped.shippedAt).toBe(firstShipped.shippedAt);
  });
});
