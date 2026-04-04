import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Источник правды: profiles_v2.last_active_member_id (см. docs/architecture/domain-map.md).
 */
export async function getLastActiveMemberId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles_v2")
    .select("last_active_member_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { last_active_member_id: string | null } | null;
  return row?.last_active_member_id ?? null;
}

export async function setLastActiveMemberProfile(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("profiles_v2")
    .update({ last_active_member_id: memberId })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Строка member для last_active, если id валиден и принадлежит пользователю. */
export async function getLastActiveMember(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; name: string } | null> {
  const mid = await getLastActiveMemberId(supabase, userId);
  if (!mid) return null;
  const { data, error } = await supabase
    .from("members")
    .select("id, name")
    .eq("id", mid)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
