import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TelegramBloggerRow = Database["public"]["Tables"]["telegram_bloggers"]["Row"];
export type TelegramBloggerInsert = Database["public"]["Tables"]["telegram_bloggers"]["Insert"];

export async function getTelegramBloggers(): Promise<TelegramBloggerRow[]> {
  const { data, error } = await supabase
    .from("telegram_bloggers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTelegramBlogger(input: {
  code: string;
  displayName: string;
  channelUrl?: string;
  notes?: string;
}): Promise<TelegramBloggerRow> {
  const code = input.code.trim().toLowerCase();
  const { data, error } = await supabase
    .from("telegram_bloggers")
    .insert({
      code,
      display_name: input.displayName.trim(),
      channel_url: input.channelUrl?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setTelegramBloggerActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("telegram_bloggers").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function deleteTelegramBlogger(id: string): Promise<void> {
  const { error } = await supabase.from("telegram_bloggers").delete().eq("id", id);
  if (error) throw error;
}
