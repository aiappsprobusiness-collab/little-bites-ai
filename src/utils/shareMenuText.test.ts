import {
  appendShareLinkOnce,
  buildDayMenuShareBody,
  buildWeekMenuShareBody,
  weekMealsBrief,
} from "./shareMenuText";

describe("shareMenuText", () => {
  describe("buildDayMenuShareBody", () => {
    it("skips empty slots and uses перекус label for snack", () => {
      const text = buildDayMenuShareBody([
        { meal_type: "lunch", label: "Обед", title: "Борщ" },
        { meal_type: "snack", label: "Полдник", title: "Йогурт" },
        { meal_type: "breakfast", label: "Завтрак", title: "Каша" },
      ]);
      expect(text).toContain("Собрал(а) меню на день 👇");
      expect(text).toContain("🍓 Завтрак: Каша");
      expect(text).toContain("🍲 Обед: Борщ");
      expect(text).toContain("🥪 Перекус: Йогурт");
      expect(text).not.toContain("Ужин");
      expect(text).toContain("Список продуктов уже готов");
    });

    it("omits snack when not planned", () => {
      const text = buildDayMenuShareBody([
        { meal_type: "breakfast", label: "Завтрак", title: "Омлет" },
      ]);
      expect(text).not.toContain("Перекус");
    });
  });

  describe("buildWeekMenuShareBody", () => {
    it("builds lines for each day", () => {
      const text = buildWeekMenuShareBody([
        { dayShort: "Пн", brief: "Каша, суп" },
        { dayShort: "Вт", brief: "—" },
      ]);
      expect(text).toContain("Меню на неделю 👇");
      expect(text).toContain("Пн — Каша, суп");
      expect(text).toContain("Вт — —");
      expect(text).toContain("Список продуктов можно собрать в приложении");
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
});
