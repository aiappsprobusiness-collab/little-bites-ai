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

export function createTelegramClient(token: string): TelegramClient {
  const apiBase = `https://api.telegram.org/bot${token}`;

  async function callTelegram(method: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`telegram_api_error_${method}_${res.status}:${text.slice(0, 200)}`);
    }
  }

  return {
    async sendMessage(chatId, text, buttons) {
      const replyMarkup = buildInlineKeyboard(buttons);
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },
    async answerCallbackQuery(callbackQueryId, text) {
      await callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      });
    },
  };
}
