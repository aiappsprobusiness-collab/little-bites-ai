/**
 * Тесты chatLikesSignal (anti-repeat likes + мягкий текст).
 * Запуск: из supabase/functions: deno test _shared/chatLikesSignal.test.ts --allow-read
 */
import {
  buildLikesAntiRepeatPromptLine,
  buildRecipeSoftLikesPromptBlock,
  detectRepeatedLikesInRecentTitles,
  likeMatchesTitleKey,
  normalizeKeyForLikesMatch,
} from "./chatLikesSignal.ts";

Deno.test("normalizeKeyForLikesMatch: lower and strip punctuation", () => {
  const k = normalizeKeyForLikesMatch("  Шашлык  из  Баранины! ");
  if (k !== "шашлык из баранины") {
    throw new Error(`unexpected normalized key: ${k}`);
  }
});

Deno.test("likeMatchesTitleKey: substring баранина in title", () => {
  const t = normalizeKeyForLikesMatch("Плов с бараниной");
  if (!likeMatchesTitleKey("баранина", t)) {
    throw new Error("expected баранина to match");
  }
});

Deno.test("detectRepeatedLikesInRecentTitles: finds баранина in last 3", () => {
  const { repeatedLikes, windowTitles } = detectRepeatedLikesInRecentTitles(
    ["баранина", "рис"],
    ["салат оливье", "шашлык из баранины", "рисовая каша"],
    { window: 3 }
  );
  if (windowTitles.length !== 3) throw new Error("window should be 3 titles");
  if (!repeatedLikes.includes("баранина")) {
    throw new Error("expected баранина in repeatedLikes, got: " + repeatedLikes.join(", "));
  }
  if (!repeatedLikes.includes("рис")) {
    throw new Error("expected рис (substring рисовая) in repeatedLikes");
  }
});

Deno.test("detectRepeatedLikesInRecentTitles: old title outside window ignored", () => {
  const { repeatedLikes } = detectRepeatedLikesInRecentTitles(
    ["баранина"],
    ["суп", "салат", "гречка", "баранина тушеная"],
    { window: 3 }
  );
  if (repeatedLikes.length !== 0) {
    throw new Error("баранина should be outside window, got repeats: " + repeatedLikes.join(", "));
  }
});

Deno.test("buildRecipeSoftLikesPromptBlock: states non-mandatory signal", () => {
  const b = buildRecipeSoftLikesPromptBlock("баранина", false);
  if (!b.includes("НЕ обязательно")) {
    throw new Error("expected non-mandatory wording");
  }
  if (!b.includes("баранина")) {
    throw new Error("expected likes list in block");
  }
  const fam = buildRecipeSoftLikesPromptBlock("рыба", true);
  if (!fam.includes("семьи")) {
    throw new Error("expected family scope");
  }
});

Deno.test("buildLikesAntiRepeatPromptLine: forbids repeating base", () => {
  const line = buildLikesAntiRepeatPromptLine(["баранина"]);
  if (!line.includes("баранина") || !line.includes("НЕ делай")) {
    throw new Error("expected anti-repeat instruction, got: " + line.slice(0, 80));
  }
});
