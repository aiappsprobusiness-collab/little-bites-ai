import { buildAuthSignupUrl } from "./cta.ts";
import { parseAgeMonths, splitCsvTags } from "./validate.ts";
import type { InboundEvent, TelegramClient, TelegramSession } from "./types.ts";
import type { DayPlan } from "../vk-preview-plan/types.ts";

export type SessionStore = {
  get(chatId: number): Promise<TelegramSession | null>;
  upsert(session: TelegramSession): Promise<void>;
};

export type OrchestratorDeps = {
  store: SessionStore;
  telegram: TelegramClient;
  appBaseUrl: string;
  previewProvider: (session: TelegramSession) => Promise<DayPlan>;
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
  };
}

function welcomeText(): string {
  return [
    "Привет! Я помогу подобрать меню на день для ребёнка.",
    "Перед этим задам 4 коротких вопроса.",
    "Сколько месяцев ребёнку? (например: 18)",
  ].join("\n");
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

function buildPreviewText(plan: DayPlan): string {
  const lines = ["Готово! Вот пример меню на день под ваши ответы:"];
  for (const meal of plan.meals.slice(0, 4)) {
    const kcal = typeof meal.calories === "number" ? ` (~${meal.calories} ккал)` : "";
    lines.push(`• ${meal.title}${kcal}`);
  }
  lines.push("");
  lines.push("Это только превью. В приложении получите полный план, замены блюд и список покупок.");
  return lines.join("\n");
}

export async function handleInboundEvent(event: InboundEvent, deps: OrchestratorDeps): Promise<void> {
  const existing = await deps.store.get(event.chat_id);
  const session = existing ?? emptySession(event.chat_id, event.user_id ?? null);

  if (event.kind === "callback" && event.data === "restart") {
    const next = emptySession(event.chat_id, event.user_id);
    next.step = "await_age";
    await deps.store.upsert(next);
    await deps.telegram.sendMessage(event.chat_id, welcomeText());
    return;
  }

  if (event.kind !== "message") return;
  const text = event.text;
  const lower = text.toLowerCase();

  if (lower === "/start" || lower.startsWith("/start ")) {
    session.step = "await_age";
    session.status = "active";
    session.utm = parseStartUtm(text);
    await deps.store.upsert(session);
    await deps.telegram.sendMessage(event.chat_id, welcomeText());
    return;
  }

  if (session.step === "idle") {
    await deps.telegram.sendMessage(event.chat_id, "Напишите /start, и я начну опрос.");
    return;
  }

  if (session.step === "await_age") {
    const ageMonths = parseAgeMonths(text);
    if (!ageMonths) {
      await deps.telegram.sendMessage(event.chat_id, "Не понял возраст. Введите число месяцев от 6 до 216.");
      return;
    }
    session.age_months = ageMonths;
    session.step = "await_allergies";
    await deps.store.upsert(session);
    await deps.telegram.sendMessage(
      event.chat_id,
      "Есть аллергии? Перечислите через запятую. Если нет — напишите: нет",
    );
    return;
  }

  if (session.step === "await_allergies") {
    session.allergies = lower === "нет" ? [] : splitCsvTags(text, 20);
    session.step = "await_likes";
    await deps.store.upsert(session);
    await deps.telegram.sendMessage(
      event.chat_id,
      "Что ребёнок любит есть? Напишите через запятую (например: гречка, брокколи).",
    );
    return;
  }

  if (session.step === "await_likes") {
    session.likes = lower === "нет" ? [] : splitCsvTags(text, 20);
    session.step = "await_dislikes";
    await deps.store.upsert(session);
    await deps.telegram.sendMessage(
      event.chat_id,
      "Что не ест или не любит? Напишите через запятую. Если ограничений нет — напишите: нет.",
    );
    return;
  }

  if (session.step === "await_dislikes") {
    session.dislikes = lower === "нет" ? [] : splitCsvTags(text, 20);
    const plan = await deps.previewProvider(session).catch(() => null);
    session.step = "done";
    session.status = "completed";
    await deps.store.upsert(session);
    if (plan) {
      await deps.telegram.sendMessage(event.chat_id, buildPreviewText(plan));
    } else {
      await deps.telegram.sendMessage(
        event.chat_id,
        "Собрал ответы, но сейчас не удалось построить превью. Всё равно можно продолжить в приложении.",
      );
    }
    const ctaUrl = buildAuthSignupUrl({ appBaseUrl: deps.appBaseUrl, utm: session.utm });
    await deps.telegram.sendMessage(
      event.chat_id,
      "Отлично! Я собрал данные. Нажмите кнопку ниже, чтобы зарегистрироваться и получить полный план в приложении.",
      [[{ text: "Получить полный план", url: ctaUrl }], [{ text: "Пройти заново", callback_data: "restart" }]],
    );
    return;
  }

  await deps.telegram.sendMessage(event.chat_id, "Напишите /start, чтобы начать заново.");
}
