import { describe, expect, it } from "vitest";
import { D1PickPackStore } from "../src/pick-pack/d1-store";
import { PickPackError } from "../src/pick-pack/service";

type QueryCall = {
  kind: "first" | "all" | "run";
  sql: string;
  binds: unknown[];
};

class FakeStatement {
  private binds: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly resolve: (call: QueryCall) => unknown,
  ) {}

  bind(...values: unknown[]) {
    this.binds = values;
    return this;
  }

  async first<T>() {
    return this.resolve({ kind: "first", sql: this.sql, binds: this.binds }) as T | null;
  }

  async all<T>() {
    return { results: this.resolve({ kind: "all", sql: this.sql, binds: this.binds }) as T[] };
  }

  async run() {
    return this.resolve({ kind: "run", sql: this.sql, binds: this.binds }) as D1Result;
  }
}

function has(sql: string, fragment: string) {
  return sql.toLowerCase().includes(fragment.toLowerCase());
}

function makeDb() {
  const calls: QueryCall[] = [];
  let inventoryUpdateCount = 0;

  return {
    calls,
    prepare(sql: string) {
      return new FakeStatement(sql, (call) => {
        calls.push(call);
        if (call.kind === "run") {
          if (has(call.sql, "UPDATE inventory_items")) {
            inventoryUpdateCount += 1;
            return { meta: { changes: inventoryUpdateCount === 1 ? 0 : 1 } };
          }
          return { meta: { changes: 1 } };
        }
        if (call.kind === "all") {
          if (has(call.sql, "FROM pick_pack_order_lines")) {
            return [
              {
                id: "line-1",
                pick_pack_order_id: "pick-1",
                line_number: 1,
                inventory_item_id: "inv-fg-1",
                quantity: 10,
                picked_quantity: 0,
                short_quantity: 0,
                item_name: "Finished Good 1",
                sku: "FG-1",
                customer_id: "customer-1",
                on_hand_quantity: 10,
              },
            ];
          }
          return [];
        }
        if (has(call.sql, "FROM pick_pack_orders")) {
          return {
            id: "pick-1",
            pick_pack_number: "PP-1001",
            customer_id: "customer-1",
            customer_po_number: null,
            date_submitted: "2026-06-20",
            date_needed_to_ship: null,
            status: "open",
            po_file_id: null,
            notes: null,
            picked_at: null,
            picked_by_user_id: null,
            shipped_at: null,
            shipped_by_user_id: null,
            short_stock_confirmed: 0,
            short_stock_json: "[]",
            created_by_user_id: "user-1",
            created_at: "2026-06-20T00:00:00.000Z",
            updated_at: "2026-06-20T00:00:00.000Z",
          };
        }
        if (has(call.sql, "FROM pick_pack_shipping_details")) {
          return null;
        }
        return null;
      });
    },
    async batch(statements: FakeStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database & { calls: QueryCall[] };
}

describe("pick-pack D1 store", () => {
  it("throws a conflict before writing order or movement rows when an inventory decrement updates zero rows", async () => {
    const db = makeDb();
    const store = new D1PickPackStore(db);

    await expect(
      store.completePickPackPick({
        orderId: "pick-1",
        pickedAt: "2026-06-20T12:00:00.000Z",
        pickedByUserId: "user-1",
        shortStockConfirmed: false,
        shortStockJson: "[]",
        shortStock: [],
        lines: [
          {
            id: "line-1",
            inventoryItemId: "inv-fg-1",
            itemName: "Finished Good 1",
            sku: "FG-1",
            customerId: "customer-1",
            quantity: 10,
            onHandQuantity: 0,
            pickedQuantity: 10,
            shortQuantity: 0,
          },
        ],
        inventoryAdjustments: [
          {
            inventoryItemId: "inv-fg-1",
            quantityDelta: -10,
            referenceType: "pick_pack_order",
            referenceId: "pick-1",
          },
        ],
        actorUserId: "user-1",
      }),
    ).rejects.toEqual(
      new PickPackError(
        "PICK_PACK_INVENTORY_CONFLICT",
        "Finished-good inventory changed before this order could be marked picked. Refresh and try again.",
      ),
    );

    expect(
      db.calls.some((call) => has(call.sql, "UPDATE pick_pack_orders") || has(call.sql, "INSERT INTO inventory_movements")),
    ).toBe(false);
  });
});
