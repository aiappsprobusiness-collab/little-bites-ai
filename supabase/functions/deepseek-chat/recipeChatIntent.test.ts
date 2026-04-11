/**
 * Тесты intent scoring для чата рецептов.
 * Запуск: deno test deepseek-chat/recipeChatIntent.test.ts --allow-read
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeChatIntentScores, resolveRecipeChatIntent } from "./recipeChatIntent.ts";

Deno.test("recipeChatIntent: погода → irrelevant", () => {
  const r = resolveRecipeChatIntent("какая погода в москве");
  assertEquals(r.route, "irrelevant");
});

Deno.test("recipeChatIntent: курс доллара → irrelevant", () => {
  const r = resolveRecipeChatIntent("курс доллара");
  assertEquals(r.route, "irrelevant");
});

Deno.test("recipeChatIntent: блюдо → recipe", () => {
  const r = resolveRecipeChatIntent("свинина в сливочно-грибном соусе с картофельным пюре");
  assertEquals(r.route, "recipe");
});

Deno.test("recipeChatIntent: рис с курицей → recipe", () => {
  const r = resolveRecipeChatIntent("рис с курицей");
  assertEquals(r.route, "recipe");
});

Deno.test("recipeChatIntent: сыпь у ребёнка → assistant_topic", () => {
  const r = resolveRecipeChatIntent("у ребёнка появилась сыпь");
  assertEquals(r.route, "assistant_topic");
  if (r.route === "assistant_topic") {
    assertEquals(r.topic?.topicKey, "allergy");
  }
});

Deno.test("recipeChatIntent: не хочет есть кашу → assistant_topic", () => {
  const r = resolveRecipeChatIntent("не хочет есть кашу");
  assertEquals(r.route, "assistant_topic");
  if (r.route === "assistant_topic") {
    assertEquals(r.topic?.topicKey, "food_refusal");
  }
});

Deno.test("recipeChatIntent: калорийный завтрак — recipe (не стул)", () => {
  const r = resolveRecipeChatIntent("калорийный завтрак");
  assertEquals(r.route, "recipe");
});

Deno.test("recipeChatIntent: зеленый кал — assistant_topic (стул)", () => {
  const r = resolveRecipeChatIntent("зеленый кал третий день");
  assertEquals(r.route, "assistant_topic");
  if (r.route === "assistant_topic") {
    assertEquals(r.topic?.topicKey, "constipation_diarrhea");
  }
});

Deno.test("recipeChatIntent: scores монотонны для еды", () => {
  const a = computeChatIntentScores("курица", "курица");
  const b = computeChatIntentScores("курица с рисом", "курица с рисом");
  assertEquals(a.recipePathScore < b.recipePathScore, true);
});
