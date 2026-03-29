import {
  appendDayMenuShareLink,
  appendShareLinkOnce,
  buildDayMenuShareBody,
  buildWeekMenuShareBody,
  weekMealsBrief,
} from "./shareMenuText";

describe("shareMenuText", () => {
  describe("buildDayMenuShareBody", () => {
    const fixedIntro = "Собрала для семьи меню на сегодня в MomRecipes 👇";

    it("skips empty slots and uses fixed RU labels for slots", () => {
      const text = buildDayMenuShareBody(
        [
          { meal_type: "lunch", label: "Обед", title: "Борщ" },
          { meal_type: "snack", label: "Полдник", title: "Йогурт" },
          { meal_type: "breakfast", label: "Завтрак", title: "Каша" },
        ],
        { intro: fixedIntro }
      );
      expect(text.startsWith(fixedIntro)).toBe(true);
      expect(text).toContain("🍓 Завтрак: Каша");
      expect(text).toContain("🍲 Обед: Борщ");
      expect(text).toContain("🥪 Перекус: Йогурт");
      expect(text).not.toContain("Ужин");
      expect(text).toContain(
        "Список продуктов уже готов — можно сразу идти в магазин 🛒"
      );
    });

    it("omits snack when not planned", () => {
      const text = buildDayMenuShareBody(
        [{ meal_type: "breakfast", label: "Завтрак", title: "Омлет" }],
        { intro: fixedIntro }
      );
      expect(text).not.toContain("Перекус");
    });
  });

  describe("buildWeekMenuShareBody", () => {
    const fixedOpts = { headerIndex: 0, ctaIndex: 0 } as const;

    it("formats each day as a block with meal lines and week-specific emojis", () => {
      const text = buildWeekMenuShareBody(
        [
          {
            dayShort: "Вс",
            meals: [
              { meal_type: "breakfast", title: "Рисовая каша с бананом" },
              { meal_type: "lunch", title: "Тыквенный суп-пюре с рисом" },
            ],
          },
          {
            dayShort: "Пн",
            meals: [
              { meal_type: "breakfast", title: "Киноа с фруктами" },
              { meal_type: "lunch", title: "Рыбный суп с треской и картофелем" },
            ],
          },
        ],
        fixedOpts
      );
      expect(text).toContain("Посмотри, какое меню получилось на неделю 👇");
      expect(text).toContain("Вс");
      expect(text).toContain("🍚 Завтрак: Рисовая каша с бананом");
      expect(text).toContain("🥣 Обед: Тыквенный суп-пюре с рисом");
      expect(text).toContain("Пн");
      expect(text).toContain("🍚 Завтрак: Киноа с фруктами");
      expect(text).toContain("🥣 Обед: Рыбный суп с треской и картофелем");
      expect(text).toContain("🛒 Список продуктов соберётся автоматически:");
      expect(text).not.toMatch(/,\s*Тыквенный/);
    });

    it("skips empty days and uses legacy brief line when meals absent", () => {
      const text = buildWeekMenuShareBody(
        [
          { dayShort: "Пн", brief: "Каша, суп" },
          { dayShort: "Вт", brief: "—" },
        ],
        fixedOpts
      );
      expect(text).toContain("Пн — Каша, суп");
      expect(text).not.toContain("Вт");
    });

    it("picks CTA by ctaIndex", () => {
      const text = buildWeekMenuShareBody(
        [{ dayShort: "Пн", meals: [{ meal_type: "lunch", title: "Суп" }] }],
        { headerIndex: 0, ctaIndex: 1 }
      );
      expect(text).toContain("👉 Открыть меню и собрать список продуктов:");
    });
  });

  describe("weekMealsBrief", () => {
    it("takes at most two titles", () => {
      expect(weekMealsBrief([{ title: "A" }, { title: "B" }, { title: "C" }])).toBe("A, B");
    });
    it("returns dash for empty", () => {
      expect(weekMealsBrief([])).toBe("—");
    });
  });

  describe("appendShareLinkOnce", () => {
    it("appends link when absent", () => {
      expect(appendShareLinkOnce("Привет", "https://x.test/p/abc")).toBe("Привет\nhttps://x.test/p/abc");
    });
    it("does not duplicate if already in text", () => {
      const u = "https://momrecipes.online/p/xyz";
      expect(appendShareLinkOnce(`Текст\n${u}`, u)).toBe(`Текст\n${u}`);
    });
    it("ignores empty link", () => {
      expect(appendShareLinkOnce("A", "")).toBe("A");
    });
  });

  describe("appendDayMenuShareLink", () => {
    it("adds Посмотреть меню and url as last line", () => {
      const body = "Текст\n\nстрока";
      const u = "https://momrecipes.online/p/abc";
      expect(appendDayMenuShareLink(body, u)).toBe(
        `${body}\n\nПосмотреть меню:\n${u}`
      );
    });
    it("does not duplicate url", () => {
      const u = "https://x.test/p/x";
      expect(appendDayMenuShareLink(`A\n${u}`, u)).toBe(`A\n${u}`);
    });
  });
});
