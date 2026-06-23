import { D1DataRecordStore } from "../records/d1-store";

export class D1FoodSafetyStore extends D1DataRecordStore {
  constructor(db: D1Database) {
    super(db, "food_safety_records", "food_safety");
  }
}
