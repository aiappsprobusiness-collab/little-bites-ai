import type { TelegramButton, TelegramClient } from "./types.ts";

function buildInlineKeyboard(buttons?: TelegramButton[][]): { inline_keyboard: Array<Array<Record<string, string>>> } | undefined {
  if (!buttons || buttons.length === 0) return undefined;
  const keyboard = buttons
    .map((row) =>
      row
        .map((b) => {
          if (b.url) return { text: b.text, url: b.url };
          if (b.callback_data) return { text: b.text, callback_data: b.callback_data };
          return null;
        })
        .filter((v): v is Record<string, string> => !!v),
    )
    .filter((row) => row.length > 0);
  if (keyboard.length === 0) return undefined;
  return { inline_keyboard: keyboard };
}

async function callTelegram(
  apiBase: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ message_id?: number }> {
  const res = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  };
  if (!res.ok || j.ok !== true) {
    const text = JSON.stringify(j).slice(0, 400);
    throw new Error(`telegram_api_error_${method}_${res.status}:${text}`);
  }
  return j.result ?? {};
}

export function createTelegramClient(token: string): TelegramClient {
  const apiBase = `https://api.telegram.org/bot${token}`;

  return {
    async sendMessage(chatId, text, buttons) {
      const replyMarkup = buildInlineKeyboard(buttons);
      const result = await callTelegram(apiBase, "sendMessage", {
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return typeof result.message_id === "number" ? result.message_id : null;
    },
    async answerCallbackQuery(callbackQueryId, text) {
      await callTelegram(apiBase, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text, show_alert: false } : {}),
      });
    },
    async editMessageReplyMarkup(chatId, messageId, buttons) {
      const replyMarkup = buildInlineKeyboard(buttons);
      await callTelegram(apiBase, "editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },
  };
}
