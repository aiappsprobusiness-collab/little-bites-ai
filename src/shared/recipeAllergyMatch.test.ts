import { describe, it, expect } from "vitest";
import { expandAllergiesToCanonicalBlockedGroups } from "@/utils/allergyAliases";
import {
  allergyTokenMatchesInChatIngredientText,
  allergyTokenMatchesInIngredientWord,
  allergyTokenMatchesInPreferenceText,
  listAllergyTokenHitsInChatIngredientNames,
  listAllergyTokenHitsInRecipeFields,
  normalizeRecipeTextForPreferenceMatch,
} from "./recipeAllergyMatch";

describe("recipeAllergyMatch — chat ingredient mode", () => {
  describe("allergyTokenMatchesInIngredientWord", () => {
    it("отсекает вложенный «пекан» в «запеканка»", () => {
      expect(allergyTokenMatchesInIngredientWord("запеканка", "пекан")).toBe(false);
    });

    it("отсекает вложенный «рож» в «творожный»", () => {
      expect(allergyTokenMatchesInIngredientWord("творожный", "рож")).toBe(false);
    });

    it("ловит префикс «рож» в «рожь»", () => {
      expect(allergyTokenMatchesInIngredientWord("рожь", "рож")).toBe(true);
    });

    it("ловит «овсян» в «овсяные»", () => {
      expect(allergyTokenMatchesInIngredientWord("овсяные", "овсян")).toBe(true);
    });

    it("ловит «куриное» по «курин»", () => {
      expect(allergyTokenMatchesInIngredientWord("куриное", "курин")).toBe(true);
    });
  });

  describe("allergyTokenMatchesInChatIngredientText", () => {
    it("не ловит «паста» в «пастеризованное молоко»", () => {
      expect(allergyTokenMatchesInChatIngredientText("молоко пастеризованное", "паста")).toBe(false);
    });

    it("ловит «паста» в «паста»", () => {
      expect(allergyTokenMatchesInChatIngredientText("паста", "паста")).toBe(true);
    });

    it("не ловит «миндал» в title-only контексте через ingredient helper", () => {
      expect(allergyTokenMatchesInChatIngredientText("банан", "миндал")).toBe(false);
    });

    it("ловит «миндал» в «миндальное молоко»", () => {
      expect(allergyTokenMatchesInChatIngredientText("миндальное молоко", "миндал")).toBe(true);
    });

    it("мясо: куриные яйца — без коллокации птица+яйцо", () => {
      expect(allergyTokenMatchesInChatIngredientText("яйца куриные", "курин")).toBe(false);
    });

    it("мясо: куриная грудка — конфликт", () => {
      expect(allergyTokenMatchesInChatIngredientText("куриная грудка", "курин")).toBe(true);
    });

    it("яйца: «белок яйца» как многословный токен", () => {
      expect(allergyTokenMatchesInChatIngredientText("белок яйца", "белок яйц")).toBe(true);
    });
  });

  describe("listAllergyTokenHitsInChatIngredientNames vs pool scan", () => {
    const calciumBreakfast = {
      title: "Творожная запеканка с бананом",
      description: "Нежный завтрак с кальцием из творога",
      recipe_ingredients: [
        { name: "творог", display_text: "150 г" },
        { name: "банан", display_text: "1 шт" },
        { name: "яйцо", display_text: "1 шт" },
      ],
    };

  it("pool scan (title+desc): ложные глютен/орехи на творожной запеканке", () => {
      const gluten = expandAllergiesToCanonicalBlockedGroups(["глютен"])[0]!.tokens;
      const nuts = expandAllergiesToCanonicalBlockedGroups(["орехи"])[0]!.tokens;
      expect(listAllergyTokenHitsInRecipeFields(calciumBreakfast, gluten).length).toBeGreaterThan(0);
      expect(listAllergyTokenHitsInRecipeFields(calciumBreakfast, nuts).length).toBeGreaterThan(0);
    });

    it("chat ingredient scan: глютен/орехи — без ложных на творожной запеканке", () => {
      const gluten = expandAllergiesToCanonicalBlockedGroups(["глютен"])[0]!.tokens;
      const nuts = expandAllergiesToCanonicalBlockedGroups(["орехи"])[0]!.tokens;
      expect(listAllergyTokenHitsInChatIngredientNames(calciumBreakfast, gluten)).toHaveLength(0);
      expect(listAllergyTokenHitsInChatIngredientNames(calciumBreakfast, nuts)).toHaveLength(0);
    });

    it("chat ingredient scan: яйца — конфликт по ингредиенту яйцо", () => {
      const egg = expandAllergiesToCanonicalBlockedGroups(["яйца"])[0]!.tokens;
      const hits = listAllergyTokenHitsInChatIngredientNames(calciumBreakfast, egg);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.field).toMatch(/ingredient/);
    });

    it("chat scan не смотрит display_text (пастеризованное)", () => {
      const recipe = {
        title: "Каша",
        description: "",
        recipe_ingredients: [
          { name: "молоко", display_text: "пастеризованное 200 мл" },
        ],
      };
      const gluten = expandAllergiesToCanonicalBlockedGroups(["глютен"])[0]!.tokens;
      expect(listAllergyTokenHitsInChatIngredientNames(recipe, gluten)).toHaveLength(0);
    });
  });

  describe("plan mode unchanged (substring)", () => {
    it("preferenceText: «орехами» ловится токеном «орех»", () => {
      const norm = normalizeRecipeTextForPreferenceMatch("орехами");
      expect(allergyTokenMatchesInPreferenceText(norm, "орех")).toBe(true);
    });
  });
});

