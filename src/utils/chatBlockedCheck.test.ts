import { describe, it, expect } from "vitest";
import { checkChatRequestAgainstProfile, textWithoutExclusionPhrases } from "./chatBlockedCheck";

describe("checkChatRequestAgainstProfile", () => {
  it('returns blocked by allergy for "ужин курица" when member has allergy курица', () => {
    const result = checkChatRequestAgainstProfile({
      text: "ужин курица",
      member: { name: "Маша", allergies: ["курица"], dislikes: [] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.blocked_by).toBe("allergy");
    expect(result!.profile_name).toBe("Маша");
    expect(result!.matched).toContain("курица");
    expect(result!.message).toMatch(/аллергия/);
    expect(result!.message).toMatch(/курица/);
  });

  it('returns blocked by dislike for "суп с луком" when member dislikes лук', () => {
    const result = checkChatRequestAgainstProfile({
      text: "суп с луком",
      member: { name: "Вася", allergies: [], dislikes: ["лук"] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.blocked_by).toBe("dislike");
    expect(result!.profile_name).toBe("Вася");
    expect(result!.message).toMatch(/не любит/);
    expect(result!.message).toMatch(/лук/);
  });

  it("returns null when text has no blocked tokens", () => {
    const result = checkChatRequestAgainstProfile({
      text: "гречневая каша на воде",
      member: { name: "Маша", allergies: ["курица"], dislikes: ["лук"] },
    });
    expect(result).toBeNull();
  });

  it("returns null when member is null", () => {
    const result = checkChatRequestAgainstProfile({ text: "ужин курица", member: null });
    expect(result).toBeNull();
  });

  it("returns null when member has no allergies and no dislikes", () => {
    const result = checkChatRequestAgainstProfile({
      text: "ужин курица",
      member: { name: "Маша", allergies: [], dislikes: [] },
    });
    expect(result).toBeNull();
  });

  it("allergy takes precedence over dislike when both match", () => {
    const result = checkChatRequestAgainstProfile({
      text: "курица с луком",
      member: { name: "Маша", allergies: ["курица"], dislikes: ["лук"] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked_by).toBe("allergy");
  });

  it('blocks "ягодный пудинг" when member has allergy ягоды', () => {
    const result = checkChatRequestAgainstProfile({
      text: "ягодный пудинг",
      member: { name: "Маша", allergies: ["ягоды"], dislikes: [] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.blocked_by).toBe("allergy");
    expect(result!.matched).toContain("ягоды");
    expect(result!.message).toMatch(/аллергия/);
  });

  it('blocks "ягодный пудинг" when member dislikes ягоды', () => {
    const result = checkChatRequestAgainstProfile({
      text: "ягодный пудинг",
      member: { name: "Вася", allergies: [], dislikes: ["ягоды"] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.blocked_by).toBe("dislike");
    expect(result!.matched).toContain("ягоды");
    expect(result!.message).toMatch(/не любит/);
  });

  it('does NOT block "суп без картошки" when member has allergy картошка', () => {
    const result = checkChatRequestAgainstProfile({
      text: "суп без картошки",
      member: { name: "Маша", allergies: ["картошка"], dislikes: [] },
    });
    expect(result).toBeNull();
  });

  it('textWithoutExclusionPhrases removes "без лук" from "рецепт без лук"', () => {
    expect(textWithoutExclusionPhrases("рецепт без лук").includes("лук")).toBe(false);
    expect(textWithoutExclusionPhrases("суп без картошки").includes("картош")).toBe(false);
  });

  it('does NOT block "Рецепт без Лук" when member has allergy лук', () => {
    const result = checkChatRequestAgainstProfile({
      text: "Рецепт без Лук",
      member: { name: "Ави", allergies: ["Лук"], dislikes: [] },
    });
    expect(result).toBeNull();
  });

  it('blocks "суп с курицей" when member has allergy курица', () => {
    const result = checkChatRequestAgainstProfile({
      text: "суп с курицей",
      member: { name: "Маша", allergies: ["курица"], dislikes: [] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked_by).toBe("allergy");
    expect(result!.message).toMatch(/аллергия/);
  });

  it('blocks "дай ужин с яйцом" and "…яйцами" when allergy яйца (тот же стем «яйц», что и на Edge после сведения правил)', () => {
    const member = { name: "Малыш", allergies: ["яйца"], dislikes: [] };
    for (const text of ["дай ужин с яйцом", "дай ужин с яйцами"]) {
      const result = checkChatRequestAgainstProfile({ text, member });
      expect(result).not.toBeNull();
      expect(result!.blocked_by).toBe("allergy");
    }
  });

  it('blocks meaty query when allergy «мясо» (umbrella SoT)', () => {
    const member = { name: "Ребёнок", allergies: ["мясо"], dislikes: [] };
    for (const text of ["дай что-то мясное", "сделай суп с курицей", "тефтели из говядины"]) {
      const result = checkChatRequestAgainstProfile({ text, member });
      expect(result).not.toBeNull();
      expect(result!.blocked_by).toBe("allergy");
      expect(result!.matched.some((m) => m.toLowerCase().includes("мяс"))).toBe(true);
    }
  });

  it('does NOT block neutral soup query when allergy «мясо»', () => {
    const result = checkChatRequestAgainstProfile({
      text: "дай суп на ужин",
      member: { name: "Ребёнок", allergies: ["мясо"], dislikes: [] },
    });
    expect(result).toBeNull();
  });

  it('blocks «что-то молочное» when allergy БКМ', () => {
    const result = checkChatRequestAgainstProfile({
      text: "хочу что-то молочное",
      member: { name: "Маша", allergies: ["БКМ"], dislikes: [] },
    });
    expect(result).not.toBeNull();
    expect(result!.blocked_by).toBe("allergy");
  });
});
