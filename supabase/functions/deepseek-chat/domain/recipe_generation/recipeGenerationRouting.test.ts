import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveRecipeGenerationRoute } from "./recipeGenerationRouting.ts";
import type { MemberData } from "../../buildPrompt.ts";

Deno.test("routing: 5 мес child → under_6_block", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 5 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "under_6_block",
  );
});

Deno.test("routing: 6 мес child → infant", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 6 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "infant",
  );
});

Deno.test("routing: 11 мес child → infant", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 11 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "infant",
  );
});

Deno.test("routing: 12 мес child → standard", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 12 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
    "standard",
  );
});

Deno.test("routing: family → standard", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 8 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: true, member: m }),
    "standard",
  );
});

Deno.test("routing: adult → standard", () => {
  const m: MemberData = { name: "A", type: "adult", age_months: 400 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: true, targetIsFamily: false, member: m }),
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

Deno.test("scope: non-recipe при 3 мес child → standard (guard только recipe path)", () => {
  const m: MemberData = { name: "A", type: "child", age_months: 3 };
  assertEquals(
    resolveRecipeGenerationRoute({ isRecipeRequest: false, targetIsFamily: false, member: m }),
    "standard",
  );
});
