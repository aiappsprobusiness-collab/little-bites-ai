import { describe, expect, it } from "vitest";
import {
  getInfantPlanHeroBodyParagraph,
  getInfantPlanHeroIntroducedProductsHint,
  getInfantPlanHeroNoticeKind,
  getInfantPlanHeroNoticeText,
  INFANT_PLAN_HERO_BODY_BEFORE_COMPLEMENTARY,
  INFANT_PLAN_HERO_BODY_COMPLEMENTARY_ACTIVE,
  INFANT_PLAN_HERO_INTRODUCED_PRODUCTS_HINT,
  INFANT_PLAN_HERO_NOTICE_DOCTOR,
  INFANT_PLAN_HERO_NOTICE_TOO_EARLY,
} from "./infantComplementaryPlan";

describe("getInfantPlanHeroNoticeKind", () => {
  it("returns too_early for 0–3 months", () => {
    expect(getInfantPlanHeroNoticeKind(0)).toBe("too_early");
    expect(getInfantPlanHeroNoticeKind(3)).toBe("too_early");
  });

  it("returns doctor for 4–5 months", () => {
    expect(getInfantPlanHeroNoticeKind(4)).toBe("doctor");
    expect(getInfantPlanHeroNoticeKind(5)).toBe("doctor");
  });

  it("returns null from 6 months", () => {
    expect(getInfantPlanHeroNoticeKind(6)).toBeNull();
    expect(getInfantPlanHeroNoticeKind(11)).toBeNull();
  });
});

describe("getInfantPlanHeroBodyParagraph", () => {
  it("uses before-complementary copy under 4 months", () => {
    expect(getInfantPlanHeroBodyParagraph(2)).toBe(INFANT_PLAN_HERO_BODY_BEFORE_COMPLEMENTARY);
  });

  it("uses active complementary copy from 4 months", () => {
    expect(getInfantPlanHeroBodyParagraph(4)).toBe(INFANT_PLAN_HERO_BODY_COMPLEMENTARY_ACTIVE);
    expect(getInfantPlanHeroBodyParagraph(9)).toBe(INFANT_PLAN_HERO_BODY_COMPLEMENTARY_ACTIVE);
  });
});

describe("getInfantPlanHeroIntroducedProductsHint", () => {
  it("returns hint from 4 months", () => {
    expect(getInfantPlanHeroIntroducedProductsHint(8)).toBe(INFANT_PLAN_HERO_INTRODUCED_PRODUCTS_HINT);
  });

  it("returns null before complementary age", () => {
    expect(getInfantPlanHeroIntroducedProductsHint(2)).toBeNull();
  });
});

describe("getInfantPlanHeroNoticeText", () => {
  it("maps notice kinds to copy", () => {
    expect(getInfantPlanHeroNoticeText("too_early")).toBe(INFANT_PLAN_HERO_NOTICE_TOO_EARLY);
    expect(getInfantPlanHeroNoticeText("doctor")).toBe(INFANT_PLAN_HERO_NOTICE_DOCTOR);
  });
});
