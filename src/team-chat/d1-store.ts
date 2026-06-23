import { D1DataRecordStore } from "../records/d1-store";

export class D1TeamChatStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "team_chat_entries", "team_chat");
  }
}
