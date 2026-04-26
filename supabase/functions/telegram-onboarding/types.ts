export type TelegramChat = {
  id: number;
  type?: string;
};

export type TelegramUser = {
  id: number;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: {
    message_id: number;
    chat: TelegramChat;
  };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InboundEvent =
  | {
      kind: "message";
      chat_id: number;
      user_id: number | null;
      text: string;
    }
  | {
      kind: "callback";
      chat_id: number;
      user_id: number;
      data: string;
      callback_query_id: string;
      /** Сообщение, к которому привязана inline-клавиатура (для editMessageReplyMarkup). */
      message_id: number;
    };

export type SessionStep =
  | "idle"
  | "await_age"
  | "await_allergies"
  | "await_likes"
  | "await_dislikes"
  | "done";

export type SessionStatus = "active" | "completed" | "cancelled";

export type TelegramSession = {
  chat_id: number;
  telegram_user_id: number | null;
  step: SessionStep;
  age_months: number | null;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  utm: Record<string, string>;
  status: SessionStatus;
  /** message_id промпта с чипами (для обновления клавиатуры). */
  prompt_message_id: number | null;
};

export type TelegramButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramClient = {
  sendMessage: (chatId: number, text: string, buttons?: TelegramButton[][]) => Promise<number | null>;
  answerCallbackQuery: (callbackQueryId: string, text?: string) => Promise<void>;
  editMessageReplyMarkup: (chatId: number, messageId: number, buttons?: TelegramButton[][]) => Promise<void>;
};

export type BuildAuthCtaInput = {
  appBaseUrl: string;
  utm?: Record<string, string>;
};
