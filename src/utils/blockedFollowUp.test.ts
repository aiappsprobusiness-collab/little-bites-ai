import { describe, it, expect } from "vitest";
import { getRewrittenQueryIfFollowUp, deriveDishHint } from "./blockedFollowUp";

const blockedMeta = {
  blocked: true as const,
  original_query: "ягодное мороженое",
  blocked_items: ["ягоды"],
  suggested_alternatives: ["фрукты", "банан", "яблоко"],
  intended_dish_hint: "мороженое",
};

describe("getRewrittenQueryIfFollowUp", () => {
  it('returns rewritten query for "давай вариант с бананом" after blocked', () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: blockedMeta,
      lastAssistantTimestamp: new Date(now.getTime() - 60_000),
      userText: "давай вариант с бананом",
      now,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("мороженое");
    expect(result).toContain("банан");
    expect(result).not.toContain("ягод"); // без аллергена, иначе снова блок
  });

  it('returns rewritten query for "банан" (short) after blocked', () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: blockedMeta,
      lastAssistantTimestamp: new Date(now.getTime() - 120_000),
      userText: "банан",
      now,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("банан");
    expect(result).toBe("мороженое с банан");
  });

  it("returns null when user asks for new dish (суп)", () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: blockedMeta,
      lastAssistantTimestamp: new Date(now.getTime() - 60_000),
      userText: "суп",
      now,
    });
    expect(result).toBeNull();
  });

  it("returns null when user asks for new dish (омлет)", () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: blockedMeta,
      lastAssistantTimestamp: new Date(now.getTime() - 60_000),
      userText: "омлет на завтрак",
      now,
    });
    expect(result).toBeNull();
  });

  it("returns null when last message is not blocked", () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: null,
      lastAssistantTimestamp: new Date(now.getTime() - 60_000),
      userText: "давай вариант с бананом",
      now,
    });
    expect(result).toBeNull();
  });

  it("returns null when blocked message is older than 10 minutes", () => {
    const now = new Date();
    const result = getRewrittenQueryIfFollowUp({
      lastAssistantMeta: blockedMeta,
      lastAssistantTimestamp: new Date(now.getTime() - 11 * 60 * 1000),
      userText: "давай вариант с бананом",
      now,
    });
    expect(result).toBeNull();
  });
});

describe("deriveDishHint", () => {
  it("strips blocked word from query", () => {
    expect(deriveDishHint("ягодное мороженое", ["ягоды"])).toBe("мороженое");
  });
  it("returns original if nothing to strip", () => {
    expect(deriveDishHint("мороженое", ["ягоды"])).toBe("мороженое");
  });
});
