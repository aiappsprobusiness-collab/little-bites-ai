import { describe, expect, it } from "vitest";
import { extractKeyProductKeysFromIngredients, normalizeProductKey } from "./introducedProducts";

describe("normalizeProductKey", () => {
  it("matches Russian zucchini stems (JS \\b does not work on Cyrillic)", () => {
    expect(normalizeProductKey("кабачок")).toBe("zucchini");
    expect(normalizeProductKey("Пюре из кабачка")).toBe("zucchini");
    expect(normalizeProductKey("Молодой кабачок")).toBe("zucchini");
  });

  it("matches English aliases", () => {
    expect(normalizeProductKey("zucchini")).toBe("zucchini");
  });
});

describe("extractKeyProductKeysFromIngredients", () => {
  it("resolves keys from RU ingredient lines", () => {
    const keys = extractKeyProductKeysFromIngredients(
      [{ name: "Кабачок", display_text: "кабачок — 50 г" }],
      2
    );
    expect(keys).toContain("zucchini");
  });
});
