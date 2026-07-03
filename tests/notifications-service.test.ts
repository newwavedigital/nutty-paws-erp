import { describe, expect, it, vi } from "vitest";
import { notifySubmittedPurchaseOrder } from "../src/notifications/service";
import type { PurchaseOrderRecord } from "../src/purchase-orders/service";

function makePO(overrides: Partial<PurchaseOrderRecord> = {}): PurchaseOrderRecord {
  return {
    id: "po-1",
    poNumber: "PO-1001",
    customerId: "customer-1",
    status: "supply_chain_review",
    depositStatus: "not_required",
    requestedShipDate: "2026-07-01",
    notes: "rush order",
    postShipmentCoaFileId: null,
    lines: [
      {
        id: "line-1",
        purchaseOrderId: "po-1",
        lineNumber: 1,
        description: "Almond butter",
        quantity: 25,
        unitOfMeasure: "lb",
        productId: null,
        masterItemId: "master-1",
        supplyChainStatus: "pending",
      },
    ],
    ...overrides,
  };
}

describe("submitted purchase order notifications", () => {
  it("skips when submitted-PO SendGrid notification is disabled", async () => {
    const sender = vi.fn();

    const result = await notifySubmittedPurchaseOrder(
      {
        SENDGRID_SUBMITTED_PO_ENABLED: "false",
        SENDGRID_API_KEY: "sg-key",
        SUBMITTED_PO_NOTIFICATION_TO: "supply@example.com",
        SUBMITTED_PO_NOTIFICATION_FROM: "erp@example.com",
      },
      makePO(),
      sender,
    );

    expect(result).toEqual({ status: "skipped", reason: "disabled" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("skips when enabled config is missing required values", async () => {
    const sender = vi.fn();

    const result = await notifySubmittedPurchaseOrder(
      {
        SENDGRID_SUBMITTED_PO_ENABLED: "true",
        SENDGRID_API_KEY: "sg-key",
        SUBMITTED_PO_NOTIFICATION_FROM: "erp@example.com",
      },
      makePO(),
      sender,
    );

    expect(result).toEqual({ status: "skipped", reason: "missing_config" });
    expect(sender).not.toHaveBeenCalled();
  });

  it("sends the submitted-PO payload when explicitly enabled", async () => {
    const sender = vi.fn().mockResolvedValue(undefined);

    const result = await notifySubmittedPurchaseOrder(
      {
        SENDGRID_SUBMITTED_PO_ENABLED: "true",
        SENDGRID_API_KEY: "sg-key",
        SUBMITTED_PO_NOTIFICATION_TO: "supply@example.com",
        SUBMITTED_PO_NOTIFICATION_FROM: "erp@example.com",
        SUBMITTED_PO_NOTIFICATION_CC: "owner@example.com, ops@example.com",
      },
      makePO(),
      sender,
    );

    expect(result).toEqual({ status: "sent" });
    expect(sender).toHaveBeenCalledWith({
      apiKey: "sg-key",
      to: ["supply@example.com"],
      from: "erp@example.com",
      cc: ["owner@example.com", "ops@example.com"],
      subject: "Submitted PO PO-1001 is ready for Supply Chain review",
      text: expect.stringContaining("PO PO-1001 was submitted and moved to Supply Chain review."),
    });
  });

  it("returns failed when the sender rejects", async () => {
    const sender = vi.fn().mockRejectedValue(new Error("SendGrid down"));

    const result = await notifySubmittedPurchaseOrder(
      {
        SENDGRID_SUBMITTED_PO_ENABLED: "true",
        SENDGRID_API_KEY: "sg-key",
        SUBMITTED_PO_NOTIFICATION_TO: "supply@example.com",
        SUBMITTED_PO_NOTIFICATION_FROM: "erp@example.com",
      },
      makePO(),
      sender,
    );

    expect(result).toEqual({ status: "failed", error: "SendGrid down" });
  });
});
