import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import type { AuthStore } from "../auth/service";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const FEEDBACK_KINDS = ["bug", "feature", "general"] as const;

export function registerFeedbackRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
  createAuthStore: (db: D1Database) => AuthStore = (db) => new D1AuthStore(db),
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
    createAuthStore,
  );
}
