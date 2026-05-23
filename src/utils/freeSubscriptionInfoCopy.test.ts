import { describe, expect, it } from "vitest";
import {
  FREE_SUBSCRIPTION_INFO_BULLETS,
  FREE_SUBSCRIPTION_INFO_CTA,
  FREE_SUBSCRIPTION_INFO_TITLE,
  getFreeSubscriptionInfoLead,
} from "./freeSubscriptionInfoCopy";

describe("freeSubscriptionInfoCopy", () => {
  it("заголовок и CTA bottom sheet (вариант 2)", () => {
    expect(FREE_SUBSCRIPTION_INFO_TITLE).toBe("Вы на бесплатном плане");
    expect(FREE_SUBSCRIPTION_INFO_CTA).toBe("Что даёт полная версия");
  });

  it("bullets без слова «пул»", () => {
    for (const line of FREE_SUBSCRIPTION_INFO_BULLETS) {
      expect(line).not.toMatch(/пул/i);
    }
    expect(FREE_SUBSCRIPTION_INFO_BULLETS.some((l) => l.includes("2 в день"))).toBe(true);
  });

  it("lead для чата рецептов подставляет счётчик", () => {
    expect(
      getFreeSubscriptionInfoLead({
        mode: "recipes",
        recipeRemaining: 3,
        recipeDailyLimit: 5,
        helpUsed: 0,
        helpDailyLimit: 2,
      }),
    ).toBe("Сегодня осталось 3 из 5 подборов.");
  });

  it("lead для помощи маме", () => {
    expect(
      getFreeSubscriptionInfoLead({
        mode: "help",
        recipeRemaining: null,
        recipeDailyLimit: null,
        helpUsed: 1,
        helpDailyLimit: 2,
      }),
    ).toBe("Сегодня осталось 1 из 2 вопросов в «Помощь маме».");
  });
});
