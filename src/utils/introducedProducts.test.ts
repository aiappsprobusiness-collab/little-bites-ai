import { describe, expect, it } from "vitest";
import {
  calendarDaysBetweenLocalYmd,
  extractKeyProductKeysFromIngredients,
  getIntroducingDaysPassed,
  getIntroducingDisplayDay,
  isIntroducingGracePeriod,
  isIntroducingPeriodActive,
  normalizeProductKey,
  shouldAutoClearIntroducingPeriod,
} from "./introducedProducts";

describe("normalizeProductKey", () => {
  it("matches Russian zucchini stems (JS \\b does not work on Cyrillic)", () => {
    expect(normalizeProductKey("кабачок")).toBe("zucchini");
    expect(normalizeProductKey("Пюре из кабачка")).toBe("zucchini");
    expect(normalizeProductKey("Молодой кабачок")).toBe("zucchini");
  });

  it("matches English aliases", () => {
    expect(normalizeProductKey("zucchini")).toBe("zucchini");
  });
});

describe("extractKeyProductKeysFromIngredients", () => {
  it("resolves keys from RU ingredient lines", () => {
    const keys = extractKeyProductKeysFromIngredients(
      [{ name: "Кабачок", display_text: "кабачок — 50 г" }],
      2
    );
    expect(keys).toContain("zucchini");
  });
});

describe("introducing period — дни и пропуски", () => {
  const start = "2026-03-15";

  it("daysPassed 0: день 1, активный период", () => {
    const now = new Date(2026, 2, 15);
    expect(getIntroducingDaysPassed(start, now)).toBe(0);
    expect(getIntroducingDisplayDay(start, now)).toBe(1);
    expect(isIntroducingPeriodActive("zucchini", start, now)).toBe(true);
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
    expect(shouldAutoClearIntroducingPeriod(start, now)).toBe(false);
  });

  it("daysPassed 2: день 3, ещё активный период", () => {
    const now = new Date(2026, 2, 17);
    expect(getIntroducingDaysPassed(start, now)).toBe(2);
    expect(getIntroducingDisplayDay(start, now)).toBe(3);
    expect(isIntroducingPeriodActive("zucchini", start, now)).toBe(true);
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
  });

  it("daysPassed 3–4: без номера дня, grace UI", () => {
    const d3 = new Date(2026, 2, 18);
    expect(getIntroducingDaysPassed(start, d3)).toBe(3);
    expect(getIntroducingDisplayDay(start, d3)).toBeNull();
    expect(isIntroducingPeriodActive("zucchini", start, d3)).toBe(false);
    expect(isIntroducingGracePeriod("zucchini", start, d3)).toBe(true);

    const d4 = new Date(2026, 2, 19);
    expect(getIntroducingDaysPassed(start, d4)).toBe(4);
    expect(isIntroducingGracePeriod("zucchini", start, d4)).toBe(true);
  });

  it("daysPassed 5+: автосброс", () => {
    const now = new Date(2026, 2, 20);
    expect(getIntroducingDaysPassed(start, now)).toBe(5);
    expect(shouldAutoClearIntroducingPeriod(start, now)).toBe(true);
    expect(getIntroducingDisplayDay(start, now)).toBeNull();
    expect(isIntroducingGracePeriod("zucchini", start, now)).toBe(false);
  });

  it("calendarDaysBetweenLocalYmd", () => {
    expect(calendarDaysBetweenLocalYmd("2026-03-15", "2026-03-20")).toBe(5);
  });
});
