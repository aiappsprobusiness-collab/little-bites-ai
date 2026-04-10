import { describe, it, expect } from "vitest";
import { mealPlanQueryTouchesPlannedDate } from "./mealPlanQueryInvalidation";
import { mealPlansKey, MEAL_PLANS_QUERY_SINGLE_DAY_SENTINEL } from "@/hooks/useMealPlans";

describe("mealPlanQueryTouchesPlannedDate", () => {
  const uid = "user-1";
  const d = "2026-04-10";

  it("совпадает с однодневным ключом (sentinel на [4], muted на [5])", () => {
    const key = mealPlansKey({
      userId: uid,
      memberId: null,
      start: d,
      mutedWeekKey: "2026-04-04",
    });
    expect(key[4]).toBe(MEAL_PLANS_QUERY_SINGLE_DAY_SENTINEL);
    expect(mealPlanQueryTouchesPlannedDate(key, uid, d)).toBe(true);
    expect(mealPlanQueryTouchesPlannedDate(key, uid, "2026-04-11")).toBe(false);
  });

  it("не путает mutedWeekKey (дата) с end недели: диапазон только при [4] как YYYY-MM-DD без sentinel", () => {
    const weekKey = mealPlansKey({
      userId: uid,
      memberId: null,
      start: "2026-04-04",
      end: "2026-04-10",
      mutedWeekKey: "2026-04-04",
    });
    expect(mealPlanQueryTouchesPlannedDate(weekKey, uid, "2026-04-07")).toBe(true);
    expect(mealPlanQueryTouchesPlannedDate(weekKey, uid, "2026-04-11")).toBe(false);
  });
});
