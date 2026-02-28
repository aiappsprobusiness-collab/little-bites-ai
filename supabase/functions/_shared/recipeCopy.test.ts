/**
 * Tests for recipeCopy: description length, sentence count, variety.
 * Run: deno test recipeCopy.test.ts --allow-read
 */
import {
  buildRecipeDescription,
  buildChefAdvice,
  shouldReplaceDescription,
  shouldReplaceChefAdvice,
  DESCRIPTION_MIN_LENGTH,
} from "./recipeCopy.ts";

function sentenceCount(text: string): number {
  return (text.match(/[.!?]+/g) ?? []).length;
}

Deno.test("buildRecipeDescription: length >= DESCRIPTION_MIN_LENGTH", () => {
  const d = buildRecipeDescription({ title: "Кукурузная каша", keyIngredient: "кукурузная крупа" });
  if (d.length < DESCRIPTION_MIN_LENGTH) {
    throw new Error(`Expected description length >= ${DESCRIPTION_MIN_LENGTH}, got ${d.length}`);
  }
});

Deno.test("buildRecipeDescription: at least 2 sentences", () => {
  const d = buildRecipeDescription({ title: "Омлет", keyIngredient: "яйца" });
  const n = sentenceCount(d);
  if (n < 2) throw new Error(`Expected at least 2 sentences, got ${n}`);
});

Deno.test("buildRecipeDescription: 7 of 10 different first sentences", () => {
  const titles = [
    "Кукурузная каша",
    "Пшённая каша",
    "Рисовая каша с грушей",
    "Омлет",
    "Суп",
    "Сырники",
    "Блинчики",
    "Творожная запеканка",
    "Гречневая каша",
    "Манная каша",
  ];
  const firstSentences = titles.map((t) => {
    const d = buildRecipeDescription({ title: t, userText: t, keyIngredient: "крупа" });
    const first = d.split(/[.!?]/)[0]?.trim() ?? "";
    return first;
  });
  const unique = new Set(firstSentences);
  if (unique.size < 7) {
    throw new Error(`Expected at least 7 unique first sentences out of 10, got ${unique.size}`);
  }
});

Deno.test("buildChefAdvice: non-empty and varied", () => {
  const a1 = buildChefAdvice({ title: "Каша", userText: "каша" });
  const a2 = buildChefAdvice({ title: "Омлет", userText: "омлет" });
  if (!a1.trim() || !a2.trim()) throw new Error("chefAdvice should be non-empty");
  if (a1 === a2) throw new Error("Different seeds should give different chefAdvice");
});

Deno.test("shouldReplaceDescription: empty or short => true", () => {
  if (!shouldReplaceDescription("")) throw new Error("empty should replace");
  if (!shouldReplaceDescription("   ")) throw new Error("whitespace should replace");
  if (!shouldReplaceDescription("Короткая фраза.")) throw new Error("short should replace");
});

Deno.test("shouldReplaceDescription: long informative => false", () => {
  const long =
    "Кукурузная каша на воде — сытное и полезное блюдо. В составе кукурузная крупа и вода, текстура нежная. " +
    "Консистенцию можно регулировать. Хранить в холодильнике до 2 дней.";
  if (long.length < DESCRIPTION_MIN_LENGTH) throw new Error("test string too short");
  if (shouldReplaceDescription(long)) throw new Error("long informative description should NOT replace");
});

Deno.test("shouldReplaceChefAdvice: empty => true, long enough => false", () => {
  if (!shouldReplaceChefAdvice("")) throw new Error("empty advice should replace");
  if (shouldReplaceChefAdvice("Подавайте тёплым — так вкус раскрывается лучше. Перед подачей дайте 2–3 минуты.")) {
    throw new Error("long enough advice should NOT replace");
  }
});
