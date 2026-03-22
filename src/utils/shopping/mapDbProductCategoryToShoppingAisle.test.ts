import { describe, it, expect } from "vitest";
import { mapDbProductCategoryToShoppingAisle } from "./mapDbProductCategoryToShoppingAisle";

describe("mapDbProductCategoryToShoppingAisle", () => {
  it("maps fish to meat aisle", () => {
    expect(mapDbProductCategoryToShoppingAisle("fish")).toBe("meat");
    expect(mapDbProductCategoryToShoppingAisle("Fish")).toBe("meat");
  });
  it("passes through core aisles", () => {
    expect(mapDbProductCategoryToShoppingAisle("vegetables")).toBe("vegetables");
    expect(mapDbProductCategoryToShoppingAisle("meat")).toBe("meat");
  });
  it("maps fats and spices to other", () => {
    expect(mapDbProductCategoryToShoppingAisle("fats")).toBe("other");
    expect(mapDbProductCategoryToShoppingAisle("spices")).toBe("other");
  });
  it("empty → other", () => {
    expect(mapDbProductCategoryToShoppingAisle(null)).toBe("other");
    expect(mapDbProductCategoryToShoppingAisle("")).toBe("other");
  });
});
