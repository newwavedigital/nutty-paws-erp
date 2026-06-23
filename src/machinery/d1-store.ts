import { D1DataRecordStore } from "../records/d1-store";

export class D1MachineryStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "machinery_records", "machinery");
  }
}
