/**
 * Аудит передачи аллергий в чат-рецепт (recipe-path V3).
 *
 * 1) Обрезка slice(0,1) при buildPromptByProfileAndTariff.useAllAllergies === false
 *    (тариф «как увидел Edge»). На клиенте «Premium» может быть из premium_until, а Edge
 *    смотрит только profiles_v2.status — см. src/utils/subscriptionChatEdgeParity.test.ts.
 *
 * 2) При реальном Premium на Edge (status premium/trial) полный список уходит в промпт;
 *    тогда яйцо в рецепте — нарушение модели или отсутствие пост-проверки ингредиентов на Edge.
 *
 * Запуск: из каталога supabase/functions:
 *   deno test deepseek-chat/chatAllergyTariffAudit.test.ts --allow-read
 */
import { generateRecipeSystemPromptV3 } from "./buildPrompt.ts";
import { buildPromptByProfileAndTariff } from "./promptByTariff.ts";

/** Копия логики index.ts: memberDataForPrompt / allMembers при Free. */
function applyIndexStyleAllergyLimit<M extends { allergies?: string[] }>(
  member: M,
  useAllAllergies: boolean
): M {
  if (useAllAllergies) return member;
  return { ...member, allergies: (member.allergies ?? []).slice(0, 1) };
}

Deno.test("buildPromptByProfileAndTariff: Free → useAllAllergies false", () => {
  const r = buildPromptByProfileAndTariff({ status: "free", memberType: "child" });
  if (r.useAllAllergies) {
    throw new Error("Free must not pass all allergies to prompt (useAllAllergies=false)");
  }
});

Deno.test("buildPromptByProfileAndTariff: premium и trial → useAllAllergies true", () => {
  for (const status of ["premium", "trial"] as const) {
    const r = buildPromptByProfileAndTariff({ status, memberType: "child" });
    if (!r.useAllAllergies) {
      throw new Error(`${status}: expected useAllAllergies true`);
    }
  }
});

Deno.test(
  "AUDIT: при обрезке как на Free первая аллергия в V3 есть, вторая отсутствует (сценарий орехи+яйца)",
  () => {
    const member = { name: "Малыш12+", age_months: 12, allergies: ["орехи", "яйца"] };
    const tariff = buildPromptByProfileAndTariff({ status: "free", memberType: "child" });
    const forPrompt = applyIndexStyleAllergyLimit(member, tariff.useAllAllergies);
    const prompt = generateRecipeSystemPromptV3(forPrompt, false, false, [], { mealType: "breakfast" });

    if (!prompt.includes("ИСКЛЮЧИТЬ (аллергия)")) {
      throw new Error("expected allergy exclusion line in V3 prompt");
    }
    if (!prompt.includes("орехи")) {
      throw new Error("first allergy must appear in prompt");
    }
    if (prompt.includes("яйца")) {
      throw new Error("second allergy must NOT appear after Free-style slice — test assumption broken");
    }
  },
);

Deno.test("при Premium без обрезки обе аллергии попадают в V3 CONTEXT", () => {
  const member = { name: "Малыш", age_months: 12, allergies: ["орехи", "яйца"] };
  const tariff = buildPromptByProfileAndTariff({ status: "premium", memberType: "child" });
  const forPrompt = applyIndexStyleAllergyLimit(member, tariff.useAllAllergies);
  const prompt = generateRecipeSystemPromptV3(forPrompt, true, false, [], { mealType: "breakfast" });
  if (!prompt.includes("орехи") || !prompt.includes("яйца")) {
    throw new Error("Premium: both allergies must be in ИСКЛЮЧИТЬ line");
  }
});

Deno.test("AUDIT: порядок в массиве важен — при яйца первым оно в промпте, орехи отрезаются", () => {
  const member = { name: "X", age_months: 12, allergies: ["яйца", "орехи"] };
  const tariff = buildPromptByProfileAndTariff({ status: "free", memberType: "child" });
  const forPrompt = applyIndexStyleAllergyLimit(member, tariff.useAllAllergies);
  const prompt = generateRecipeSystemPromptV3(forPrompt, false, false, [], {});
  if (!prompt.includes("яйца")) throw new Error("expected яйца first");
  if (prompt.includes("орехи")) throw new Error("орехи should be sliced off when second");
});
