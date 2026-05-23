import { describe, expect, it } from "vitest";
import { paywallBodyPair, splitPaywallMessage } from "./paywallBodyLines";
import { getPaywallReasonCopy } from "./paywallReasonCopy";

describe("paywallBodyLines", () => {
  it("splitPaywallMessage убирает пустые строки", () => {
    expect(splitPaywallMessage("Первая\n\nВторая")).toEqual(["Первая", "Вторая"]);
  });

  it("paywallBodyPair возвращает кортеж из двух строк", () => {
    expect(paywallBodyPair("a", "b")).toEqual(["a", "b"]);
  });
});

describe("getPaywallReasonCopy bodyLines", () => {
  it("shopping_list — короткие строки без \\n", () => {
    const { bodyLines } = getPaywallReasonCopy("shopping_list");
    expect(bodyLines[0]).toContain("Список покупок");
    expect(bodyLines[1]).toContain("один поход");
    expect(bodyLines.join("")).not.toContain("\n");
  });

  it("free_plan_overview — понятный контекст бесплатного плана", () => {
    const { title, bodyLines } = getPaywallReasonCopy("free_plan_overview");
    expect(title).toContain("бесплатном");
    expect(bodyLines[0]).toMatch(/план|чат|лимит/i);
    expect(bodyLines[1]).toMatch(/полной/i);
  });
});
