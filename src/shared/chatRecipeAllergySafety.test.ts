import { describe, it, expect } from "vitest";
import { expandAllergiesToCanonicalBlockedGroups } from "@/utils/allergyAliases";
import {
  chatRecipeRecordToAllergyFields,
  findFirstAllergyConflictInChatRecipeIngredients,
  findFirstAllergyConflictInRecipeFields,
} from "./chatRecipeAllergySafety";

describe("chatRecipeAllergySafety", () => {
  describe("pool / audit (findFirstAllergyConflictInRecipeFields)", () => {
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
  });

  describe("chat post-check (findFirstAllergyConflictInChatRecipeIngredients)", () => {
    it("глютен: title «Паста с сыром» без глютеновых ингредиентов — без конфликта", () => {
      const recipe = {
        title: "Паста с сыром",
        ingredients: [{ name: "сыр", display_text: "50 г" }],
      };
      const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
      const groups = expandAllergiesToCanonicalBlockedGroups(["глютен"]).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).toBeNull();
    });

    it("глютен: паста в ingredients — конфликт", () => {
      const recipe = {
        title: "Ужин",
        ingredients: [{ name: "паста", display_text: "80 г" }],
      };
      const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
      const groups = expandAllergiesToCanonicalBlockedGroups(["глютен"]).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).not.toBeNull();
    });

    it("творожная запеканка: title ложный для глютен/орехи — без конфликта по ингредиентам", () => {
      const recipe = {
        title: "Творожная запеканка с бананом",
        description: "Нежный завтрак",
        ingredients: [
          { name: "творог", display_text: "150 г" },
          { name: "банан", display_text: "1 шт" },
        ],
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

    it("мясо: куриные яйца — не конфликт", () => {
      const recipe = {
        title: "Быстрый завтрак",
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
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).toBeNull();
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
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, groups)).not.toBeNull();
    });

    it("арахис в title не блокирует орехи; арахис в ingredients блокирует арахис", () => {
      const recipe = {
        title: "Бутерброд с арахисовой пастой",
        ingredients: [{ name: "арахисовая паста", display_text: "1 ст.л." }],
      };
      const fields = chatRecipeRecordToAllergyFields(recipe as Record<string, unknown>);
      const nutGroups = expandAllergiesToCanonicalBlockedGroups(["орехи"]).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, nutGroups)).toBeNull();
      const peanutGroups = expandAllergiesToCanonicalBlockedGroups(["арахис"]).map((g) => ({
        profileAllergy: g.allergy,
        tokens: g.tokens,
      }));
      expect(findFirstAllergyConflictInChatRecipeIngredients(fields, peanutGroups)).not.toBeNull();
    });
  });
});
