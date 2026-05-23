import { describe, expect, it } from "vitest";
import { FIRST_CHILD_WELCOME_BODY, getFirstChildWelcomeHeadline } from "./firstChildWelcomeCopy";

describe("FIRST_CHILD_WELCOME_BODY", () => {
  it("описывает заполнение профиля без канцелярита", () => {
    expect(FIRST_CHILD_WELCOME_BODY).toContain("Заполните профиль ребёнка");
    expect(FIRST_CHILD_WELCOME_BODY).not.toContain("Аккаунт готов");
  });
});

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
