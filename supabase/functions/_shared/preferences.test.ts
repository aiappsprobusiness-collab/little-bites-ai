/**
 * Tests for soft preferences (berries ratio, isBerryRecipe, extractSoftPrefs).
 * Run: deno test preferences.test.ts --allow-read
 */
import {
  shouldFavorBerries,
  isBerryRecipe,
  extractSoftPrefs,
} from "./preferences.ts";

Deno.test("shouldFavorBerries: total=4 target=0.25 → 1 berry slot", () => {
  const target = 0.25;
  let berryCount = 0;
  const decisions: boolean[] = [];
  for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
    const want = shouldFavorBerries({
      slotIndex,
      targetRatio: target,
      alreadyBerryCount: berryCount,
    });
    decisions.push(want);
    if (want) berryCount++;
  }
  if (berryCount !== 1) {
    throw new Error(`Expected 1 berry slot in 4, got ${berryCount}. decisions=${JSON.stringify(decisions)}`);
  }
});

Deno.test("shouldFavorBerries: total=8 target=0.25 → 2 berry slots", () => {
  const target = 0.25;
  let berryCount = 0;
  const decisions: boolean[] = [];
  for (let slotIndex = 0; slotIndex < 8; slotIndex++) {
    const want = shouldFavorBerries({
      slotIndex,
      targetRatio: target,
      alreadyBerryCount: berryCount,
    });
    decisions.push(want);
    if (want) berryCount++;
  }
  if (berryCount !== 2) {
    throw new Error(`Expected 2 berry slots in 8, got ${berryCount}. decisions=${JSON.stringify(decisions)}`);
  }
});

Deno.test("shouldFavorBerries: slotIndex 0,1,2 → false when alreadyBerryCount=0", () => {
  if (shouldFavorBerries({ slotIndex: 0, targetRatio: 0.25, alreadyBerryCount: 0 })) throw new Error("slot 0 should not favor");
  if (shouldFavorBerries({ slotIndex: 1, targetRatio: 0.25, alreadyBerryCount: 0 })) throw new Error("slot 1 should not favor");
  if (shouldFavorBerries({ slotIndex: 2, targetRatio: 0.25, alreadyBerryCount: 0 })) throw new Error("slot 2 should not favor");
});

Deno.test("shouldFavorBerries: slotIndex 3 → true when alreadyBerryCount=0", () => {
  if (!shouldFavorBerries({ slotIndex: 3, targetRatio: 0.25, alreadyBerryCount: 0 })) {
    throw new Error("slot 3 should favor berries when count=0");
  }
});

Deno.test("isBerryRecipe: title with ягоды", () => {
  if (!isBerryRecipe({ title: "Торт с ягодами" })) throw new Error("Should detect berry by ягоды");
});

Deno.test("isBerryRecipe: title with малина", () => {
  if (!isBerryRecipe({ title: "Малиновый пирог" })) throw new Error("Should detect berry by малина");
});

Deno.test("isBerryRecipe: non-berry title", () => {
  if (isBerryRecipe({ title: "Гречневая каша на воде" })) throw new Error("Should not detect berry");
});

Deno.test("isBerryRecipe: berry in ingredients", () => {
  if (
    !isBerryRecipe({
      title: "Овсянка",
      recipe_ingredients: [{ name: "черника", display_text: "50 г" }],
    })
  ) {
    throw new Error("Should detect berry in ingredients");
  }
});

Deno.test("extractSoftPrefs: berriesLiked from likes", () => {
  const prefs = extractSoftPrefs({ likes: ["ягоды"] });
  if (!prefs.berriesLiked) throw new Error("Should set berriesLiked for ягоды in likes");
});

Deno.test("extractSoftPrefs: berriesLiked from preferences (fallback)", () => {
  const prefs = extractSoftPrefs({ preferences: ["любит ягоды"] });
  if (!prefs.berriesLiked) throw new Error("Should set berriesLiked for любит ягоды");
});

Deno.test("extractSoftPrefs: no prefs → berriesLiked false", () => {
  const prefs = extractSoftPrefs({ preferences: [] });
  if (prefs.berriesLiked) throw new Error("Empty prefs should not set berriesLiked");
});

Deno.test("extractSoftPrefs: null member → berriesLiked false", () => {
  const prefs = extractSoftPrefs(null);
  if (prefs.berriesLiked) throw new Error("Null member should not set berriesLiked");
});
