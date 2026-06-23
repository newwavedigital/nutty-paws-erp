import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const FOOD_SAFETY_KINDS = ["complaint", "sanitation", "swab", "ccp", "ncr", "recall"] as const;

export function registerFoodSafetyRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/food-safety",
      moduleName: "food_safety",
      tableName: "food_safety_records",
      defaultKind: "complaint",
      allowedKinds: FOOD_SAFETY_KINDS,
    },
    createStore,
  );
}
