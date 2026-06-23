import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const SUPPLIER_KINDS = ["supplier"] as const;

export function registerSupplierRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/suppliers",
      moduleName: "supplier",
      tableName: "suppliers",
      defaultKind: "supplier",
      allowedKinds: SUPPLIER_KINDS,
    },
    createStore,
  );
}
