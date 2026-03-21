/**
 * Quality gate chef_advice. Запуск: из supabase/functions:
 * deno test deepseek-chat/domain/recipe_io/chefAdviceQuality.test.ts --allow-read
 */
import {
  CHEF_ADVICE_MAX_LENGTH,
  isChefAdviceLowValue,
  normalizeChefAdviceText,
} from "./chefAdviceQuality.ts";
import { enforceChefAdvice } from "./sanitizeAndRepair.ts";

const ctx = {
  title: "Котлеты из кабачка",
  ingredientNames: ["Кабачок", "Фарш", "Лук"],
  stepTexts: ["Натрите кабачок.", "Смешайте с фаршем.", "Обжарьте."],
};

Deno.test("normalizeChefAdviceText: trim, no exclamation, max two sentences, length cap", () => {
  const raw = "  Жарьте на среднем огне!!!  Второе предложение. Третье лишнее. ";
  const out = normalizeChefAdviceText(raw);
  if (out.includes("!")) throw new Error("Expected no !");
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 2) throw new Error(`Expected at most 2 sentences, got ${sentences.length}: ${out}`);
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Expected length <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("isChefAdviceLowValue: good anchored + concrete advice passes", () => {
  const good =
    "Кабачок отожмите через марлю перед смешиванием с фаршем — масса не будет расползаться на сковороде.";
  const r = isChefAdviceLowValue(good, ctx);
  if (r.lowValue) throw new Error(`Expected pass, got ${r.reason}`);
});

Deno.test("isChefAdviceLowValue: generic serving line fails", () => {
  const bad = "Подавайте сразу, пока блюдо тёплое — так вкуснее для всей семьи за столом.";
  const r = isChefAdviceLowValue(bad, ctx);
  if (!r.lowValue) throw new Error("Expected generic serving advice to fail");
});

Deno.test("isChefAdviceLowValue: empty fails", () => {
  const r = isChefAdviceLowValue("   ", ctx);
  if (!r.lowValue || r.reason !== "empty") throw new Error(`Expected empty, got ${JSON.stringify(r)}`);
});

Deno.test("isChefAdviceLowValue: short fails", () => {
  const r = isChefAdviceLowValue("Коротко.", ctx);
  if (!r.lowValue) throw new Error("Expected too_short");
});

Deno.test("enforceChefAdvice: very long concrete advice is truncated to max length", () => {
  const pad = "Сначала 15 минут при 200°C, затем убавьте до 170°C ещё на 8 минут — так кабачок не размокнет. ";
  const long = pad.repeat(12) + "Отожмите кабачок перед фаршем.";
  const out = enforceChefAdvice(long, {
    title: ctx.title,
    ingredients: ctx.ingredientNames,
    steps: ctx.stepTexts,
  });
  if (out == null || out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Expected non-null truncated advice, got len=${out?.length}`);
  }
});
