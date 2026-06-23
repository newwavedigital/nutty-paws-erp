import { D1DataRecordStore } from "../records/d1-store";

export class D1FeedbackStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "feedback_items", "feedback");
  }
}
