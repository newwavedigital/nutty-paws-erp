import type { Hono } from "hono";
import type { AppBindings } from "../app";
import { registerDataRecordRoutes } from "../records/routes";
import type { DataRecordStore } from "../records/service";

export const TEAM_CHAT_KINDS = ["channel", "message"] as const;

export function registerTeamChatRoutes(
  app: Hono<AppBindings>,
  createStore?: (db: D1Database) => DataRecordStore,
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
  );
}