describe("recipeAllergyMatch — breakfast matrix", () => {
  const cases: Array<{
    ingredient: string;
    allergy: string;
    expectHit: boolean;
    label: string;
  }> = [
    { ingredient: "творог", allergy: "глютен", expectHit: false, label: "творог без глютена" },
    { ingredient: "творожок", allergy: "глютен", expectHit: false, label: "творожок" },
    { ingredient: "овсяные хлопья", allergy: "глютен", expectHit: true, label: "овсянка при глютен" },
    { ingredient: "йогурт натуральный", allergy: "БКМ", expectHit: true, label: "йогурт при БКМ" },
    { ingredient: "куриное филе", allergy: "мясо", expectHit: true, label: "курица при мясо" },
    { ingredient: "яйца куриные", allergy: "мясо", expectHit: false, label: "куриные яйца не мясо" },
    { ingredient: "миндальное молоко", allergy: "орехи", expectHit: true, label: "миндаль при орехи" },
    { ingredient: "арахисовая паста", allergy: "орехи", expectHit: false, label: "арахис не tree nuts" },
    { ingredient: "арахисовая паста", allergy: "арахис", expectHit: true, label: "арахис" },
    { ingredient: "пшеничная мука", allergy: "глютен", expectHit: true, label: "мука при глютен" },
    { ingredient: "рис", allergy: "глютен", expectHit: false, label: "рис без глютена" },
    { ingredient: "лосось", allergy: "рыба", expectHit: true, label: "лосось при рыба" },
    { ingredient: "молоко пастеризованное", allergy: "глютен", expectHit: false, label: "пастеризованное не паста" },
  ];

  for (const { ingredient, allergy, expectHit, label } of cases) {
    it(`${label}: ${ingredient} + ${allergy}`, () => {
      const tokens = expandAllergiesToCanonicalBlockedGroups([allergy])[0]!.tokens;
      const hits = listAllergyTokenHitsInChatIngredientNames(
        { recipe_ingredients: [{ name: ingredient, display_text: "100 г" }] },
        tokens,
      );
      if (expectHit) {
        expect(hits.length).toBeGreaterThan(0);
      } else {
        expect(hits).toHaveLength(0);
      }
    });
  }
});
