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
        .select("status, requests_today, daily_limit, premium_until")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        status: string;
        requests_today: number;
        daily_limit: number;
        premium_until: string | null;
      } | null;
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

  /** Trial: дни до окончания (из premium_until). null если не Trial. */
  const trialDaysRemaining =
    status === "trial" && profileV2?.premium_until
      ? Math.max(
          0,
          Math.ceil(
            (new Date(profileV2.premium_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        )
      : null;

  /** Free: 10 избранных, Trial/Premium: без лимита (50 в БД). */
  const favoritesLimit = status === "free" ? 10 : 50;

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

  /** Запуск оплаты Т-Банк: создаёт платёж и редиректит на PaymentURL */
  const startPayment = useMutation({
    mutationFn: async (plan: "month" | "year") => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: { userId: user.id, plan, email: user.email ?? "" },
      });
      if (error) throw error;
      const url = (data as { PaymentURL?: string } | null)?.PaymentURL;
      if (!url) throw new Error("Не получена ссылка на оплату");
      window.location.href = url;
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
    trialDaysRemaining,
    favoritesLimit,
    isLoading: isLoadingProfile,
    incrementUsage: incrementUsage.mutateAsync,
    updateSubscriptionStatus: updateSubscriptionStatus.mutateAsync,
    refetchUsage,
    startPayment: startPayment.mutateAsync,
    isStartingPayment: startPayment.isPending,
  };
}
