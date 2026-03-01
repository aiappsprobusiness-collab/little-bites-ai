/**
 * Определение member_id для хранения в режиме «Семья» по данным из БД (всегда с id).
 * Используется в deepseek-chat, когда allMembers могут прийти с фронта без id.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { pickFamilyStorageMemberId } from "./familyStorageMember.ts";

/**
 * Возвращает member_id для записи рецептов/событий в режиме «Семья».
 * Берёт строки из таблицы members по user_id (в БД всегда есть id), выбирает старшего >= 12 мес.
 */
export async function resolveFamilyStorageMemberId(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { supabase, userId } = params;
  const { data: rows, error } = await supabase
    .from("members")
    .select("id, age_months")
    .eq("user_id", userId);

  if (error || !rows || !Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const withAge = rows as Array<{ id?: string; age_months?: number | null }>;
  const picked = pickFamilyStorageMemberId(withAge);
  if (picked) return picked;
  const first = withAge[0];
  return first?.id ?? null;
}
