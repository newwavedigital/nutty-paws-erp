import type { Context } from "hono";
import { ValidationError } from "./errors";

type ApiContext = Context<{ Bindings: Env; Variables: { requestId?: string } }>;

export type JsonObject = Record<string, unknown>;

export async function parseJsonObject(c: ApiContext): Promise<JsonObject> {
  let parsed: unknown;

  try {
    parsed = await c.req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return parsed as JsonObject;
}

export function requireFields<TField extends string>(
  body: JsonObject,
  fields: TField[],
): Record<TField, unknown> {
  const missingFields = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required field${missingFields.length === 1 ? "" : "s"}: ${missingFields.join(", ")}`,
      { fields: missingFields },
    );
  }

  return Object.fromEntries(fields.map((field) => [field, body[field]])) as Record<TField, unknown>;
}
