import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface PlateLogRow {
  id: string;
  user_id: string;
  member_id: string | null;
  user_message: string;
  assistant_message: string;
  created_at: string;
}

export function usePlateLogs(limit = 20) {
  const { user } = useAuth();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["plate_logs", user?.id, limit],
    queryFn: async (): Promise<PlateLogRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("plate_logs")
        .select("id, user_id, member_id, user_message, assistant_message, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PlateLogRow[];
    },
    enabled: !!user,
  });

  return { logs, isLoading };
}
