import type { PurchaseOrderRecord } from "../purchase-orders/service";
import { sendSubmittedPurchaseOrderEmail, type SendGridSubmittedPOMessage } from "./sendgrid";

export type NotificationEnv = Partial<{
  SENDGRID_SUBMITTED_PO_ENABLED: string;
  SENDGRID_API_KEY: string;
  SUBMITTED_PO_NOTIFICATION_TO: string;
  SUBMITTED_PO_NOTIFICATION_FROM: string;
  SUBMITTED_PO_NOTIFICATION_CC: string;
}>;

export type SubmittedPONotificationResult =
  | { status: "sent" }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: "disabled" | "missing_config" };

export type SubmittedPONotificationSender = (message: SendGridSubmittedPOMessage) => Promise<void>;

export type NotifySubmittedPurchaseOrder = (
  env: NotificationEnv,
  po: PurchaseOrderRecord,
) => Promise<SubmittedPONotificationResult>;

export async function notifySubmittedPurchaseOrder(
  env: NotificationEnv,
  po: PurchaseOrderRecord,
  sender: SubmittedPONotificationSender = sendSubmittedPurchaseOrderEmail,
): Promise<SubmittedPONotificationResult> {
  const config = parseSubmittedPOConfig(env);
  if (config.status === "skipped") {
    return config;
  }

  try {
    await sender(buildSubmittedPONotificationMessage(config, po));
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: errorMessage(error) };
  }
}

function parseSubmittedPOConfig(env: NotificationEnv) {
  if (env.SENDGRID_SUBMITTED_PO_ENABLED !== "true") {
    return { status: "skipped" as const, reason: "disabled" as const };
  }

  const apiKey = requiredString(env.SENDGRID_API_KEY);
  const to = parseEmailList(env.SUBMITTED_PO_NOTIFICATION_TO);
  const from = requiredString(env.SUBMITTED_PO_NOTIFICATION_FROM);

  if (!apiKey || to.length === 0 || !from) {
    return { status: "skipped" as const, reason: "missing_config" as const };
  }

  return {
    status: "enabled" as const,
    apiKey,
    to,
    from,
    cc: parseEmailList(env.SUBMITTED_PO_NOTIFICATION_CC),
  };
}

function buildSubmittedPONotificationMessage(
  config: Exclude<ReturnType<typeof parseSubmittedPOConfig>, SubmittedPONotificationResult>,
  po: PurchaseOrderRecord,
): SendGridSubmittedPOMessage {
  const lineSummary = po.lines
    .map((line) => `- ${line.description}: ${line.quantity} ${line.unitOfMeasure}`)
    .join("\n");

  return {
    apiKey: config.apiKey,
    to: config.to,
    from: config.from,
    cc: config.cc,
    subject: `Submitted PO ${po.poNumber} is ready for Supply Chain review`,
    text: [
      `PO ${po.poNumber} was submitted and moved to Supply Chain review.`,
      "",
      `Customer ID: ${po.customerId}`,
      `Requested ship date: ${po.requestedShipDate ?? "not provided"}`,
      `Line count: ${po.lines.length}`,
      "",
      lineSummary,
      "",
      `Notes: ${po.notes ?? "none"}`,
    ].join("\n"),
  };
}

function parseEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

function requiredString(value: string | undefined) {
  if (!value || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown notification error";
}
