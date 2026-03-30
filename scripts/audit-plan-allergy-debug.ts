/**
 * Локальный аудит фильтра аллергий для плана (те же helpers, что приложение).
 * Запуск: npm run audit:plan-allergy
 */
import { buildBlockedTokensFromAllergies } from "@/utils/allergyAliases";
import { explainAllergyFilterOnRecipe } from "@/utils/planCandidateFilterExplain";
import { buildBlockedTokensFromAllergies as buildEdgeStyle } from "../supabase/functions/_shared/allergyAliases.ts";
import { passesPreferenceFilters } from "../supabase/functions/generate-plan/preferenceRules.ts";

type MockRecipe = Parameters<typeof explainAllergyFilterOnRecipe>[0];

function printRecipeAudit(allergies: string[], recipe: MockRecipe & { id?: string }) {
  const label = recipe.title ?? recipe.id ?? "?";
  const { blockedTokens, allowed, hits } = explainAllergyFilterOnRecipe(recipe, allergies, {
    includeTags: true,
    includeIngredients: true,
  });
  console.log(`\n--- ${label} ---`);
  console.log("blockedTokens count:", blockedTokens.length);
  console.log("allowed (client haystack):", allowed);
  if (hits.length === 0) {
    console.log("field hits: (none)");
  } else {
    for (const h of hits) {
      console.log(`  field=${h.field} token=${JSON.stringify(h.token)} snippet=${JSON.stringify(h.snippet)}`);
    }
  }
  const edgeRecipe = {
    title: recipe.title,
    description: recipe.description,
    recipe_ingredients: recipe.recipe_ingredients,
  };
  const edgeOk = passesPreferenceFilters(edgeRecipe, { allergies, dislikes: [] });
  console.log("Edge passesPreferenceFilters (allergy+dislike):", edgeOk);
}

function mock(title: string, extra?: Partial<MockRecipe>): MockRecipe {
  return { title, description: extra?.description ?? null, tags: extra?.tags ?? null, recipe_ingredients: extra?.recipe_ingredients ?? null };
}

console.log("=== Audit: allergy filter (shared helpers) ===\n");

console.log("## Кейс A: аллергия [мясо] — набор рецептов");
const allergiesMeat = ["мясо"];
console.log("blockedTokens sample:", buildBlockedTokensFromAllergies(allergiesMeat).slice(0, 12).join(", "), "…");

const suiteA: MockRecipe[] = [
  mock("Курица с овощами"),
  mock("Индейка запечённая"),
  mock("Говядина тушёная"),
  mock("Тефтели из говядины"),
  mock("Суп с курицей"),
  mock("Овощной суп", {
    recipe_ingredients: [{ name: "морковь", display_text: "Морковь" }],
  }),
];
for (const r of suiteA) printRecipeAudit(allergiesMeat, r);

console.log("\n## Кейс B: [курица, индейка] — говядина allowed");
const allergiesPoultry = ["курица", "индейка"];
printRecipeAudit(allergiesPoultry, mock("Стейк из говядины"));

console.log("\n## Кейс C: [говядина] — курица allowed");
printRecipeAudit(["говядина"], mock("Филе куриное на пару"));

console.log("\n## Кейс D: [мясо, рыба] — независимые группы");
printRecipeAudit(["мясо", "рыба"], mock("Лосось на гриле"));
printRecipeAudit(["мясо", "рыба"], mock("Котлеты из свинины"));

console.log("\n## Кейс E: матч только по ингредиенту (не title)");
printRecipeAudit(
  ["мясо"],
  mock("Детское блюдо", {
    title: "Овощное пюре с добавкой",
    recipe_ingredients: [{ name: "Куриное филе", display_text: "50 г" }],
  }),
);

console.log("\n## Паритет токенов client allergyAliases vs Edge allergyAliases (мясо)");
const c = buildBlockedTokensFromAllergies(["мясо"]).sort();
const e = buildEdgeStyle(["мясо"]).sort();
const same = c.length === e.length && c.every((t, i) => t === e[i]);
console.log("same order+length:", same);
if (!same) {
  console.log("client len", c.length, "edge len", e.length);
  const onlyC = c.filter((x) => !e.includes(x));
  const onlyE = e.filter((x) => !c.includes(x));
  if (onlyC.length) console.log("only client", onlyC.slice(0, 20));
  if (onlyE.length) console.log("only edge", onlyE.slice(0, 20));
}

console.log("\n=== done ===");
