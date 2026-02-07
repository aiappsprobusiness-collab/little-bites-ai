import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/** Единая логика доступа: true если подписка активна (premium/trial) и не истекла. */
export function hasPremiumAccessFromSubscription(subscription: {
  status: string;
  expiresAt?: string | null;
}): boolean {
  const { status, expiresAt } = subscription;
  if (status !== "premium" && status !== "trial") return false;
  if (expiresAt && new Date(expiresAt) <= new Date()) return false;
  return true;
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
  const expiresAt = profileV2?.premium_until ?? null;
  const isExpired =
    (status === "premium" || status === "trial") && expiresAt
      ? new Date(expiresAt) <= new Date()
      : false;
  /** Эффективный статус: истёкший = free для UI и гвардов */
  const effectiveStatus = isExpired ? "free" : status;

  const hasPremiumAccess =
    hasPremiumAccessFromSubscription({ status, expiresAt }) || hasUnlimitedAccess;
  const isPremium = status === "premium" && !isExpired;
  const isTrial = status === "trial" && !isExpired;

  const usedToday = profileV2?.requests_today ?? 0;
  const dailyLimit = profileV2?.daily_limit ?? 5;
  const remaining = Math.max(0, dailyLimit - usedToday);
  const canGenerate = hasUnlimitedAccess
    ? true
    : hasPremiumAccess
      ? true
      : remaining > 0;

  /** Trial: дни до окончания. null если не Trial или истёк. */
  const trialDaysRemaining =
    status === "trial" && profileV2?.premium_until && !isExpired
      ? Math.max(
          0,
          Math.ceil(
            (new Date(profileV2.premium_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        )
      : null;

  /** Free: 10 избранных, Trial/Premium: без лимита (50 в БД). */
  const favoritesLimit = effectiveStatus === "free" ? 10 : 50;

  if (typeof window !== "undefined" && import.meta.env?.DEV && user && !isLoadingProfile) {
    console.log("[useSubscription] статус и доступы", {
      status,
      expiresAt: expiresAt ?? undefined,
      isExpired,
      hasPremiumAccess,
      isPremium,
      isTrial,
    });
  }

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

  /** Активировать trial по кнопке «Попробовать Premium бесплатно» (3 дня) */
  const startTrial = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase.rpc("start_trial");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    },
  });

  /** Отменить подписку (доступ до expires_at сохраняется) */
  const cancelSubscription = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase.rpc("cancel_my_subscription");
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
    status,
    expiresAt,
    isExpired,
    isPremium,
    hasPremiumAccess,
    isTrial,
    subscriptionStatus: effectiveStatus,
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
    cancelSubscription: cancelSubscription.mutateAsync,
    isCancellingSubscription: cancelSubscription.isPending,
    startTrial: startTrial.mutateAsync,
    isStartingTrial: startTrial.isPending,
  };
}
