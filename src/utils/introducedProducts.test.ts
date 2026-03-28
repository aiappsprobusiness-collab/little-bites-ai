import { describe, expect, it } from "vitest";
import {
  calendarDaysBetweenLocalYmd,
  evaluateInfantRecipeComplementaryRules,
  evaluateInfantSecondaryFamiliarOnly,
  extractKeyProductKeysFromIngredients,
  getInfantPrimaryProductSummaryLine,
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

  it("matches salmon RU (лосось/лосося, семга/сёмга)", () => {
    expect(normalizeProductKey("лосось")).toBe("salmon");
    expect(normalizeProductKey("филе лосося")).toBe("salmon");
    expect(normalizeProductKey("сёмга")).toBe("salmon");
    expect(normalizeProductKey("семга")).toBe("salmon");
  });

  it("matches common fish stems", () => {
    expect(normalizeProductKey("форель")).toBe("trout");
    expect(normalizeProductKey("филе форели")).toBe("trout");
    expect(normalizeProductKey("треска")).toBe("cod");
    expect(normalizeProductKey("филе трески")).toBe("cod");
    expect(normalizeProductKey("хек")).toBe("hake");
    expect(normalizeProductKey("минтай")).toBe("pollock");
    expect(normalizeProductKey("рыба белая")).toBe("fish");
  });

  it("matches poultry/meat word forms", () => {
    expect(normalizeProductKey("куриное филе")).toBe("chicken");
    expect(normalizeProductKey("говяжий фарш")).toBe("beef");
    expect(normalizeProductKey("филе индейки")).toBe("turkey");
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

  it("after start: salmon + potato with potato introduced — one novel (primary ok)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Лосось", display_text: "40 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["potato"]
    );
    expect(r.valid).toBe(true);
    expect(r.novelKeys).toEqual(["salmon"]);
  });

  it("after start: salmon + carrot with only potato — two novel (primary invalid)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Лосось", display_text: "40 г" },
        { name: "Морковь", display_text: "40 г" },
      ]),
      ["potato"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("after_multiple_novel_products");
  });

  it("after start: unrecognized food row + familiar — invalid (cannot trust novel count)", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Киноа", display_text: "10 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["potato"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("after_unrecognized_food_row");
  });
});

describe("evaluateInfantSecondaryFamiliarOnly", () => {
  const ing = (lines: Array<{ name: string; display_text?: string }>) => lines;

  it("introduced [potato]: salmon + potato — invalid familiar (one novel)", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([
        { name: "Лосось", display_text: "40 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["potato"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("secondary_has_novel");
    expect(r.novelKeys).toEqual(["salmon"]);
  });

  it("introduced [potato, carrot]: potato + carrot — valid familiar", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([
        { name: "Картофель", display_text: "40 г" },
        { name: "Морковь", display_text: "40 г" },
      ]),
      ["potato", "carrot"]
    );
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("secondary_ok");
  });

  it("introduced [potato]: only potato — valid familiar", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(ing([{ name: "Картофель", display_text: "80 г" }]), ["potato"]);
    expect(r.valid).toBe(true);
  });

  it("introduced [potato]: kinoa row + potato — invalid (unrecognized row)", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([
        { name: "Киноа", display_text: "10 г" },
        { name: "Картофель", display_text: "40 г" },
      ]),
      ["potato"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("secondary_unrecognized_food_row");
  });

  it("introduced [potato]: cod + potato — primary valid, secondary invalid", () => {
    const rows = ing([
      { name: "Треска", display_text: "40 г" },
      { name: "Картофель", display_text: "40 г" },
    ]);
    const p = evaluateInfantRecipeComplementaryRules(rows, ["potato"]);
    expect(p.valid).toBe(true);
    expect(p.novelKeys).toEqual(["cod"]);
    const s = evaluateInfantSecondaryFamiliarOnly(rows, ["potato"]);
    expect(s.valid).toBe(false);
    expect(s.reason).toBe("secondary_has_novel");
  });

  it("introduced [potato, broccoli]: potato + broccoli — valid familiar", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([
        { name: "Картофель", display_text: "40 г" },
        { name: "Брокколи", display_text: "30 г" },
      ]),
      ["potato", "broccoli"]
    );
    expect(r.valid).toBe(true);
  });

  it("introduced [turkey]: only turkey — valid familiar", () => {
    expect(
      evaluateInfantSecondaryFamiliarOnly(ing([{ name: "Индейка", display_text: "60 г" }]), ["turkey"]).valid
    ).toBe(true);
  });

  it("introduced [turkey]: chicken + turkey — primary ok (one novel), secondary invalid", () => {
    const rows = ing([
      { name: "Курица", display_text: "40 г" },
      { name: "Индейка", display_text: "40 г" },
    ]);
    const p = evaluateInfantRecipeComplementaryRules(rows, ["turkey"]);
    expect(p.valid).toBe(true);
    expect(p.novelKeys).toEqual(["chicken"]);
    const s = evaluateInfantSecondaryFamiliarOnly(rows, ["turkey"]);
    expect(s.valid).toBe(false);
    expect(s.reason).toBe("secondary_has_novel");
  });
});

describe("getInfantPrimaryProductSummaryLine", () => {
  it("one novel + familiar: compact separator", () => {
    const line = getInfantPrimaryProductSummaryLine(["Кабачок", "Картофель"], ["zucchini"]);
    expect(line).toBeTruthy();
    expect(line!).toContain("Картофель");
    expect(line!).toContain("знакомый:");
    expect(line!).toMatch(/Кабачок/i);
  });

  it("invalid recipe returns null", () => {
    expect(getInfantPrimaryProductSummaryLine(["Картофель", "Морковь"], [])).toBeNull();
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
