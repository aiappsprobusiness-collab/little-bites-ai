/// <reference types="vite/client" />

interface Window {
  _tmr?: Array<Record<string, unknown>>;
}

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** `true` — маршруты /admin/* (док, не секрет) */
  readonly VITE_ADMIN_MODE?: string;
  /** Username бота в Telegram без @ — для `/admin/telegram-blogger-links` */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
