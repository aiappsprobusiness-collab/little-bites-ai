/**
 * Quality gate chef_advice. Запуск: из supabase/functions:
 * deno test deepseek-chat/domain/recipe_io/chefAdviceQuality.test.ts --allow-read
 */
import {
  CHEF_ADVICE_MAX_LENGTH,
  isChefAdviceLowValue,
  normalizeChefAdviceText,
} from "./chefAdviceQuality.ts";
import { enforceChefAdvice, hasForbiddenChefAdviceStart } from "./sanitizeAndRepair.ts";

const ctx = {
  title: "Котлеты из кабачка",
  ingredientNames: ["Кабачок", "Фарш", "Лук"],
  stepTexts: ["Натрите кабачок.", "Смешайте с фаршем.", "Обжарьте."],
};

const soupBeansCtx = {
  title: "Суп с фасолью",
  ingredientNames: ["Фасоль", "Морковь", "Лук"],
  stepTexts: ["Замочите фасоль.", "Варите до мягкости.", "Добавьте овощи."],
};

Deno.test("normalizeChefAdviceText: trim, no exclamation, одно предложение, length cap", () => {
  const raw = "  Жарьте на среднем огне!!!  Второе предложение. Третье лишнее. ";
  const out = normalizeChefAdviceText(raw);
  if (out.includes("!")) throw new Error("Expected no !");
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) throw new Error(`Expected one sentence, got ${sentences.length}: ${out}`);
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

Deno.test("isChefAdviceLowValue: «добавьте зелень» fails", () => {
  const bad = "Перед подачей добавьте зелень — так ярче по виду.";
  const r = isChefAdviceLowValue(bad, ctx);
  if (!r.lowValue) throw new Error("Expected add-greens fluff to fail");
});

Deno.test("isChefAdviceLowValue: empty fails", () => {
  const r = isChefAdviceLowValue("   ", ctx);
  if (!r.lowValue || r.reason !== "empty") throw new Error(`Expected empty, got ${JSON.stringify(r)}`);
});

Deno.test("isChefAdviceLowValue: short fails", () => {
  const r = isChefAdviceLowValue("Коротко.", ctx);
  if (!r.lowValue) throw new Error("Expected too_short");
});

Deno.test("enforceChefAdvice: generic «подавайте сразу» → null (без второго LLM в index)", () => {
  const out = enforceChefAdvice("Подавайте сразу, пока тёплое.", {
    title: ctx.title,
    ingredients: ctx.ingredientNames,
    steps: ctx.stepTexts,
  });
  if (out != null) throw new Error(`Expected null for generic advice, got: ${out}`);
});

Deno.test("hasForbiddenChefAdviceStart: «Для более…» с конкретикой — не template_start", () => {
  const line =
    "Для более насыщенного вкуса слегка разомните часть фасоли прямо в супе — это сделает текстуру гуще без добавления сливок.";
  if (hasForbiddenChefAdviceStart(line)) {
    throw new Error("Expected concrete «Для более…» advice not to hit forbidden-start");
  }
});

Deno.test("enforceChefAdvice: «Для более… фасоль в супе» проходит (intro + якорь + действие + эффект)", () => {
  const line =
    "Для более насыщенного вкуса слегка разомните часть фасоли прямо в супе — это сделает текстуру гуще без добавления сливок.";
  const out = enforceChefAdvice(line, {
    title: soupBeansCtx.title,
    ingredients: soupBeansCtx.ingredientNames,
    steps: soupBeansCtx.stepTexts,
  });
  if (out == null || !out.includes("фасол")) {
    throw new Error(`Expected non-null advice mentioning beans, got: ${out}`);
  }
});

Deno.test("enforceChefAdvice: инсайт с фасолью без вводного «Для более» проходит", () => {
  const line =
    "Слегка разомните часть фасоли прямо в супе — бульон станет гуще без добавления сливок.";
  const out = enforceChefAdvice(line, {
    title: soupBeansCtx.title,
    ingredients: soupBeansCtx.ingredientNames,
    steps: soupBeansCtx.stepTexts,
  });
  if (out == null || !out.includes("фасол")) {
    throw new Error(`Expected non-null advice mentioning beans, got: ${out}`);
  }
});

Deno.test("enforceChefAdvice: «Для более…» без якоря и без техники — null", () => {
  const out = enforceChefAdvice(
    "Для более гармоничного впечатления подайте блюдо с душой и хорошим настроением.",
    { title: "Салат", ingredients: ["Огурец", "Помидор", "Лук"], steps: ["Нарежьте.", "Смешайте.", "Заправьте."] },
  );
  if (out != null) {
    throw new Error(`Expected null for generic «Для более» without anchor/cue, got: ${out}`);
  }
});

Deno.test("isChefAdviceLowValue: «Для лучшего вкуса добавьте специи» — intro без эффекта/якоря", () => {
  const bad = "Для лучшего вкуса добавьте специи.";
  const r = isChefAdviceLowValue(bad, ctx);
  if (!r.lowValue) throw new Error("Expected generic spices line to fail");
});

Deno.test("isChefAdviceLowValue: «Чтобы блюдо… готовьте аккуратно» — нет конкретной планки", () => {
  const bad = "Чтобы блюдо получилось вкуснее, готовьте аккуратно.";
  const r = isChefAdviceLowValue(bad, ctx);
  if (!r.lowValue) throw new Error("Expected vague «чтобы… аккуратно» to fail");
});

Deno.test("isChefAdviceLowValue: «Не пересушивайте» с температурой и длиной проходит (не режем regex'ом «с начала строки»)", () => {
  const good =
    "Не пересушивайте фрикадельки при 180°C: снимайте со сковороды, пока середина слегка розовая.";
  const r = isChefAdviceLowValue(good, ctx);
  if (r.lowValue) throw new Error(`Expected pass, got ${r.reason}`);
});

Deno.test("isChefAdviceLowValue: одна фраза «Подавайте горячим.» — generic_serving_only", () => {
  const r = isChefAdviceLowValue("Подавайте горячим.", ctx);
  if (!r.lowValue || r.reason !== "generic_serving_only") {
    throw new Error(`Expected generic_serving_only, got ${JSON.stringify(r)}`);
  }
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
