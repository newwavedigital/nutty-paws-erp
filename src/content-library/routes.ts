import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const CONTENT_LIBRARY_KINDS = ["folder", "file"] as const;

export function registerContentLibraryRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
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
  );
}
