import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { DayPlan } from "../vk-preview-plan/types.ts";
import { handleInboundEvent, type OrchestratorDeps, type SessionStore } from "./orchestrate.ts";
import type { TelegramButton, TelegramClient, TelegramSession } from "./types.ts";

type SentMessage = { chatId: number; text: string; buttons?: TelegramButton[][] };

function createFakeStore() {
  const map = new Map<number, TelegramSession>();
  const store: SessionStore = {
    async get(chatId) {
      return map.get(chatId) ?? null;
    },
    async upsert(session) {
      map.set(session.chat_id, session);
    },
  };
  return { store, map };
}

function createFakeTelegram() {
  let msgId = 5000;
  const sent: SentMessage[] = [];
  const telegram: TelegramClient = {
    async sendMessage(chatId, text, buttons) {
      sent.push({ chatId, text, buttons });
      msgId += 1;
      return msgId;
    },
    async answerCallbackQuery() {},
    async editMessageReplyMarkup() {},
  };
  return { telegram, sent };
}

function sampleDayPlan(): DayPlan {
  return {
    meals: [
      {
        type: "breakfast" as const,
        title: "Овсянка",
        recipe_id: "11111111-1111-1111-1111-111111111111",
        cooking_time_minutes: 15,
      },
      { type: "lunch" as const, title: "Суп", recipe_id: "22222222-2222-2222-2222-222222222222" },
      { type: "dinner" as const, title: "Котлеты", recipe_id: "33333333-3333-3333-3333-333333333333" },
      { type: "snack" as const, title: "Творог", recipe_id: "44444444-4444-4444-4444-444444444444" },
    ],
    meta: { fallback_source: "db" as const, duration_ms: 50 },
  };
}

function createDeps() {
  const { store, map } = createFakeStore();
  const { telegram, sent } = createFakeTelegram();
  let previewCalls = 0;
  const deps = {
    store,
    telegram,
    appBaseUrl: "https://momrecipes.online",
    previewProvider: async () => {
      previewCalls += 1;
      return sampleDayPlan();
    },
    activeCallbackQueryId: null as string | null,
  };
  return { deps, map, sent, getPreviewCalls: () => previewCalls };
}

Deno.test("/start sends age chip keyboard and new welcome copy", async () => {
  const { deps, map, sent } = createDeps();
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);
  assertEquals(map.get(1)?.step, "await_age");
  assertEquals(sent.length, 1);
  assertEquals(sent[0].text.includes("Привет 👋"), true);
  assertEquals(sent[0].text.includes("за 10 секунд"), true);
  assertEquals(sent[0].text.includes("Сколько лет ребёнку?"), true);
  assertEquals(sent[0].text.includes("Начать сначала"), false);
  const kb = sent[0].buttons ?? [];
  assertEquals(kb.some((row) => row.some((b) => b.callback_data === "age:0")), true);
});

Deno.test("age chip advances to allergies", async () => {
  const { deps, map, sent } = createDeps();
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);
  deps.activeCallbackQueryId = "cb1";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "age:1", callback_query_id: "cb1", message_id: 999 },
    deps,
  );
  assertEquals(map.get(1)?.step, "await_allergies");
  assertEquals(map.get(1)?.age_months, 18);
});

Deno.test("«Нет» на аллергиях сразу переводит к лайкам", async () => {
  const { deps, map, sent } = createDeps();
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);
  deps.activeCallbackQueryId = "a";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "age:0", callback_query_id: "a", message_id: 1 },
    deps,
  );
  map.get(1)!.allergies = ["яйца"];
  deps.activeCallbackQueryId = "b";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "al_none", callback_query_id: "b", message_id: 2 },
    deps,
  );
  assertEquals(map.get(1)?.step, "await_likes");
  assertEquals(map.get(1)?.allergies.length, 0);
  const last = sent[sent.length - 1];
  assertEquals(last.text.includes("удовольствием"), true);
});

