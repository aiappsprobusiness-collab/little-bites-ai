import { describe, expect, it } from "vitest";
import { resolveChatRecipeServings } from "./chatRecipeServings";

describe("resolveChatRecipeServings", () => {
  it("семья из двух взрослых → около 4 порций на ужин", () => {
    expect(
      resolveChatRecipeServings({
        targetIsFamily: true,
        members: [
          { type: "adult", age_months: 300 },
          { type: "adult", age_months: 300 },
        ],
        mealType: "dinner",
      })
    ).toBe(4);
  });

  it("перекус — меньше порций", () => {
    const dinner = resolveChatRecipeServings({
      targetIsFamily: true,
      members: [{ type: "adult", age_months: 300 }, { type: "adult", age_months: 300 }],
      mealType: "dinner",
    });
    const snack = resolveChatRecipeServings({
      targetIsFamily: true,
      members: [{ type: "adult", age_months: 300 }, { type: "adult", age_months: 300 }],
      mealType: "snack",
    });
    expect(snack).toBeLessThan(dinner);
  });

  it("один взрослый профиль → 2 порции", () => {
    expect(
      resolveChatRecipeServings({
        targetIsFamily: false,
        members: [{ type: "adult", age_months: 300 }],
        mealType: "dinner",
      })
    ).toBe(2);
  });

  it("младенец &lt;12 мес в single → 1", () => {
    expect(
      resolveChatRecipeServings({
        targetIsFamily: false,
        members: [{ type: "child", age_months: 6 }],
        mealType: "lunch",
      })
    ).toBe(1);
  });
});
