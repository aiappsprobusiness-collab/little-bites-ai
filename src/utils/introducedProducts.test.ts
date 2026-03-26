import { describe, expect, it } from "vitest";
import {
  calendarDaysBetweenLocalYmd,
  evaluateInfantRecipeComplementaryRules,
  extractKeyProductKeysFromIngredients,
  getIntroducingDaysPassed,
  getIntroducingDisplayDay,
  getValidInfantRecipes,
  isIntroducingGracePeriod,
  isIntroducingPeriodActive,
  normalizeProductKey,
  shouldAutoClearIntroducingPeriod,
} from "./introducedProducts";

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

describe("evaluateInfantRecipeComplementaryRules", () => {
  const ing = (lines: Array<{ name: string; display_text?: string }>) => lines;

  it("start: only one allowed vegetable row (cauliflower alone)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([{ name: "Цветная капуста", display_text: "100 г" }]),
      []
    );
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("start_ok");
    expect(r.canonicalKeys).toEqual(["cauliflower"]);
  });

  it("start: rejects cauliflower + potato (two food rows)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Цветная капуста", display_text: "50 г" },
        { name: "Картофель", display_text: "30 г" },
      ]),
      []
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("start_multi_food_rows");
  });

  it("start: rejects single row oatmeal / porridge key", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([{ name: "Овсяная каша", display_text: "на воде" }]),
      []
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("start_not_allowed_product");
  });

  it("after zucchini introduced: zucchini + potato allowed (one novel)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Кабачок", display_text: "40 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["zucchini"]
    );
    expect(r.valid).toBe(true);
    expect(r.novelKeys).toEqual(["potato"]);
  });

  it("after zucchini introduced: potato + carrot rejected (two novel)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Картофель", display_text: "40 г" },
        { name: "Морковь", display_text: "40 г" },
      ]),
      ["zucchini"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("after_multiple_novel_products");
  });

  it("after all key products introduced: combo only familiar — invalid for new block (second block)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Кабачок", display_text: "40 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["zucchini", "potato"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("after_no_novel_for_new_block");
  });

  it("getValidInfantRecipes filters list", () => {
    const recipes = [
      { id: "a", recipe_ingredients: ing([{ name: "Кабачок", display_text: "50 г" }]) },
      { id: "b", recipe_ingredients: ing([{ name: "Картофель", display_text: "50 г" }]) },
    ];
    const ok = getValidInfantRecipes(recipes, { introducedProductKeys: [], infantSlotRole: "primary" });
    expect(ok.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("introducing period — дни и пропуски", () => {
  const start = "2026-03-15";

  it("daysPassed 0: день 1, активный период", () => {
    const now = new Date(2026, 2, 15);
    expect(getIntroducingDaysPassed(start, now)).toBe(0);
    expect(getIntroducingDisplayDay(start, now)).toBe(1);
    expect(isIntroducingPeriodActive("zucchini", start, now)).toBe(true);
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
    expect(shouldAutoClearIntroducingPeriod(start, now)).toBe(false);
  });

  it("daysPassed 2: день 3, ещё активный период", () => {
    const now = new Date(2026, 2, 17);
    expect(getIntroducingDaysPassed(start, now)).toBe(2);
    expect(getIntroducingDisplayDay(start, now)).toBe(3);
    expect(isIntroducingPeriodActive("zucchini", start, now)).toBe(true);
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
  });

  it("daysPassed 3–4: без номера дня, grace UI", () => {
    const d3 = new Date(2026, 2, 18);
    expect(getIntroducingDaysPassed(start, d3)).toBe(3);
    expect(getIntroducingDisplayDay(start, d3)).toBeNull();
    expect(isIntroducingPeriodActive("zucchini", start, d3)).toBe(false);
    expect(isIntroducingGracePeriod("zucchini", start, d3)).toBe(true);

    const d4 = new Date(2026, 2, 19);
    expect(getIntroducingDaysPassed(start, d4)).toBe(4);
    expect(isIntroducingGracePeriod("zucchini", start, d4)).toBe(true);
  });

  it("daysPassed 5+: автосброс", () => {
    const now = new Date(2026, 2, 20);
    expect(getIntroducingDaysPassed(start, now)).toBe(5);
    expect(shouldAutoClearIntroducingPeriod(start, now)).toBe(true);
    expect(getIntroducingDisplayDay(start, now)).toBeNull();
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
  });

  it("calendarDaysBetweenLocalYmd", () => {
    expect(calendarDaysBetweenLocalYmd("2026-03-15", "2026-03-20")).toBe(5);
  });
});
