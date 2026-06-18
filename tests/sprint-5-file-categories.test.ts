import { describe, expect, it } from "vitest";
import { asFileCategory, asFileOwnerType, makeStorageKey } from "../src/files/service";

describe("Sprint 5 file categories", () => {
  it("accepts product image, nutrition facts, and inventory CoA file categories", () => {
    expect(asFileOwnerType("product")).toBe("product");
    expect(asFileOwnerType("inventory_item")).toBe("inventory_item");
    expect(asFileCategory("product_image")).toBe("product_image");
    expect(asFileCategory("nutrition_facts")).toBe("nutrition_facts");
    expect(asFileCategory("inventory_coa")).toBe("inventory_coa");

    expect(
      makeStorageKey({
        ownerType: "inventory_item",
        ownerId: "inv-1",
        fileCategory: "inventory_coa",
        fileName: "Raw Peanut COA.pdf",
      }),
    ).toMatch(/^files\/inventory_item\/inv-1\/inventory_coa\/.+-raw-peanut-coa.pdf$/);
  });
});
