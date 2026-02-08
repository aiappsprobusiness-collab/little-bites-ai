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
        .select("status, requests_today, daily_limit, premium_until, trial_until, trial_used")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        status: string;
        requests_today: number;
        daily_limit: number;
        premium_until: string | null;
        trial_until: string | null;
        trial_used: boolean | null;
      } | null;
    },
    enabled: !!user,
  });

  const UNLIMITED_ACCESS_EMAILS = ["alesah007@gmail.com"];
  const hasUnlimitedAccess = user?.email && UNLIMITED_ACCESS_EMAILS.includes(user.email);

  const status = profileV2?.status ?? "free";
  const expiresAt = profileV2?.premium_until ?? null;
  const trialUntil = profileV2?.trial_until ?? null;
  const trialUsed = profileV2?.trial_used ?? false;

  /** Trial: источник истины — trial_until. Доступ пока trial_until > now(). */
  const hasTrialAccess =
    trialUntil != null && trialUntil !== "" && new Date(trialUntil) > new Date();
  const trialRemainingMs = hasTrialAccess
    ? new Date(trialUntil!).getTime() - Date.now()
    : 0;
  /** ceil для UX (1.5 дня → 2); min 1 день при любом положительном остатке. */
  const trialRemainingDays = hasTrialAccess
    ? Math.max(1, Math.ceil(trialRemainingMs / 86_400_000))
    : null;

  /** Только платная подписка: premium_until > now(). Trial сюда не входит. */
  const hasPremiumAccess =
    hasUnlimitedAccess ||
    (expiresAt != null && expiresAt !== "" && new Date(expiresAt) > new Date());
  /** Доступ (trial или premium) — для гейтов и лимитов. */
  const hasAccess = hasTrialAccess || hasPremiumAccess;

  const isExpired =
    status === "premium" && expiresAt ? new Date(expiresAt) <= new Date() : false;
  /** Платный premium всегда приоритетнее trial: при активной оплате UI показывает premium. */
  const effectiveStatus = hasPremiumAccess ? "premium" : hasTrialAccess ? "trial" : "free";

  const usedToday = profileV2?.requests_today ?? 0;
  const dailyLimit = profileV2?.daily_limit ?? 5;
  const remaining = Math.max(0, dailyLimit - usedToday);
  const canGenerate = hasUnlimitedAccess ? true : hasAccess ? true : remaining > 0;

  /** Дни до окончания trial (то же значение для UI). */
  const trialDaysRemaining = trialRemainingDays;

  /** Free: 10 избранных; trial/premium: без лимита (50 в БД). */
  const favoritesLimit = effectiveStatus === "free" ? 10 : 50;

  const isPremium = effectiveStatus === "premium";
  const isTrial = effectiveStatus === "trial";

  if (typeof window !== "undefined" && import.meta.env?.DEV && user && !isLoadingProfile) {
    console.log("[useSubscription] статус и доступы", {
      status,
      hasTrialAccess,
      hasPremiumAccess,
      hasAccess,
      effectiveStatus,
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

  /** Активировать trial по кнопке. RPC возвращает { result, trial_until }. */
  const startTrial = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.rpc("start_trial");
      if (error) throw error;
      const payload = data as { result?: string; trial_until?: string } | null;
      const result = payload?.result ?? "error";
      if (result === "already_used") {
        throw new Error("TRIAL_ALREADY_USED");
      }
      if (result === "already_active") {
        return;
      }
      if (result !== "activated") {
        throw new Error(payload?.error ?? "Не удалось активировать триал");
      }
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

  /** Запуск оплаты Т-Банк: создаёт платёж и редиректит на PaymentURL. SuccessURL/FailURL обязательны для Tinkoff Init. */
  const startPayment = useMutation({
    mutationFn: async (plan: "month" | "year") => {
      if (!user) throw new Error("User not authenticated");
      const base =
        (typeof window !== "undefined" && window.location.origin) ||
        (import.meta.env.VITE_APP_URL as string) ||
        "https://momrecipes.app";
      const successUrl = `${base.replace(/\/$/, "")}/payment/success`;
      const failUrl = `${base.replace(/\/$/, "")}/payment/fail`;
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: {
          userId: user.id,
          plan,
          email: user.email ?? "",
          successUrl,
          failUrl,
        },
      });
      const errBody = data as { error?: string; code?: string } | null;
      if (error) {
        throw new Error(errBody?.error || error.message);
      }
      const url = (data as { PaymentURL?: string } | null)?.PaymentURL;
      if (!url) {
        const err = data as { error?: string; details?: unknown } | null;
        throw new Error(err?.error ? `${err.error}: ${JSON.stringify(err.details ?? "")}` : "Не получена ссылка на оплату");
      }
      window.location.href = url;
    },
  });

  return {
    status,
    expiresAt,
    isExpired,
    isPremium,
    hasPremiumAccess,
    hasAccess,
    hasTrialAccess,
    trialRemainingMs,
    trialRemainingDays,
    trialUsed,
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
