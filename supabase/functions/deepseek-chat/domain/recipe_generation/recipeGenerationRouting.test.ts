import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  resolveRecipeGenerationRoute,
  isUnderOneYearChildForRecipeGeneration,
  buildUnder12CuratedRecipeBlockPayload,
} from "./recipeGenerationRouting.ts";
import type { MemberData } from "../../buildPrompt.ts";

Deno.test("routing: 5 мес child → under_12_curated_block", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 5 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "under_12_curated_block",
  );
});

Deno.test("routing: 8 мес child → under_12_curated_block", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 8 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "under_12_curated_block",
  );
});

Deno.test("routing: 11 мес child → under_12_curated_block", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 11 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "under_12_curated_block",
  );
});

Deno.test("routing: 12 мес child → standard", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 12 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "standard",
  );
});

Deno.test("routing: семья → standard (без infant-логики)", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 8 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: true, member: m }),
    "standard",
  );
});

Deno.test("routing: non-recipe запрос → standard", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 6 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: false, targetIsFamily: false, member: m }),
    "standard",
  );
});

Deno.test("routing: child без age_months → standard", () => {
  const m: MemberData = { name: "A", type: "child" };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "standard",
  );
});

Deno.test("routing: ageMonths camelCase < 12 → under_12_curated_block", () => {
  const m: MemberData = { name: "A", type: "child", ageMonths: 7 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "under_12_curated_block",
  );
});

Deno.test("isUnderOneYear: adult → false", () => {
  const m: MemberData = { name: "A", type: "adult", age_months: 400 };
  assertEquals(isUnderOneYearChildForRecipeGeneration(m), false);
});

Deno.test("block payload: контракт без LLM", () => {
  const p = buildUnder12CuratedRecipeBlockPayload();
  assertEquals(p.recipes.length, 0);
  assertEquals(p.route, "under_12_curated_recipe_block");
  assertEquals(p.reason_code, "under_12_curated_recipe_block");
  assertEquals(p.message.includes("до года"), true);
});
