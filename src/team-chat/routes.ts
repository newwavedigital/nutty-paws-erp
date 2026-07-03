import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import type { AuthStore } from "../auth/service";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const TEAM_CHAT_KINDS = ["channel", "message"] as const;

export function registerTeamChatRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
  createAuthStore: (db: D1Database) => AuthStore = (db) => new D1AuthStore(db),
) {
  registerDataRecordRoutes(
    app,
    {
      basePath: "/api/team-chat",
      moduleName: "team_chat",
      tableName: "team_chat_entries",
      defaultKind: "message",
      allowedKinds: TEAM_CHAT_KINDS,
    },
    createStore,
    createAuthStore,
  );
}
