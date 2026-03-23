import { describe, expect, it } from "vitest";
import { getShareIntroText } from "./shareDayMenuText";

describe("getShareIntroText", () => {
  it("before 18:00 uses today variants", () => {
    const d = new Date(2025, 0, 15, 17, 59, 0, 0);
    const text = getShareIntroText(d, () => 0);
    expect(text).toBe(
      "Собрала для семьи меню на сегодня в MomRecipes 👇"
    );
  });

  it("from 18:00 uses tomorrow variants", () => {
    const d = new Date(2025, 0, 15, 18, 0, 0, 0);
    const text = getShareIntroText(d, () => 0);
    expect(text).toBe(
      "Собрала меню для семьи на завтра в MomRecipes 👇"
    );
  });

  it("picks another variant when random is high", () => {
    const d = new Date(2025, 0, 15, 10, 0, 0, 0);
    const text = getShareIntroText(d, () => 0.99);
    expect(text).toBe(
      "Делюсь меню на сегодня, собрала в MomRecipes 👇"
    );
  });
});
