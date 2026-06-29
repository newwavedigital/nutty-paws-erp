import { describe, expect, it, vi } from "vitest";
import { sendSubmittedPurchaseOrderEmail } from "../src/notifications/sendgrid";

describe("sendgrid submitted-PO delivery", () => {
  it("serializes the authorization header and CC recipients", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 202 }));

    await sendSubmittedPurchaseOrderEmail({
      apiKey: "sg-test-key",
      to: ["supply@example.com"],
      from: "erp@example.com",
      cc: ["owner@example.com", "ops@example.com"],
      subject: "PO Submitted",
      text: "Submitted",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer sg-test-key",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      personalizations: [
        {
          to: [{ email: "supply@example.com" }],
          cc: [{ email: "owner@example.com" }, { email: "ops@example.com" }],
        },
      ],
      from: { email: "erp@example.com" },
      subject: "PO Submitted",
      content: [{ type: "text/plain", value: "Submitted" }],
    });

    fetchMock.mockRestore();
  });

  it("omits CC from the payload when none are provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 202 }));

    await sendSubmittedPurchaseOrderEmail({
      apiKey: "sg-test-key",
      to: ["supply@example.com"],
      from: "erp@example.com",
      cc: [],
      subject: "PO Submitted",
      text: "Submitted",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      personalizations: [
        {
          to: [{ email: "supply@example.com" }],
        },
      ],
      from: { email: "erp@example.com" },
      subject: "PO Submitted",
      content: [{ type: "text/plain", value: "Submitted" }],
    });

    fetchMock.mockRestore();
  });
});
