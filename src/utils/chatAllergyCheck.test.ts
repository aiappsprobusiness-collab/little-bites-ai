import { describe, it, expect } from "vitest";
import { checkChatAllergyBlock } from "./chatAllergyCheck";

describe("checkChatAllergyBlock", () => {
  it('blocks "ужин курица" when allergy is курица', () => {
    const result = checkChatAllergyBlock("ужин курица", ["курица"]);
    expect(result.blocked).toBe(true);
    expect(result.found).toContain("курица");
  });

  it('blocks "ореховый пудинг" when allergy is орехи (no substitution)', () => {
    const result = checkChatAllergyBlock("ореховый пудинг", ["орехи"]);
    expect(result.blocked).toBe(true);
    expect(result.found.length).toBeGreaterThan(0);
  });

  it('does not block "гречневая каша" when allergy is курица', () => {
    const result = checkChatAllergyBlock("гречневая каша на воде", ["курица"]);
    expect(result.blocked).toBe(false);
    expect(result.found).toHaveLength(0);
  });

  it("returns not blocked when allergies empty", () => {
    const result = checkChatAllergyBlock("ужин курица", []);
    expect(result.blocked).toBe(false);
  });
});
