import { buildAuthSignupUrl, buildRecipePageUrl, buildVkFunnelHandoffUrl } from "./cta.ts";
import { parseAgeMonths, splitCsvTags } from "./validate.ts";
import type { DayPlan, MealSlot, VkPreviewMeal } from "../vk-preview-plan/types.ts";
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
  const rows = chunkButtons(AGE_PRESETS, rowSize, (p, i) => ({
    text: p.label,
    callback_data: `age:${i}`,
  }));
  rows.push([{ text: "Заново", callback_data: "restart" }]);
  return rows;
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
  rows.push([
    { text: "Далее →", callback_data: "nx" },
    { text: "Нет ограничений", callback_data: `${prefix}:clear` },
  ]);
  rows.push([{ text: "Заново", callback_data: "restart" }]);
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

function buildPreviewText(plan: DayPlan): string {
  const lines: string[] = ["Пример меню на день (по вашим ответам):"];
  for (const meal of plan.meals.slice(0, 4)) {
    const slot = MEAL_LABEL[meal.type] ?? meal.type;
    const t =
      meal.cooking_time_minutes != null && meal.cooking_time_minutes > 0
        ? `${meal.title} · ${meal.cooking_time_minutes} мин`
        : meal.title;
    const kcal = typeof meal.calories === "number" ? ` · ~${meal.calories} ккал` : "";
    lines.push(`• ${slot}: ${t}${kcal}`);
  }
  lines.push("");
  lines.push("Полный план, замены блюд и список покупок — после регистрации в приложении.");
  return lines.join("\n");
}

function finalKeyboard(
  authUrl: string,
  vkUrl: string,
  meals: VkPreviewMeal[],
  appBase: string,
  utm: Record<string, string>,
): TelegramButton[][] {
  const rows: TelegramButton[][] = [
    [{ text: "Зарегистрироваться", url: authUrl }],
    [{ text: "Открыть превью как на сайте (/vk)", url: vkUrl }],
  ];
  for (const meal of meals.slice(0, 4)) {
    if (!meal.recipe_id) continue;
    const label = `${MEAL_LABEL[meal.type] ?? meal.type} · рецепт`;
    rows.push([{ text: label.slice(0, 60), url: buildRecipePageUrl(appBase, meal.recipe_id, utm) }]);
  }
  rows.push([{ text: "Пройти заново", callback_data: "restart" }]);
  return rows;
}

function buildFinalMessage(authUrl: string, vkUrl: string, plan: DayPlan | null): string {
  const preview = plan ? buildPreviewText(plan) : "Превью сейчас недоступно, но вы можете продолжить на сайте.";
  return [
    preview,
    "",
    "— Регистрация —",
    authUrl,
    "",
    "— Карточки как в рекламе VK (полный UI) —",
    vkUrl,
  ].join("\n");
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
    session = emptySession(event.chat_id, event.user_id ?? null);
    session.step = "await_age";
    session.status = "active";
    session.utm = parseStartUtm(text);
    await deps.store.upsert(session);
    await sendPrompt(
      deps,
      session,
      [
        "Привет! Подберём меню на день для ребёнка.",
        "",
        "Какого возраста ребёнок? Выберите вариант ниже (как на сайте).",
      ].join("\n"),
      ageKeyboard(),
    );
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
    await sendPrompt(
      deps,
      session,
      ["Есть аллергии? Нажмите на пункты (можно несколько), затем «Далее →». Или напишите: нет"].join("\n"),
      multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"),
    );
    return;
  }

  if (session.step === "await_allergies") {
    if (lower === "нет") session.allergies = [];
    else session.allergies = splitCsvTags(text, 20);
    session.step = "await_likes";
    session.prompt_message_id = null;
    await deps.store.upsert(session);
    await sendPrompt(
      deps,
      session,
      "Что ребёнок любит? Выберите несколько вариантов, затем «Далее →».",
      multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"),
    );
    return;
  }

  if (session.step === "await_likes") {
    if (lower === "нет") session.likes = [];
    else session.likes = splitCsvTags(text, 20);
    session.step = "await_dislikes";
    session.prompt_message_id = null;
    await deps.store.upsert(session);
    await sendPrompt(
      deps,
      session,
      "Что не ест или не любит? Выберите варианты, затем «Далее →». Или напишите: нет",
      multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"),
    );
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
  const plan = await deps.previewProvider(session).catch(() => null);
  session.step = "done";
  session.status = "completed";
  session.prompt_message_id = null;
  await deps.store.upsert(session);

  const authUrl = buildAuthSignupUrl({ appBaseUrl: deps.appBaseUrl, utm: session.utm });
  const vkUrl = buildVkFunnelHandoffUrl(deps.appBaseUrl, session.utm);
  const body = buildFinalMessage(authUrl, vkUrl, plan);
  const kb = finalKeyboard(authUrl, vkUrl, plan?.meals ?? [], deps.appBaseUrl, session.utm);

  await deps.telegram.sendMessage(session.chat_id, body, kb);
}

