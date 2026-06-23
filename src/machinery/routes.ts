import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const MACHINERY_KINDS = ["maintenance", "issue"] as const;

export function registerMachineryRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/machinery",
      moduleName: "machinery",
      tableName: "machinery_records",
      defaultKind: "maintenance",
      allowedKinds: MACHINERY_KINDS,
    },
    createStore,
  );
}
