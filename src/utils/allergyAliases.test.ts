import { describe, it, expect } from "vitest";
import { normalizeAllergyInput, expandAllergyToTokens, buildBlockedTokensFromAllergies } from "./allergyAliases";
import { containsAnyTokenForAllergy } from "./allergenTokens";

describe("normalizeAllergyInput", () => {
  it('normalizes "БКМ" to canonical "белок коровьего молока"', () => {
    expect(normalizeAllergyInput("БКМ")).toBe("белок коровьего молока");
  });

  it('normalizes "gluten" to canonical "глютен"', () => {
    expect(normalizeAllergyInput("gluten")).toBe("глютен");
  });

  it('normalizes "e220" to canonical "сульфиты"', () => {
    expect(normalizeAllergyInput("e220")).toBe("сульфиты");
  });

  it("returns trimmed input for unknown allergy", () => {
    expect(normalizeAllergyInput("  что-то редкое  ")).toBe("что-то редкое");
  });

  it('normalizes "CMPA" to "белок коровьего молока"', () => {
    expect(normalizeAllergyInput("CMPA")).toBe("белок коровьего молока");
  });
});

describe("expandAllergyToTokens", () => {
  it("БКМ returns tokens including казеин and milk", () => {
    const { canonical, tokens } = expandAllergyToTokens("БКМ");
    expect(canonical).toBe("белок коровьего молока");
    expect(tokens).toContain("казеин");
    expect(tokens.some((t) => t === "milk" || t.includes("milk"))).toBe(true);
  });

  it("БКМ tokens do not contain standalone лактоз (lactose sugar), but contain безлактоз/безлактозный for CMPA safety", () => {
    const { tokens } = expandAllergyToTokens("БКМ");
    expect(tokens).not.toContain("лактоз");
    expect(tokens.some((t) => t === "безлактоз" || t === "безлактозный")).toBe(true);
  });

  it("БКМ tokens contain козий/козье for CMPA cross-reactivity", () => {
    const { tokens } = expandAllergyToTokens("БКМ");
    expect(tokens).toContain("козий");
    expect(tokens).toContain("козье");
  });

  it("яйца: токены не содержат голое «белок» (ложные срабатывания на описаниях)", () => {
    const { tokens } = expandAllergyToTokens("яйца");
    expect(tokens).not.toContain("белок");
  });
});

describe("egg allergy blocking (containsAnyTokenForAllergy + buildBlockedTokensFromAllergies)", () => {
  const eggTokens = () => buildBlockedTokensFromAllergies(["яйца"]);

  it.each([
    ["источник белка"],
    ["даёт белок"],
    ["богато белком"],
  ])("не блокирует описание: %s", (text) => {
    expect(containsAnyTokenForAllergy(text, eggTokens()).hit).toBe(false);
  });

  it.each([
    ["яйцо"],
    ["яичный белок"],
    ["белок яйца"],
    ["egg"],
    ["egg white"],
  ])("блокирует: %s", (text) => {
    expect(containsAnyTokenForAllergy(text, eggTokens()).hit).toBe(true);
  });
});
