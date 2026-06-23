import { D1DataRecordStore } from "../records/d1-store";

export class D1SupplierStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "suppliers", "supplier");
  }
}
