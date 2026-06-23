import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const FEEDBACK_KINDS = ["bug", "feature", "general"] as const;

export function registerFeedbackRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/feedback",
      moduleName: "feedback",
      tableName: "feedback_items",
      defaultKind: "general",
      allowedKinds: FEEDBACK_KINDS,
      allowAnyAuthenticatedCreate: true,
    },
    createStore,
  );
}
