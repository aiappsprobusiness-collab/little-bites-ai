import { buildTelegramOnboardingFinalAuthUrl } from "./cta.ts";
import { parseAgeMonths, splitCsvTags } from "./validate.ts";
import type { DayPlan, MealSlot } from "../vk-preview-plan/types.ts";
import type { InboundEvent, TelegramButton, TelegramClient, TelegramSession } from "./types.ts";

export type SessionStore = {
  get(chatId: number): Promise<TelegramSession | null>;
  upsert(session: TelegramSession): Promise<void>;
};

export type OrchestratorDeps = {
  store: SessionStore;
  telegram: TelegramClient;
  appBaseUrl: string;
  previewProvider: (session: TelegramSession) => Promise<DayPlan>;
  /** Ответ на callback_query (ровно один раз за update). */
  activeCallbackQueryId: string | null;
};

/** Как на `VkFunnelPage`: пресеты возраста → внутри храним `age_months`. */
const AGE_PRESETS: { label: string; months: number }[] = [
  { label: "6–11 мес", months: 9 },
  { label: "1–2 года", months: 18 },
  { label: "2–3 года", months: 30 },
  { label: "3–5 лет", months: 48 },
  { label: "6–9 лет", months: 84 },
  { label: "10–12 лет", months: 132 },
  { label: "13–18 лет", months: 192 },
];

const ALLERGY_OPTIONS = ["бкм", "орехи", "арахис", "яйца", "рыба", "глютен", "лактоза", "соя", "мёд", "кунжут"];
const LIKE_OPTIONS = ["овощи", "фрукты", "мясо", "рыба", "крупы", "молочное", "супы", "запеканки", "паста"];
const DISLIKE_OPTIONS = ["овощи", "рыба", "мясо", "молочное", "крупы", "супы", "острое", "грибы", "бобовые"];

const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: "🍳",
  lunch: "🍲",
  dinner: "🍝",
  snack: "🍎",
};

/** Приветствие + вопрос про возраст (одно сообщение с клавиатурой пресетов). */
const MSG_WELCOME_AGE = [
  "Привет 👋",
  "Подберу меню для ребёнка за 10 секунд 🍽️",
  "",
  "С учётом возраста, аллергий и того, что он реально ест",
  "",
  "👇 Начнём с возраста",
  "",
  "Сколько лет ребёнку? 👶",
].join("\n");

const MSG_ALLERGY_Q = ["Есть ли аллергии или ограничения?", "Можно выбрать несколько вариантов 👇"].join("\n");
const MSG_LIKES_Q = "Что он обычно ест с удовольствием? 😊";
const MSG_DISLIKES_Q = "Что он отказывается есть? 😅";

/** Повторное прохождение: без новой генерации меню, та же кнопка «Открыть приложение». */
const MSG_REPEAT_AFTER_MENU_EXAMPLE = [
  "Я уже показал тебе пример меню 👆 Дальше я могу подбирать новые варианты, учитывать, что ребёнок не ест, и помогать в ежедневном питании 👇 продолжим в приложении",
].join("\n");

function emptySession(chatId: number, userId: number | null): TelegramSession {
  return {
    chat_id: chatId,
    telegram_user_id: userId,
    step: "idle",
    age_months: null,
    allergies: [],
    likes: [],
    dislikes: [],
    utm: {},
    status: "active",
    prompt_message_id: null,
    menu_example_delivered: false,
  };
}

function toggleInList(list: string[], v: string, max: number): string[] {
  const t = v.trim().toLowerCase();
  if (!t) return list;
  const has = list.some((x) => x.toLowerCase() === t);
  if (has) return list.filter((x) => x.toLowerCase() !== t);
  if (list.length >= max) return list;
  return [...list, t];
}

