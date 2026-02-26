import { describe, it, expect } from "vitest";
import { normalizeAllergyInput, expandAllergyToTokens } from "./allergyAliases";

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

  it("БКМ tokens do not contain лактоз", () => {
    const { tokens } = expandAllergyToTokens("БКМ");
    expect(tokens.some((t) => t.includes("лактоз"))).toBe(false);
  });
});
