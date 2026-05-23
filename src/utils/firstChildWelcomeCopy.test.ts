import { describe, expect, it } from "vitest";
import { getFirstChildWelcomeHeadline } from "./firstChildWelcomeCopy";

describe("getFirstChildWelcomeHeadline", () => {
  it("подставляет имя из user_metadata", () => {
    expect(
      getFirstChildWelcomeHeadline({
        user_metadata: { display_name: "  Мария  " },
      } as never),
    ).toBe("Мария, рады вас видеть!");
  });

  it("без имени — нейтральный заголовок", () => {
    expect(getFirstChildWelcomeHeadline({ user_metadata: {} } as never)).toBe(
      "Рады, что вы с нами!",
    );
    expect(getFirstChildWelcomeHeadline(null)).toBe("Рады, что вы с нами!");
  });
});
