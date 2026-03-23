import { describe, it, expect } from "vitest";
import {
  inferDbProductCategoryFromText,
  resolveProductCategoryForShoppingIngredient,
  normalizeIngredientTextForCategoryMatch,
} from "./inferShoppingCategoryFromIngredient";

describe("inferShoppingCategoryFromIngredient", () => {
  it("normalizes ё to е", () => {
    expect(normalizeIngredientTextForCategoryMatch("Свёкла", "")).toContain("свекла");
  });

  it("infers vegetables and fruits from Russian names", () => {
    expect(inferDbProductCategoryFromText("свёкла, 1 шт")).toBe("vegetables");
    expect(inferDbProductCategoryFromText("авокадо")).toBe("fruits");
    expect(inferDbProductCategoryFromText("Авокадо, 1 шт.")).toBe("fruits");
  });

  it("infers fish from genitive тунца and стейк тунца", () => {
    expect(inferDbProductCategoryFromText("стейк тунца, 150 г")).toBe("fish");
    expect(inferDbProductCategoryFromText("филе тунца")).toBe("fish");
    expect(inferDbProductCategoryFromText("тунец консервированный")).toBe("fish");
  });

  it("infers dairy for tofu", () => {
    expect(inferDbProductCategoryFromText("мягкий тофу")).toBe("dairy");
    expect(inferDbProductCategoryFromText("тофу, 100 г")).toBe("dairy");
  });

  it("томатная паста не попадает в grains из-за слова «паста»", () => {
    expect(inferDbProductCategoryFromText("томатная паста, 2 ст.л.")).toBe("other");
  });

  it("resolve uses DB when set, infers when other", () => {
    expect(resolveProductCategoryForShoppingIngredient("fish", "x", null)).toBe("meat");
    expect(resolveProductCategoryForShoppingIngredient("other", "авокадо", null)).toBe("fruits");
    expect(resolveProductCategoryForShoppingIngredient(null, "хлеб цельнозерновой", null)).toBe("grains");
  });
});
