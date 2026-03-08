/**
 * Тесты food relevance: allow для food-like, reject только для явно нерелевантных.
 * Запуск: из supabase/functions: deno test deepseek-chat/isRelevantQuery.test.ts --allow-read
 */
import { checkFoodRelevance, isRelevantQuery } from "./isRelevantQuery.ts";

function assertAllow(text: string) {
  const result = checkFoodRelevance(text);
  if (!result.allowed) {
    throw new Error(`Expected ALLOW for "${text}", got reject: reason=${result.reason}`);
  }
}

function assertReject(text: string) {
  const result = checkFoodRelevance(text);
  if (result.allowed) {
    throw new Error(`Expected REJECT for "${text}", got allow: reason=${result.reason}`);
  }
}

Deno.test("isRelevantQuery: свинина в сливочно-грибном соусе с картофельным пюре -> allow", () => {
  assertAllow("свинина в сливочно-грибном соусе с картофельным пюре");
});

Deno.test("isRelevantQuery: рис с курицей -> allow", () => {
  assertAllow("рис с курицей");
});

Deno.test("isRelevantQuery: котлеты без молока -> allow", () => {
  assertAllow("котлеты без молока");
});

Deno.test("isRelevantQuery: ужин из индейки -> allow", () => {
  assertAllow("ужин из индейки");
});

Deno.test("isRelevantQuery: что приготовить из тыквы -> allow", () => {
  assertAllow("что приготовить из тыквы");
});

Deno.test("isRelevantQuery: какая погода в москве -> reject", () => {
  assertReject("какая погода в москве");
});

Deno.test("isRelevantQuery: курс доллара -> reject", () => {
  assertReject("курс доллара");
});

Deno.test("isRelevantQuery: isRelevantQuery() mirrors checkFoodRelevance().allowed", () => {
  const allowCases = ["борщ", "омлет с сыром", "на ужин"];
  for (const q of allowCases) {
    const r = checkFoodRelevance(q);
    const b = isRelevantQuery(q);
    if (r.allowed !== b) {
      throw new Error(`Mismatch for "${q}": checkFoodRelevance.allowed=${r.allowed}, isRelevantQuery=${b}`);
    }
  }
  const rejectCases = ["какая погода в москве", "курс доллара"];
  for (const q of rejectCases) {
    const r = checkFoodRelevance(q);
    const b = isRelevantQuery(q);
    if (r.allowed !== b) {
      throw new Error(`Mismatch for "${q}": checkFoodRelevance.allowed=${r.allowed}, isRelevantQuery=${b}`);
    }
  }
});
