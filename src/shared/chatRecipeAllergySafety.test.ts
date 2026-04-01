import { describe, it, expect } from "vitest";
import { expandAllergiesToCanonicalBlockedGroups } from "@/utils/allergyAliases";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInRecipeFields,
} from "./chatRecipeAllergySafety";

describe("chatRecipeAllergySafety", () => {
  it("орехи в title — блок по орехи", () => {
    const recipe = {
      title: "Ореховый перекус",
      description: "",
      ingredients: [{ name: "мёд", display_text: "1 ч.л." }],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe);
    const groups = expandAllergiesToCanonicalBlockedGroups(["орехи"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    const c = findFirstAllergyConflictInRecipeFields(fields, groups);
    expect(c).not.toBeNull();
    expect(c!.profileAllergy).toBe("орехи");
  });

  it("глютен: паста в title", () => {
    const recipe = {
      title: "Паста с сыром",
      ingredients: [{ name: "сыр", display_text: "50 г" }],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
    const groups = expandAllergiesToCanonicalBlockedGroups(["глютен"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, groups)).not.toBeNull();
  });

  it("яблоко: яблочное пюре", () => {
    const recipe = {
      title: "Яблочное пюре",
      ingredients: [],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
    const groups = expandAllergiesToCanonicalBlockedGroups(["яблоко"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, groups)).not.toBeNull();
  });

  it("мясо: куриные яйца в ингредиентах — не конфликт (ложное срабатывание курин в яйцах)", () => {
    const recipe = {
      title: "Быстрый завтрак",
      description: "Омлет",
      ingredients: [
        { name: "яйца куриные", display_text: "2 шт." },
        { name: "молоко", display_text: "50 мл" },
      ],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
    const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, groups)).toBeNull();
  });

  it("мясо: куриная грудка — конфликт", () => {
    const recipe = {
      title: "Завтрак",
      ingredients: [{ name: "куриная грудка", display_text: "100 г" }],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
    const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, groups)).not.toBeNull();
  });

  it("арахис отдельно от орехов", () => {
    const recipe = {
      title: "Бутерброд с арахисовой пастой",
      ingredients: [],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
    const nutGroups = expandAllergiesToCanonicalBlockedGroups(["орехи"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, nutGroups)).toBeNull();
    const peanutGroups = expandAllergiesToCanonicalBlockedGroups(["арахис"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInRecipeFields(fields, peanutGroups)).not.toBeNull();
  });
});
