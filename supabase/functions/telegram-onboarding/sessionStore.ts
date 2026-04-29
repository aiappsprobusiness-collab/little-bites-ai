import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { SessionStore } from "./orchestrate.ts";
import type { TelegramSession } from "./types.ts";

type SessionRow = {
  chat_id: number;
  telegram_user_id: number | null;
  step: TelegramSession["step"];
  status: TelegramSession["status"];
  age_months: number | null;
  allergies: string[] | null;
  likes: string[] | null;
  dislikes: string[] | null;
  utm: Record<string, string> | null;
  prompt_message_id: number | null;
  menu_example_delivered: boolean | null;
};

function rowToSession(row: SessionRow): TelegramSession {
  return {
    chat_id: row.chat_id,
    telegram_user_id: row.telegram_user_id,
    step: row.step,
    status: row.status,
    age_months: row.age_months,
    allergies: row.allergies ?? [],
    likes: row.likes ?? [],
    dislikes: row.dislikes ?? [],
    utm: row.utm ?? {},
    prompt_message_id: row.prompt_message_id ?? null,
    menu_example_delivered: row.menu_example_delivered === true,
  };
}

export function createSessionStore(supabase: SupabaseClient): SessionStore {
  return {
    async get(chatId) {
      const { data, error } = await supabase
        .from("telegram_onboarding_sessions")
        .select(
          "chat_id, telegram_user_id, step, status, age_months, allergies, likes, dislikes, utm, prompt_message_id, menu_example_delivered",
        )
        .eq("chat_id", chatId)
        .maybeSingle();
      if (error) throw new Error(`session_get_failed:${error.message}`);
      if (!data) return null;
      return rowToSession(data as SessionRow);
    },
    async upsert(session) {
      const { error } = await supabase.from("telegram_onboarding_sessions").upsert(
        {
          chat_id: session.chat_id,
          telegram_user_id: session.telegram_user_id,
          step: session.step,
          status: session.status,
          age_months: session.age_months,
          allergies: session.allergies,
          likes: session.likes,
          dislikes: session.dislikes,
          utm: session.utm,
          prompt_message_id: session.prompt_message_id,
          menu_example_delivered: session.menu_example_delivered,
          updated_at: new Date().toISOString(),
          last_event_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" },
      );
      if (error) throw new Error(`session_upsert_failed:${error.message}`);
    },
  };
}
