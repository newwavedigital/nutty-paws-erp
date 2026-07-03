import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import type { AuthStore } from "../auth/service";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const CONTENT_LIBRARY_KINDS = ["folder", "file"] as const;

export function registerContentLibraryRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
  createAuthStore: (db: D1Database) => AuthStore = (db) => new D1AuthStore(db),
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/content-library",
      moduleName: "content_library",
      tableName: "content_library_entries",
      defaultKind: "file",
      allowedKinds: CONTENT_LIBRARY_KINDS,
    },
    createStore,
    createAuthStore,
  );
}
