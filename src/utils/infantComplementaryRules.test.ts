import { describe, expect, it } from "vitest";
import {
  evaluateInfantRecipeComplementaryRules,
  evaluateInfantSecondaryFamiliarOnly,
} from "@shared/infantComplementaryRules";

function ing(rows: Array<{ name?: string; display_text?: string }>) {
  return rows.map((r) => ({ ...r, category: null as string | null }));
}

describe("shared infantComplementaryRules (parity with Edge)", () => {
  it("старт: одно овощное пюре из тройки — ok", () => {
    const r = evaluateInfantRecipeComplementaryRules(ing([{ name: "Кабачок", display_text: "100 г" }]), []);
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("start_ok");
  });

  it("старт: банан + овсянка — отказ", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Банан", display_text: "50 г" },
        { name: "Овсянка", display_text: "20 г" },
      ]),
      []
    );
    expect(r.valid).toBe(false);
  });

  it("старт: вода + кабачок (несколько строк) — ok", () => {
    const r = evaluateInfantRecipeComplementaryRules(
      ing([
        { name: "Вода", display_text: "30 мл" },
        { name: "Кабачок", display_text: "100 г" },
      ]),
      []
    );
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("start_ok");
  });

  it("secondary: желток только в названии — отказ при невведённом яйце", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([{ name: "Кабачок", display_text: "40 г" }]),
      ["zucchini"],
      { title: "Пюре из кабачка с желтком", description: null }
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("secondary_has_novel");
    expect(r.novelKeys).toContain("egg");
  });

  it("secondary: кабачок + картофель при одной капусте — отказ", () => {
    const r = evaluateInfantSecondaryFamiliarOnly(
      ing([
        { name: "Кабачок", display_text: "40 г" },
        { name: "Картофель", display_text: "60 г" },
      ]),
      ["cauliflower"]
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("secondary_has_novel");
  });
});
