import { describe, it, expect } from "vitest";
import { containsAnyTokenForAllergy } from "./allergensDictionary";

describe("containsAnyTokenForAllergy", () => {
  it("blocks recipe text containing орехами when allergy tokens include орех", () => {
    const text = "тофу с авокадо и орехами";
    const tokens = ["орех", "ореховый", "миндал"];
    const result = containsAnyTokenForAllergy(text, tokens);
    expect(result.hit).toBe(true);
    expect(result.found).toContain("орех");
  });

  it("does not block chickpea (нут) when allergy tokens include nut", () => {
    const text = "тыквенно-морковное пюре с нутом";
    const tokens = ["орех", "nut", "nuts"];
    const result = containsAnyTokenForAllergy(text, tokens);
    expect(result.hit).toBe(false);
  });

  it("blocks real nuts in English", () => {
    const result = containsAnyTokenForAllergy("walnut and honey salad", ["орех", "walnut"]);
    expect(result.hit).toBe(true);
  });
});
