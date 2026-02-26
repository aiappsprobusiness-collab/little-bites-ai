/**
 * Tests for blockedTokens (chat guard: allergies + dislikes with same token expansion).
 * Run: deno test blockedTokens.test.ts --allow-read
 */
import { buildBlockedTokenSet, findMatchedTokens, normalizeToken } from "./blockedTokens.ts";

Deno.test("normalizeToken: lower, trim, collapse spaces", () => {
  if (normalizeToken("  Ягодный  пудинг  ") !== "ягодный пудинг") {
    throw new Error("normalizeToken should lower, trim, collapse spaces");
  }
});

Deno.test("findMatchedTokens: ягодный пудинг matches berry stems from ягоды", () => {
  const set = buildBlockedTokenSet({ allergies: ["ягоды"], dislikes: [] });
  const text = "ягодный пудинг";
  const allergyItem = set.allergyItems.find((item) => item.display === "ягоды");
  if (!allergyItem) throw new Error("allergyItems should contain ягоды");
  const matched = findMatchedTokens(text, allergyItem.tokens);
  if (matched.length === 0) {
    throw new Error('"ягодный пудинг" should match tokens from allergy ягоды, got: ' + allergyItem.tokens.join(", "));
  }
});

Deno.test("buildBlockedTokenSet: dislikes ягоды get same expansion as allergy", () => {
  const set = buildBlockedTokenSet({ allergies: [], dislikes: ["ягоды"] });
  if (set.dislikeItems.length !== 1 || set.dislikeItems[0].display !== "ягоды") {
    throw new Error("dislikeItems should have one item ягоды");
  }
  const tokens = set.dislikeItems[0].tokens;
  const matched = findMatchedTokens("ягодный пудинг", tokens);
  if (matched.length === 0) {
    throw new Error('Dislike "ягоды" should match "ягодный пудинг", tokens: ' + tokens.join(", "));
  }
});

Deno.test("findMatchedTokens: strawberry pie matches berries", () => {
  const set = buildBlockedTokenSet({ allergies: ["ягоды"], dislikes: [] });
  const allergyItem = set.allergyItems[0];
  const matched = findMatchedTokens("strawberry pie", allergyItem.tokens);
  if (matched.length === 0) {
    throw new Error('"strawberry pie" should match berry tokens: ' + allergyItem.tokens.join(", "));
  }
});
