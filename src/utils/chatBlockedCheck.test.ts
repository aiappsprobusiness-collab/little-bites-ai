import { describe, it, expect } from "vitest";
import { checkChatRequestAgainstProfile } from "./chatBlockedCheck";

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
});
