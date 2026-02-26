/**
 * Tests for allergy aliases (БКМ, лактоза, глютен, etc.) and blocking.
 * Run: deno test allergyAliases.test.ts --allow-read
 */
import { expandAllergyToTokens, buildBlockedTokensFromAllergies } from "./allergyAliases.ts";
import { getBlockedTokensFromAllergies, containsAnyToken } from "./allergens.ts";

Deno.test("БКМ => tokens contain казеин and milk", () => {
  const { tokens } = expandAllergyToTokens("БКМ");
  if (!tokens.includes("казеин")) throw new Error("БКМ tokens should include казеин, got: " + tokens.join(", "));
  if (!tokens.some((t) => t === "milk" || t.includes("milk"))) throw new Error("БКМ tokens should include milk, got: " + tokens.join(", "));
});

Deno.test("БКМ tokens do NOT contain лактоз (БКМ ≠ лактоза)", () => {
  const { tokens } = expandAllergyToTokens("БКМ");
  const hasLactose = tokens.some((t) => t.includes("лактоз") || t === "lactose");
  if (hasLactose) throw new Error("БКМ tokens must not include лактоза, got: " + tokens.join(", "));
});

Deno.test("каша на молоке blocked when allergies = [БКМ]", () => {
  const tokens = getBlockedTokensFromAllergies(["БКМ"]);
  const text = "каша на молоке";
  if (!containsAnyToken(text, tokens)) throw new Error('"каша на молоке" should be blocked when allergy is БКМ');
});

Deno.test("каша на молоке blocked when allergies = [белок коровьего молока]", () => {
  const tokens = getBlockedTokensFromAllergies(["белок коровьего молока"]);
  const text = "каша на молоке";
  if (!containsAnyToken(text, tokens)) throw new Error('"каша на молоке" should be blocked when allergy is белок коровьего молока');
});

Deno.test("buildBlockedTokensFromAllergies: CMPA and БКМ yield same tokens", () => {
  const fromCmpa = buildBlockedTokensFromAllergies(["CMPA"]);
  const fromBkm = buildBlockedTokensFromAllergies(["БКМ"]);
  const milkInCmpa = fromCmpa.some((t) => t === "milk" || t.includes("молок"));
  const milkInBkm = fromBkm.some((t) => t === "milk" || t.includes("молок"));
  if (!milkInCmpa || !milkInBkm) throw new Error("Both CMPA and БКМ should expand to milk/молок tokens");
});
