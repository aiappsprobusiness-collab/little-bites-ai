import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface UsageData {
  can_generate: boolean;
  remaining: number;
  is_premium: boolean;
  used_today: number;
  daily_limit?: number;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profileV2, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["profile-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles_v2")
        .select("status, requests_today, daily_limit")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as { status: string; requests_today: number; daily_limit: number } | null;
    },
    enabled: !!user,
  });

  const UNLIMITED_ACCESS_EMAILS = ["alesah007@gmail.com"];
  const hasUnlimitedAccess = user?.email && UNLIMITED_ACCESS_EMAILS.includes(user.email);

  const status = profileV2?.status ?? "free";
  /** Trial and premium both get family mode, multiple profiles, preferences/difficulty. */
  const hasPremiumAccess = status === "premium" || status === "trial" || hasUnlimitedAccess;
  const isPremium = hasPremiumAccess;
  const isTrial = status === "trial";
  const usedToday = profileV2?.requests_today ?? 0;
  const dailyLimit = profileV2?.daily_limit ?? 5;
  const remaining = Math.max(0, dailyLimit - usedToday);
  const canGenerate = hasUnlimitedAccess ? true : (status === "premium" || status === "trial" ? true : remaining > 0);

  const refetchUsage = () => {
    queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
  };

  const incrementUsage = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      if (hasUnlimitedAccess) return;
      const { error } = await supabase.rpc("increment_usage", { target_user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    },
  });

  const updateSubscriptionStatus = useMutation({
    mutationFn: async (newStatus: "free" | "premium" | "trial") => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("profiles_v2")
        .update({ status: newStatus })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    },
  });

  return {
    isPremium,
    hasPremiumAccess,
    isTrial,
    subscriptionStatus: status,
    canGenerate,
    remaining,
    usedToday,
    dailyLimit,
    isLoading: isLoadingProfile,
    incrementUsage: incrementUsage.mutateAsync,
    updateSubscriptionStatus: updateSubscriptionStatus.mutateAsync,
    refetchUsage,
  };
}
