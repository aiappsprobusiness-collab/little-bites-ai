import { describe, it, expect } from "vitest";
import {
  applyYoToE,
  resolveCanonicalShoppingNameSegment,
  parseGramsPerPieceFromDisplayText,
  CANONICAL_NAME_ALIASES,
} from "./canonicalShoppingIngredient";

describe("canonicalShoppingIngredient", () => {
  it("applyYoToE unifies ё/е", () => {
    expect(applyYoToE("перец чёрный молотый")).toBe("перец черный молотый");
  });

  it("aliases map synonyms to one segment", () => {
    expect(CANONICAL_NAME_ALIASES["яйцо куриное"]).toBe("яйца");
    expect(CANONICAL_NAME_ALIASES["гречневая крупа"]).toBe("гречка");
    expect(CANONICAL_NAME_ALIASES["растительное масло"]).toBe("масло растительное");
    expect(CANONICAL_NAME_ALIASES["сок лимона"]).toBe("лимонный сок");
  });

  it("resolveCanonicalShoppingNameSegment applies alias after normalize-style string", () => {
    expect(resolveCanonicalShoppingNameSegment("яйца куриные").segment).toBe("яйца");
    expect(resolveCanonicalShoppingNameSegment("масло растительное").segment).toBe("масло растительное");
  });

  it("parseGramsPerPieceFromDisplayText reads grams in parens per piece", () => {
    expect(parseGramsPerPieceFromDisplayText("1 шт. (100 г)", 1)).toBe(100);
    expect(parseGramsPerPieceFromDisplayText("2 шт. (200 г)", 2)).toBe(100);
  });
});
