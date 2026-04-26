import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleInboundEvent, type SessionStore } from "./orchestrate.ts";
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
  const sent: SentMessage[] = [];
  const telegram: TelegramClient = {
    async sendMessage(chatId, text, buttons) {
      sent.push({ chatId, text, buttons });
    },
    async answerCallbackQuery() {},
  };
  return { telegram, sent };
}

function createDeps() {
  const { store, map } = createFakeStore();
  const { telegram, sent } = createFakeTelegram();
  const deps = {
    store,
    telegram,
    appBaseUrl: "https://momrecipes.online",
    previewProvider: async () => ({
      meals: [
        { type: "breakfast" as const, title: "Овсянка", calories: 180 },
        { type: "lunch" as const, title: "Суп овощной", calories: 210 },
      ],
      meta: { fallback_source: "db" as const, duration_ms: 50 },
    }),
  };
  return { deps, map, sent };
}

Deno.test("start command moves flow to await_age", async () => {
  const { deps, map, sent } = createDeps();
  await handleInboundEvent(
    { kind: "message", chat_id: 1, user_id: 2, text: "/start" },
    deps,
  );
  assertEquals(map.get(1)?.step, "await_age");
  assertEquals(sent.length, 1);
});

Deno.test("full questionnaire reaches done step and sends CTA", async () => {
  const { deps, map, sent } = createDeps();

  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "/start" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "24" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "яйца, орехи" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "гречка" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 1, user_id: 2, text: "рыба" }, deps);

  const session = map.get(1);
  assertEquals(session?.step, "done");
  assertEquals(session?.age_months, 24);
  const last = sent[sent.length - 1];
  if (!last?.buttons?.[0]?.[0]?.url) throw new Error("cta url missing");
  assertEquals(last.buttons[0][0].url.includes("entry_point=telegram"), true);
  assertEquals(sent.some((m) => m.text.includes("пример меню")), true);
});

Deno.test("start command stores utm payload", async () => {
  const { deps, map } = createDeps();
  await handleInboundEvent(
    {
      kind: "message",
      chat_id: 11,
      user_id: 22,
      text: "/start utm_campaign=blogger42&utm_medium=post&blogger_id=anna",
    },
    deps,
  );
  assertEquals(map.get(11)?.utm.utm_campaign, "blogger42");
  assertEquals(map.get(11)?.utm.blogger_id, "anna");
});

Deno.test("fallback message when preview provider fails", async () => {
  const { store, map } = createFakeStore();
  const { telegram, sent } = createFakeTelegram();
  const deps = {
    store,
    telegram,
    appBaseUrl: "https://momrecipes.online",
    previewProvider: async () => {
      throw new Error("preview_failed");
    },
  };

  await handleInboundEvent({ kind: "message", chat_id: 5, user_id: 2, text: "/start" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 5, user_id: 2, text: "24" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 5, user_id: 2, text: "нет" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 5, user_id: 2, text: "нет" }, deps);
  await handleInboundEvent({ kind: "message", chat_id: 5, user_id: 2, text: "нет" }, deps);

  assertEquals(map.get(5)?.step, "done");
  assertEquals(sent.some((m) => m.text.includes("не удалось построить превью")), true);
});
