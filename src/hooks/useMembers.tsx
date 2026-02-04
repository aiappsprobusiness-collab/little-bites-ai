import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { MembersRow, MembersInsert, MembersUpdate, MemberTypeV2 } from "@/integrations/supabase/types-v2";
import { ensureStringArray } from "@/utils/typeUtils";

function normalizeMemberPayload<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload };
  const arrayKeys = ["allergies"] as const;
  for (const key of arrayKeys) {
    if (key in out && out[key] !== undefined) {
      (out as Record<string, unknown>)[key] = ensureStringArray(out[key]);
    }
  }
  if ("age_months" in out && out.age_months !== undefined) {
    const n = Number(out.age_months);
    (out as Record<string, unknown>).age_months = Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  }
  return out;
}

/** Форматировать возраст по age_months для отображения. */
export function formatAgeFromMonths(ageMonths: number | null): string {
  if (ageMonths == null || ageMonths < 0) return "";
  if (ageMonths < 12) return `${ageMonths} мес`;
  const years = Math.floor(ageMonths / 12);
  const remainingMonths = ageMonths % 12;
  if (years < 3) return `${years} г. ${remainingMonths} мес`;
  if (remainingMonths === 0) return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`;
  return `${years} г. ${remainingMonths} мес`;
}

/** Преобразовать birth_date (YYYY-MM-DD) в возраст в месяцах. */
export function birthDateToAgeMonths(birthDate: string): number {
  const s = (birthDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0;
  const birth = new Date(s);
  const now = new Date();
  if (isNaN(birth.getTime())) return 0;
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) {
    months += 12;
    years--;
  }
  return years * 12 + months;
}

export type Member = MembersRow;

export function useMembers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ["members", user?.id],
    queryFn: async (): Promise<MembersRow[]> => {
      if (!user) return [];
      const { data, error: err } = await supabase
        .from("members")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });
      if (err) throw err;
      return (data ?? []).map((m) => ({
        ...m,
        allergies: ensureStringArray(m.allergies),
      })) as MembersRow[];
    },
    enabled: !!user,
  });

  const createMember = useMutation({
    mutationFn: async (input: Omit<MembersInsert, "user_id">) => {
      if (!user) throw new Error("User not authenticated");
      const payload = normalizeMemberPayload({
        ...input,
        user_id: user.id,
      } as Record<string, unknown>) as MembersInsert;
      const { data, error } = await supabase.from("members").insert(payload).select().single();
      if (error) {
        console.error("Supabase Error (members):", error.message, error.details);
        throw error;
      }
      return data as MembersRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", user?.id] });
    },
  });

  const updateMember = useMutation({
    mutationFn: async (payload: { id: string } & MembersUpdate) => {
      const { id, ...rest } = payload;
      if (!id) throw new Error("member id required");
      const normalized = normalizeMemberPayload(rest as Record<string, unknown>) as MembersUpdate;
      const { data, error } = await supabase
        .from("members")
        .update(normalized)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as MembersRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", user?.id] });
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", user?.id] });
    },
  });

  const formatAge = (ageMonths: number | null) => formatAgeFromMonths(ageMonths);

  return {
    members,
    isLoading,
    error,
    createMember: createMember.mutateAsync,
    updateMember: updateMember.mutateAsync,
    deleteMember: deleteMember.mutateAsync,
    formatAge,
    isCreating: createMember.isPending,
    isUpdating: updateMember.isPending,
    isDeleting: deleteMember.isPending,
  };
}
