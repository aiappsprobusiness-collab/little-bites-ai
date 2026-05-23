/**
 * Интеграция контрактов: pre-check (чат) и post-recipe (как Edge) на одних токенах SoT.
 */
import { describe, it, expect } from "vitest";
import { checkChatRequestAgainstProfile } from "./chatBlockedCheck";
import { expandAllergiesToCanonicalBlockedGroups } from "./allergyAliases";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInChatRecipeIngredients,
} from "@/shared/chatRecipeAllergySafety";

describe("chat allergy guard integration (SoT)", () => {
  it("явный конфликт в запросе режется pre-check; LLM не нужен", () => {
    const r = checkChatRequestAgainstProfile({
      text: "сделай суп с курицей",
      member: { name: "Тест", allergies: ["мясо"], dislikes: [] },
    });
    expect(r?.blocked).toBe(true);
    expect(r?.blocked_by).toBe("allergy");
    expect(r?.message).toMatch(/указана аллергия/);
  });

  it("нейтральный запрос проходит pre-check; конфликтный рецепт — post по ingredients", () => {
    expect(
      checkChatRequestAgainstProfile({
        text: "дай суп на ужин",
        member: { name: "Тест", allergies: ["мясо"], dislikes: [] },
      }),
    ).toBeNull();

    const recipe = {
      title: "Суп",
      description: "",
      ingredients: [{ name: "куриный бульон", display_text: "500 мл" }],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe);
    const groups = expandAllergiesToCanonicalBlockedGroups(["мясо"]).map((g) => ({
      profileAllergy: g.allergy,
      tokens: g.tokens,
    }));
    expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).not.toBeNull();
  });

  it("завтрак с кальцием: pre ok, творожный рецепт без post-конфликта по глютен/орехи", () => {
    expect(
      checkChatRequestAgainstProfile({
        text: "Завтрак с кальцием",
        member: { name: "Авигея", allergies: ["глютен"], dislikes: [] },
      }),
    ).toBeNull();

    const recipe = {
      title: "Творожная запеканка",
      ingredients: [{ name: "творог", display_text: "150 г" }],
    };
    const fields = chatRecipeRecordToAllergyFields(recipe);
    for (const allergy of ["глютен", "орехи"]) {
      const groups = expandAllergiesToCanonicalBlockedGroups([allergy]).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).toBeNull();
    }
  });

  it("expandAllergiesToCanonicalBlockedGroups согласован с post-check (не дублируем отдельный словарь)", () => {
    const g = expandAllergiesToCanonicalBlockedGroups(["мясо"])[0];
    expect(g?.tokens.length).toBeGreaterThan(10);
    expect(g?.tokens.some((t) => t.includes("куриц"))).toBe(true);
  });
});
