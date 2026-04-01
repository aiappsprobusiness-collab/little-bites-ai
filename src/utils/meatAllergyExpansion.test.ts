import { describe, it, expect } from "vitest";
import { buildBlockedTokensFromAllergies, expandAllergyToTokens, expandAllergiesToCanonicalBlockedGroups } from "./allergyAliases";
import { containsAnyTokenForAllergy } from "./allergenTokens";
import { getMeatUmbrellaBlockTokens } from "@/shared/meatAllergyTokens";
import { explainAllergyFilterOnRecipe } from "./planCandidateFilterExplain";

describe("мясо / meat umbrella", () => {
  it("expand мясо даёт canonical и включает все подтипы из getMeatUmbrellaBlockTokens", () => {
    const { canonical, tokens } = expandAllergyToTokens("мясо");
    expect(canonical).toBe("мясо");
    const set = new Set(tokens);
    for (const t of getMeatUmbrellaBlockTokens()) {
      expect(set.has(t)).toBe(true);
    }
  });

  it("блокирует курицу, индейку, говядину, свинину, фарш (подстрока)", () => {
    const tok = buildBlockedTokensFromAllergies(["мясо"]);
    expect(containsAnyTokenForAllergy("запечённая курица", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("филе индейки", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("гуляш из говядины", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("котлеты из свинины", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("лазанья с мясным фаршем", tok).hit).toBe(true);
  });

  it("не блокирует овощное блюдо, молочку и рыбу", () => {
    const tok = buildBlockedTokensFromAllergies(["мясо"]);
    expect(containsAnyTokenForAllergy("овощное рагу с кабачком", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("творожная запеканка с манкой", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("запечённый лосось с лимоном", tok).hit).toBe(false);
  });

  it("не матчит «мясистые помидоры» голым стемом мяс (регрессия)", () => {
    const tok = buildBlockedTokensFromAllergies(["мясо"]);
    expect(containsAnyTokenForAllergy("салат с мясистыми помидорами", tok).hit).toBe(false);
  });

  it("не матчит «куриные яйца» / «яйцо куриное» (токен курин в составе названия яиц)", () => {
    const tok = buildBlockedTokensFromAllergies(["мясо"]);
    expect(containsAnyTokenForAllergy("куриные яйца 2 шт", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("яйцо куриное", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("яйца куриные", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("куриная грудка", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("куриное филе", tok).hit).toBe(true);
  });
});

describe("узкие мясные аллергии", () => {
  it("курица: курица, с курицей, chicken", () => {
    const tok = buildBlockedTokensFromAllergies(["курица"]);
    expect(containsAnyTokenForAllergy("суп с курицей", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("chicken curry", tok).hit).toBe(true);
  });

  it("индейка: индейка, филе индейки, turkey", () => {
    const tok = buildBlockedTokensFromAllergies(["индейка"]);
    expect(containsAnyTokenForAllergy("филе индейки", tok).hit).toBe(true);
    expect(containsAnyTokenForAllergy("roast turkey", tok).hit).toBe(true);
  });

  it("говядина: говядина и телятина (один набор токенов с телятиной)", () => {
    const beef = buildBlockedTokensFromAllergies(["говядина"]);
    expect(containsAnyTokenForAllergy("бифштекс из говядины", beef).hit).toBe(true);
    expect(containsAnyTokenForAllergy("пюре с телятиной", beef).hit).toBe(true);
    const veal = buildBlockedTokensFromAllergies(["телятина"]);
    expect(veal.sort().join(",")).toBe(beef.sort().join(","));
  });

  it("говядина не блокирует курицу/индейку", () => {
    const tok = buildBlockedTokensFromAllergies(["говядина"]);
    expect(containsAnyTokenForAllergy("куриное филе на пару", tok).hit).toBe(false);
    expect(containsAnyTokenForAllergy("котлеты из индейки", tok).hit).toBe(false);
  });

  it("курица+индейка не блокируют говядину", () => {
    const tok = buildBlockedTokensFromAllergies(["курица", "индейка"]);
    expect(containsAnyTokenForAllergy("гуляш из говядины", tok).hit).toBe(false);
  });
});

describe("матч по ингредиенту", () => {
  it("блок по name без мяса в title", () => {
    const { allowed } = explainAllergyFilterOnRecipe(
      {
        title: "Детское пюре",
        description: "нежное",
        tags: null,
        recipe_ingredients: [{ name: "Куриный бульон", display_text: "30 мл" }],
      },
      ["мясо"],
    );
    expect(allowed).toBe(false);
  });
});

describe("expandAllergiesToCanonicalBlockedGroups", () => {
  it("разделяет мясо и рыбу", () => {
    const g = expandAllergiesToCanonicalBlockedGroups(["мясо", "рыба"]);
    expect(g).toHaveLength(2);
    expect(g[0]!.canonical).toBe("мясо");
    expect(g[1]!.canonical).toBe("рыба");
  });
});
