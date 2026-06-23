import { D1DataRecordStore } from "../records/d1-store";

export class D1ContentLibraryStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "content_library_entries", "content_library");
  }
}
