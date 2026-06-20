export type SendGridSubmittedPOMessage = {
  apiKey: string;
  to: string[];
  from: string;
  cc: string[];
  subject: string;
  text: string;
};

export async function sendSubmittedPurchaseOrderEmail(message: SendGridSubmittedPOMessage) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${message.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: message.to.map((email) => ({ email })),
          ...(message.cc.length > 0 ? { cc: message.cc.map((email) => ({ email })) } : {}),
        },
      ],
      from: { email: message.from },
      subject: message.subject,
      content: [{ type: "text/plain", value: message.text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`SendGrid request failed with ${response.status}`);
  }
}