function parseStartUtm(text: string): Record<string, string> {
  const payload = text.replace(/^\/start/i, "").trim();
  if (!payload) return {};
  const out: Record<string, string> = {};
  const params = new URLSearchParams(payload);
  for (const [k, v] of params.entries()) {
    const key = k.trim().toLowerCase();
    const val = v.trim();
    if (!key || !val) continue;
    if (["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "blogger_id"].includes(key)) {
      out[key] = val.slice(0, 120);
    }
  }
  if (!out.utm_source) out.utm_source = "telegram";
  return out;
}

function chunkButtons<T>(items: T[], size: number, map: (item: T, i: number) => TelegramButton): TelegramButton[][] {
  const rows: TelegramButton[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    rows.push(slice.map((item, j) => map(item, i + j)));
  }
  return rows;
}

function ageKeyboard(): TelegramButton[][] {
  const rowSize = 4;
  return chunkButtons(AGE_PRESETS, rowSize, (p, i) => ({
    text: p.label,
    callback_data: `age:${i}`,
  }));
}

function multiChipKeyboard(
  options: string[],
  selected: string[],
  prefix: "al" | "li" | "di",
): TelegramButton[][] {
  const rows = chunkButtons(options, 4, (opt, i) => {
    const on = selected.some((x) => x.toLowerCase() === opt);
    return { text: on ? `✓ ${opt}` : opt, callback_data: `${prefix}:${i}` };
  });
  rows.push([{ text: "Далее →", callback_data: "nx" }]);
  /** Отдельная строка: надёжнее нажатие; `*_none` без двоеточия — меньше шансов обрезки/коллизий в цепочках. */
  rows.push([{ text: "Нет", callback_data: `${prefix}_none` }]);
  return rows;
}

async function ack(deps: OrchestratorDeps, text?: string): Promise<void> {
  if (deps.activeCallbackQueryId) {
    await deps.telegram.answerCallbackQuery(deps.activeCallbackQueryId, text).catch(() => {});
  }
}

async function sendPrompt(
  deps: OrchestratorDeps,
  session: TelegramSession,
  text: string,
  keyboard: TelegramButton[][],
): Promise<void> {
  const mid = await deps.telegram.sendMessage(session.chat_id, text, keyboard);
  session.prompt_message_id = mid;
  await deps.store.upsert(session);
}

async function refreshChipKeyboard(deps: OrchestratorDeps, session: TelegramSession, keyboard: TelegramButton[][]): Promise<void> {
  if (session.prompt_message_id == null) return;
  try {
    await deps.telegram.editMessageReplyMarkup(session.chat_id, session.prompt_message_id, keyboard);
  } catch {
    /* сообщение устарело — пропускаем */
  }
}

function mealTitleForSlot(plan: DayPlan | null, slot: MealSlot): string {
  const meal = plan?.meals?.find((m) => m.type === slot);
  if (!meal?.title?.trim()) return "—";
  if (meal.cooking_time_minutes != null && meal.cooking_time_minutes > 0) {
    return `${meal.title.trim()} · ${meal.cooking_time_minutes} мин`;
  }
  return meal.title.trim();
}

/** Финальное сообщение: меню + ценность + оффер; без URL в тексте. */
function buildFinalBody(plan: DayPlan | null): string {
  const mealLines = SLOT_ORDER.map(
    (slot) => `${SLOT_EMOJI[slot]} ${MEAL_LABEL[slot]}: ${mealTitleForSlot(plan, slot)}`,
  );
  return [
    "Вот меню на день по твоим ответам 👇",
    "",
    ...mealLines,
    "",
    "⚡ Я подобрал это за несколько секунд",
    "Вручную это заняло бы ~20–30 минут",
    "",
    "Хочешь не думать об этом каждый день?",
    "",
    "В приложении я могу:",
    "",
    "— подбирать новые блюда под ребёнка",
    "— учитывать, что он не ест, помогать, если он отказывается",
    "— генерировать рецепты под любой запрос",
    "— составлять меню для всей семьи",
    "",
    "👇 всё это есть в приложении",
  ].join("\n");
}

/** Одна inline-кнопка: открыть приложение (регистрация) с атрибуцией в URL. */
function finalKeyboard(authUrl: string): TelegramButton[][] {
  return [[{ text: "Открыть приложение", url: authUrl }]];
}

export async function handleInboundEvent(event: InboundEvent, deps: OrchestratorDeps): Promise<void> {
  const existing = await deps.store.get(event.chat_id);
  let session = existing ?? emptySession(event.chat_id, event.user_id ?? null);
  if (event.kind === "message" && event.user_id != null) {
    session.telegram_user_id = event.user_id;
  }

  if (event.kind === "callback") {
    await handleCallback(event, deps, session);
    return;
  }

  const text = event.text;
  const lower = text.toLowerCase();

  if (lower === "/start" || lower.startsWith("/start ")) {
    const preserveMenuExample = existing?.menu_example_delivered === true;
    session = emptySession(event.chat_id, event.user_id ?? null);
    session.menu_example_delivered = preserveMenuExample;
    session.step = "await_age";
    session.status = "active";
    session.utm = parseStartUtm(text);
    await deps.store.upsert(session);
    await sendPrompt(deps, session, MSG_WELCOME_AGE, ageKeyboard());
    return;
  }

  if (session.step === "idle") {
    await deps.telegram.sendMessage(event.chat_id, "Нажмите /start, чтобы начать.");
    return;
  }

  if (session.step === "await_age") {
    const ageMonths = parseAgeMonths(text);
    if (!ageMonths) {
      await deps.telegram.sendMessage(
        event.chat_id,
        "Не распознал возраст. Выберите кнопку ниже или введите число месяцев (6–216) или, например: 2 года",
      );
      return;
    }
    session.age_months = ageMonths;
    session.step = "await_allergies";
    session.prompt_message_id = null;
    await deps.store.upsert(session);
    await sendPrompt(deps, session, MSG_ALLERGY_Q, multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"));
    return;
  }

  if (session.step === "await_allergies") {
    if (lower === "нет") session.allergies = [];
    else session.allergies = splitCsvTags(text, 20);
    session.step = "await_likes";
    session.prompt_message_id = null;
    await deps.store.upsert(session);
    await sendPrompt(deps, session, MSG_LIKES_Q, multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"));
    return;
  }

  if (session.step === "await_likes") {
    if (lower === "нет") session.likes = [];
    else session.likes = splitCsvTags(text, 20);
    session.step = "await_dislikes";
    session.prompt_message_id = null;
    await deps.store.upsert(session);
    await sendPrompt(deps, session, MSG_DISLIKES_Q, multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"));
    return;
  }

  if (session.step === "await_dislikes") {
    if (lower === "нет") session.dislikes = [];
    else session.dislikes = splitCsvTags(text, 20);
    await finishFlow(deps, session);
    return;
  }

  await deps.telegram.sendMessage(event.chat_id, "Нажмите /start, чтобы начать заново.");
}

async function finishFlow(deps: OrchestratorDeps, session: TelegramSession): Promise<void> {
  const authUrl = buildTelegramOnboardingFinalAuthUrl({ appBaseUrl: deps.appBaseUrl, utm: session.utm });
  const kb = finalKeyboard(authUrl);

  if (session.menu_example_delivered) {
    session.step = "done";
    session.status = "completed";
    session.prompt_message_id = null;
    await deps.store.upsert(session);

    let body = MSG_REPEAT_AFTER_MENU_EXAMPLE;
    if (body.length > 4000) {
      body = `${body.slice(0, 3900)}…`;
    }
    try {
      await deps.telegram.sendMessage(session.chat_id, body, kb);
    } catch {
      await deps.telegram.sendMessage(session.chat_id, MSG_REPEAT_AFTER_MENU_EXAMPLE, kb).catch(() => {});
    }
    return;
  }

  let plan: DayPlan | null = null;
  try {
    plan = await deps.previewProvider(session);
  } catch {
    plan = null;
  }
  const menuOk = Array.isArray(plan?.meals) && plan.meals.length > 0;

  session.step = "done";
  session.status = "completed";
  session.prompt_message_id = null;
  if (menuOk) {
    session.menu_example_delivered = true;
  }
  await deps.store.upsert(session);

  let body = buildFinalBody(plan);
  if (body.length > 4000) {
    body = `${body.slice(0, 3900)}…`;
  }

  try {
    await deps.telegram.sendMessage(session.chat_id, body, kb);
  } catch {
    await deps.telegram.sendMessage(session.chat_id, buildFinalBody(plan), finalKeyboard(authUrl)).catch(() => {});
  }
}

async function handleCallback(
  event: InboundEvent & { kind: "callback" },
  deps: OrchestratorDeps,
  initialSession: TelegramSession,
): Promise<void> {
  let session = initialSession;
  const data = event.data;

  if (data === "restart" || data === "again") {
    await ack(deps);
    const preserveMenuExample = initialSession.menu_example_delivered === true;
    session = emptySession(event.chat_id, event.user_id);
    session.menu_example_delivered = preserveMenuExample;
    session.step = "await_age";
    session.status = "active";
    await deps.store.upsert(session);
    await sendPrompt(deps, session, MSG_WELCOME_AGE, ageKeyboard());
    return;
  }

  if (session.step === "await_age") {
    const m = /^age:(\d+)$/.exec(data);
    if (m) {
      const idx = Number.parseInt(m[1], 10);
      if (idx >= 0 && idx < AGE_PRESETS.length) {
        await ack(deps, `Возраст: ${AGE_PRESETS[idx].label}`);
        session.age_months = AGE_PRESETS[idx].months;
        session.step = "await_allergies";
        session.prompt_message_id = null;
        await deps.store.upsert(session);
        await sendPrompt(deps, session, MSG_ALLERGY_Q, multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"));
        return;
      }
    }
    await ack(deps);
    return;
  }

  const toggleIdx = (prefix: "al" | "li" | "di", options: string[], list: string[], raw: string): string[] | null => {
    if (raw === `${prefix}_none` || raw === `${prefix}:clear`) return [];
    const mm = new RegExp(`^${prefix}:(\\d+)$`).exec(raw);
    if (!mm) return null;
    const i = Number.parseInt(mm[1], 10);
    if (i < 0 || i >= options.length) return null;
    return toggleInList(list, options[i]!, 20);
  };

  if (session.step === "await_allergies") {
    if (data === "nx" || data === "al_none" || data === "al:clear") {
      await ack(deps);
      if (data === "al_none" || data === "al:clear") session.allergies = [];
      session.step = "await_likes";
      session.prompt_message_id = null;
      await deps.store.upsert(session);
      await sendPrompt(deps, session, MSG_LIKES_Q, multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"));
      return;
    }
    const next = toggleIdx("al", ALLERGY_OPTIONS, session.allergies, data);
    if (next) {
      await ack(deps);
      session.allergies = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"));
      return;
    }
    await ack(deps);
    return;
  }

  if (session.step === "await_likes") {
    if (data === "nx" || data === "li_none" || data === "li:clear") {
      await ack(deps);
      if (data === "li_none" || data === "li:clear") session.likes = [];
      session.step = "await_dislikes";
      session.prompt_message_id = null;
      await deps.store.upsert(session);
      await sendPrompt(deps, session, MSG_DISLIKES_Q, multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"));
      return;
    }
    const next = toggleIdx("li", LIKE_OPTIONS, session.likes, data);
    if (next) {
      await ack(deps);
      session.likes = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"));
      return;
    }
    await ack(deps);
    return;
  }

  if (session.step === "await_dislikes") {
    if (data === "nx" || data === "di_none" || data === "di:clear") {
      if (data === "di_none" || data === "di:clear") session.dislikes = [];
      await deps.store.upsert(session);
      /** Сразу закрываем «часики» на кнопке: превью может занять несколько секунд (БД + опционально DeepSeek). */
      await ack(deps, "Подбираю меню…");
      await finishFlow(deps, session);
      return;
    }
    const next = toggleIdx("di", DISLIKE_OPTIONS, session.dislikes, data);
    if (next) {
      await ack(deps);
      session.dislikes = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"));
      return;
    }
    await ack(deps);
    return;
  }

  await ack(deps);
}
