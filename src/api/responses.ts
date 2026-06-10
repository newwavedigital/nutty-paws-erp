import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "./errors";

type ApiContext = Context<{ Bindings: Env; Variables: { requestId?: string } }>;

function requestMeta(c: ApiContext) {
  return {
    requestId: c.get("requestId") ?? null,
  };
}

export function ok<TData>(c: ApiContext, data: TData, status: ContentfulStatusCode = 200) {
  return c.json(
    {
      ok: true,
      data,
      meta: requestMeta(c),
    },
    status,
  );
}

export function fail(c: ApiContext, error: ApiError) {
  return c.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      meta: requestMeta(c),
    },
    error.status as ContentfulStatusCode,
  );
}
