/**
 * Проверка гипотезы: блокировка запроса в чате по аллергии «яйца» и формы «яйцами» / «яйцом».
 */
import { describe, expect, it } from "vitest";
import { checkChatRequestAgainstProfile } from "./chatBlockedCheck";
import { buildBlockedTokensFromAllergies } from "./allergyAliases";
import { containsAnyToken, containsAnyTokenForAllergy } from "@/shared/allergensDictionary";
describe("аллергия яйца: морфология и единство клиент/Edge", () => {
  const member = { name: "Малыш", allergies: ["яйца"] as string[], dislikes: [] as string[] };

  it("клиент: и яйцами, и яйцом блокируются (подстрока токена «яйц»)", () => {
    expect(
      checkChatRequestAgainstProfile({ text: "дай ужин с яйцами", member }),
    ).not.toBeNull();
    expect(
      checkChatRequestAgainstProfile({ text: "дай ужин с яйцом", member }),
    ).not.toBeNull();
  });

  it("латинская «A» в конце «яйцA» — не совпадает с алиасом «яйца», но fallback даёт стем «яйц»", () => {
    const latinA = "\u044f\u0439\u0446\u0041";
    expect(latinA.normalize("NFC")).toBe(latinA);
    const tokens = buildBlockedTokensFromAllergies([latinA]);
    expect(tokens.some((t) => t === "яйц")).toBe(true);
    expect(
      checkChatRequestAgainstProfile({
        text: "дай ужин с яйцом",
        member: { ...member, allergies: [latinA] },
      }),
    ).not.toBeNull();
  });

  it("containsAnyTokenForAllergy: обе формы дают hit", () => {
    const tokens = buildBlockedTokensFromAllergies(["яйца"]);
    expect(tokens.some((t) => t === "яйц")).toBe(true);
    expect(containsAnyTokenForAllergy("дай ужин с яйцами", tokens).hit).toBe(true);
    expect(containsAnyTokenForAllergy("дай ужин с яйцом", tokens).hit).toBe(true);
  });

  it("containsAnyToken (граница слова): короткий стем «яйц» не матчится внутри яйцами/яйцом", () => {
    const tokens = buildBlockedTokensFromAllergies(["яйца"]);
    expect(containsAnyToken("дай ужин с яйцами", tokens).hit).toBe(false);
    expect(containsAnyToken("дай ужин с яйцом", tokens).hit).toBe(false);
  });

  it("findMatchedTokens (граница слова): стем «яйц» не матчится внутри «яйцом» — Edge checkRecipeRequestBlocked теперь как клиент (подстрока)", async () => {
    const { findMatchedTokens, buildBlockedTokenSet, textWithoutExclusionPhrases } = await import(
      "../../supabase/functions/_shared/blockedTokens"
    );
    const set = buildBlockedTokenSet({ allergies: ["яйца"], dislikes: [] });
    const item = set.allergyItems[0]!;
    const msg = textWithoutExclusionPhrases("дай ужин с яйцом".toLowerCase());
    expect(findMatchedTokens(msg, item.tokens).length).toBe(0);
  });
});