async function handleCallback(
  event: InboundEvent & { kind: "callback" },
  deps: OrchestratorDeps,
  initialSession: TelegramSession,
): Promise<void> {
  let session = initialSession;
  const data = event.data;

  if (data === "restart") {
    session = emptySession(event.chat_id, event.user_id);
    session.step = "await_age";
    session.status = "active";
    await deps.store.upsert(session);
    await sendPrompt(
      deps,
      session,
      ["Начинаем заново.", "", "Какого возраста ребёнок? Выберите вариант ниже."].join("\n"),
      ageKeyboard(),
    );
    await ack(deps);
    return;
  }

  if (session.step === "await_age") {
    const m = /^age:(\d+)$/.exec(data);
    if (m) {
      const idx = Number.parseInt(m[1], 10);
      if (idx >= 0 && idx < AGE_PRESETS.length) {
        session.age_months = AGE_PRESETS[idx].months;
        session.step = "await_allergies";
        session.prompt_message_id = null;
        await deps.store.upsert(session);
        await sendPrompt(
          deps,
          session,
          ["Есть аллергии? Нажмите на пункты (несколько можно), затем «Далее →»."].join("\n"),
          multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"),
        );
        await ack(deps, `Возраст: ${AGE_PRESETS[idx].label}`);
        return;
      }
    }
    await ack(deps);
    return;
  }

  const toggleIdx = (prefix: "al" | "li" | "di", options: string[], list: string[], raw: string): string[] | null => {
    if (raw === `${prefix}:clear`) return [];
    const mm = new RegExp(`^${prefix}:(\\d+)$`).exec(raw);
    if (!mm) return null;
    const i = Number.parseInt(mm[1], 10);
    if (i < 0 || i >= options.length) return null;
    return toggleInList(list, options[i]!, 20);
  };

  if (session.step === "await_allergies") {
    if (data === "nx") {
      session.step = "await_likes";
      session.prompt_message_id = null;
      await deps.store.upsert(session);
      await sendPrompt(
        deps,
        session,
        "Что ребёнок любит? Выберите несколько вариантов, затем «Далее →».",
        multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"),
      );
      await ack(deps);
      return;
    }
    const next = toggleIdx("al", ALLERGY_OPTIONS, session.allergies, data);
    if (next) {
      session.allergies = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(ALLERGY_OPTIONS, session.allergies, "al"));
      await ack(deps);
      return;
    }
    await ack(deps);
    return;
  }

  if (session.step === "await_likes") {
    if (data === "nx") {
      session.step = "await_dislikes";
      session.prompt_message_id = null;
      await deps.store.upsert(session);
      await sendPrompt(
        deps,
        session,
        "Что не ест или не любит? Выберите варианты, затем «Далее →».",
        multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"),
      );
      await ack(deps);
      return;
    }
    const next = toggleIdx("li", LIKE_OPTIONS, session.likes, data);
    if (next) {
      session.likes = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(LIKE_OPTIONS, session.likes, "li"));
      await ack(deps);
      return;
    }
    await ack(deps);
    return;
  }

  if (session.step === "await_dislikes") {
    if (data === "nx") {
      await finishFlow(deps, session);
      await ack(deps);
      return;
    }
    const next = toggleIdx("di", DISLIKE_OPTIONS, session.dislikes, data);
    if (next) {
      session.dislikes = next;
      await deps.store.upsert(session);
      await refreshChipKeyboard(deps, session, multiChipKeyboard(DISLIKE_OPTIONS, session.dislikes, "di"));
      await ack(deps);
      return;
    }
    await ack(deps);
    return;
  }

  await ack(deps);
}