Deno.test("final message: four meals + value blocks + single «Открыть приложение» with analytics params", async () => {
  const { deps, map, sent } = createDeps();
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);
  deps.activeCallbackQueryId = "a";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "age:0", callback_query_id: "a", message_id: 1 },
    deps,
  );
  deps.activeCallbackQueryId = "b";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "b", message_id: 2 },
    deps,
  );
  deps.activeCallbackQueryId = "c";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "c", message_id: 3 },
    deps,
  );
  deps.activeCallbackQueryId = "d";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "d", message_id: 4 },
    deps,
  );

  const last = sent[sent.length - 1];
  assertEquals(last.text.includes("http"), false);
  assertEquals(last.text.includes("неделю"), false);
  assertEquals(last.text.includes("⚡ Я подобрал это за несколько секунд"), true);
  assertEquals(last.text.includes("есть в приложении"), true);
  assertEquals(last.text.includes("🍳 Завтрак:"), true);
  assertEquals(last.text.includes("🍲 Обед:"), true);
  assertEquals(last.text.includes("🍝 Ужин:"), true);
  assertEquals(last.text.includes("🍎 Перекус:"), true);

  const flat = (last.buttons ?? []).flat();
  assertEquals(flat.length, 1);
  const open = flat[0]!;
  assertEquals(open.text, "Открыть приложение");
  if (!open.url) throw new Error("missing app url");
  const u = new URL(open.url);
  assertEquals(u.pathname, "/tg-start");
  assertEquals(u.searchParams.get("mode"), "signup");
  assertEquals(u.searchParams.get("entry_point"), "telegram");
  assertEquals(u.searchParams.get("utm_source"), "telegram");
  assertEquals(u.searchParams.get("utm_medium"), "onboarding_bot");
  assertEquals(u.searchParams.get("utm_content"), "menu_day_final");
});

async function advanceThroughSurvey(deps: OrchestratorDeps) {
  deps.activeCallbackQueryId = "a";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "age:0", callback_query_id: "a", message_id: 1 },
    deps,
  );
  deps.activeCallbackQueryId = "b";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "b", message_id: 2 },
    deps,
  );
  deps.activeCallbackQueryId = "c";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "c", message_id: 3 },
    deps,
  );
  deps.activeCallbackQueryId = "d";
  await handleInboundEvent(
    { kind: "callback", chat_id: 1, user_id: 2, data: "nx", callback_query_id: "d", message_id: 4 },
    deps,
  );
}

Deno.test("второе прохождение: без повторного превью, короткий текст и один вызов previewProvider суммарно", async () => {
  const { deps, map, sent, getPreviewCalls } = createDeps();
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);

  await advanceThroughSurvey(deps);
  assertEquals(getPreviewCalls(), 1);
  assertEquals(map.get(1)?.menu_example_delivered, true);

  const fullMsg = sent[sent.length - 1];
  assertEquals(fullMsg.text.includes("🍳 Завтрак:"), true);
  assertEquals(fullMsg.text.includes("Я уже показал"), false);

  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);

  assertEquals(getPreviewCalls(), 1);
  const repeat = sent[sent.length - 1];
  assertEquals(repeat.text.includes("Я уже показал тебе пример меню"), true);
  assertEquals(repeat.text.includes("🍳 Завтрак:"), false);
  assertEquals(repeat.text.includes("Привет 👋"), false);
  assertEquals((repeat.buttons ?? []).flat()[0]?.text, "Открыть приложение");
});

Deno.test("/start при меню уже показан: сразу повторный CTA без опроса", async () => {
  const { deps, map, sent, getPreviewCalls } = createDeps();
  const done: TelegramSession = {
    chat_id: 1,
    telegram_user_id: 2,
    step: "done",
    status: "completed",
    age_months: 18,
    allergies: ["яйца"],
    likes: ["фрукты"],
    dislikes: [],
    utm: { utm_source: "telegram" },
    prompt_message_id: null,
    menu_example_delivered: true,
  };
  map.set(1, done);

  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);

  assertEquals(getPreviewCalls(), 0);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].text.includes("Я уже показал"), true);
  assertEquals(sent[0].text.includes("Сколько лет"), false);
});
