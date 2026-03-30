/**
 * Контрактные тесты: блокировка по аллергии/dislike, исключение «без X», границы слов.
 * Запуск: из supabase/functions: deno test deepseek-chat/domain/policies/policies.test.ts --allow-read
 */
import { buildBlockedTokenSet, findMatchedTokens, textWithoutExclusionPhrases, checkRecipeRequestBlocked } from "./index.ts";

Deno.test("textWithoutExclusionPhrases: удаляет фразу «без X»", () => {
  const out = textWithoutExclusionPhrases("суп без лука с зеленью");
  if (!out.includes("суп") || out.includes("лук")) {
    throw new Error(`Expected "суп ..." without "лук", got: ${out}`);
  }
});

Deno.test("textWithoutExclusionPhrases: запрос только «без лука» даёт пустой контекст для матча", () => {
  const out = textWithoutExclusionPhrases("рецепт без лука");
  if (out.trim().toLowerCase().includes("лук")) {
    throw new Error(`Exclusion phrase should remove "лук" from check context, got: ${out}`);
  }
});

Deno.test("blocked by allergy: запрос с орехами при аллергии на орехи — блок", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "печенье с орехами",
    allergiesList: ["орехи"],
    dislikesList: [],
    profileName: "Ребёнок",
  });
  if (!payload || !payload.blocked || payload.blocked_by !== "allergy") {
    throw new Error(`Expected blocked by allergy, got: ${JSON.stringify(payload)}`);
  }
  if (!payload.blocked_items.some((x) => x.toLowerCase().includes("орех"))) {
    throw new Error(`Expected blocked_items to mention орехи, got: ${payload.blocked_items.join(", ")}`);
  }
});

Deno.test("blocked by dislike: запрос с луком при dislike лук — блок", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "суп с луком",
    allergiesList: [],
    dislikesList: ["лук"],
    profileName: "Мама",
  });
  if (!payload || !payload.blocked || payload.blocked_by !== "dislike") {
    throw new Error(`Expected blocked by dislike, got: ${JSON.stringify(payload)}`);
  }
});

Deno.test("NOT blocked: «суп без лука» при аллергии на лук — не блокируем", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "суп без лука",
    allergiesList: ["лук"],
    dislikesList: [],
    profileName: "Ребёнок",
  });
  if (payload !== null) {
    throw new Error(`Expected no block for "без лука", got: ${JSON.stringify(payload)}`);
  }
});

Deno.test("NOT blocked: запрос без аллергена", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "рисовая каша на воде",
    allergiesList: ["орехи"],
    dislikesList: [],
    profileName: "Ребёнок",
  });
  if (payload !== null) {
    throw new Error(`Expected no block, got: ${JSON.stringify(payload)}`);
  }
});

Deno.test("blocked by allergy: яйцом и яйцами при аллергии яйца — блок (как клиент, подстрока стема)", () => {
  for (const userMessage of ["дай ужин с яйцом", "дай ужин с яйцами"]) {
    const payload = checkRecipeRequestBlocked({
      userMessage,
      allergiesList: ["яйца"],
      dislikesList: [],
      profileName: "Малыш",
    });
    if (!payload?.blocked || payload.blocked_by !== "allergy") {
      throw new Error(`Expected block for "${userMessage}", got: ${JSON.stringify(payload)}`);
    }
  }
});

Deno.test("NOT blocked: запеканка — подстрока «орех» не входит в слово", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "запеканка с творогом",
    allergiesList: ["орехи"],
    dislikesList: [],
    profileName: "Ребёнок",
  });
  if (payload !== null) {
    throw new Error(`Expected no false positive on запеканка, got: ${JSON.stringify(payload)}`);
  }
});

Deno.test("findMatchedTokens: запеканка не матчит орех (граница слова)", () => {
  const set = buildBlockedTokenSet({ allergies: ["орехи"], dislikes: [] });
  const item = set.allergyItems[0];
  if (!item) throw new Error("no allergy item");
  const matched = findMatchedTokens("запеканка с творогом", item.tokens);
  const hasOreh = matched.some((t) => t.includes("орех") || "запеканка".includes(t));
  if (hasOreh) {
    throw new Error('"запеканка" must not match token "орех", got: ' + matched.join(", "));
  }
});

Deno.test("blocked response contract: message and suggested_alternatives present", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "молочная каша",
    allergiesList: ["БКМ"],
    dislikesList: [],
    profileName: "Семья",
  });
  if (!payload) throw new Error("Expected block for БКМ");
  if (typeof payload.message !== "string" || payload.message.length === 0) {
    throw new Error("blocked payload must have non-empty message");
  }
  if (!Array.isArray(payload.suggested_alternatives)) {
    throw new Error("blocked payload must have suggested_alternatives array");
  }
});

Deno.test("blocked by allergy: мясо + курица/говядина/мясное (umbrella)", () => {
  for (
    const userMessage of ["дай что-то мясное", "сделай суп с курицей", "тефтели из говядины"]
  ) {
    const payload = checkRecipeRequestBlocked({
      userMessage,
      allergiesList: ["мясо"],
      dislikesList: [],
      profileName: "Ребёнок",
    });
    if (!payload?.blocked || payload.blocked_by !== "allergy") {
      throw new Error(`Expected block for "${userMessage}", got: ${JSON.stringify(payload)}`);
    }
    if (!payload.blocked_items.some((x) => x.toLowerCase().includes("мяс"))) {
      throw new Error(`Expected мясо in blocked_items, got: ${payload.blocked_items.join(", ")}`);
    }
  }
});

Deno.test("NOT blocked: нейтральный суп при аллергии мясо", () => {
  const payload = checkRecipeRequestBlocked({
    userMessage: "дай суп на ужин",
    allergiesList: ["мясо"],
    dislikesList: [],
    profileName: "Ребёнок",
  });
  if (payload !== null) {
    throw new Error(`Expected no pre-block for neutral query, got: ${JSON.stringify(payload)}`);
  }
});
