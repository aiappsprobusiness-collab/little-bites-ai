import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { safeLog } from "@/utils/safeLogger";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logMembersProfileLoadStart } from "@/utils/authSessionDebug";
import { getSubscriptionLimits, isAiDailyLimitExceeded } from "@/utils/subscriptionRules";
import { useAppStore } from "@/store/useAppStore";
import { hasSeenTrialActivatedModal } from "@/utils/trialActivatedModalStorage";
import { getMsUntilTrialEnd } from "@/utils/trialLifecycle";
import { TAB_NAV_STALE_MS, TAB_NAV_USAGE_STALE_MS } from "@/utils/reactQueryTabNav";
import { isThemePreference, type ThemePreference } from "@/constants/themeStorage";

type ProfileV2SubscriptionRow = {
  status: string;
  requests_today: number;
  daily_limit: number;
  premium_until: string | null;
  trial_until: string | null;
  trial_used: boolean | null;
  plan_initialized: boolean;
  last_active_member_id: string | null;
  show_input_hints: boolean | null;
  theme: string | null;
};

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
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();

  const { data: profileV2, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["profile-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      logMembersProfileLoadStart("profile", user.id);
      const { data, error } = await supabase
        .from("profiles_v2")
        .select(
          "status, requests_today, daily_limit, premium_until, trial_until, trial_used, plan_initialized, last_active_member_id, show_input_hints, theme"
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileV2SubscriptionRow | null;
    },
    enabled: authReady && !!user,
    staleTime: TAB_NAV_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: latestSubscription } = useQuery({
    queryKey: ["subscription-plan", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_my_latest_confirmed_subscription");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as { plan: string | null; expires_at: string | null } | null;
    },
    enabled: authReady && !!user,
    staleTime: TAB_NAV_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  /** Успешные генерации рецепта в чате за сутки (UTC): usage_events.feature = chat_recipe (Free и Premium/Trial). */
  const { data: chatRecipeUsedToday } = useQuery({
    queryKey: ["usage-chat-recipe-today", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc("get_usage_count_today", {
        p_user_id: user.id,
        p_feature: "chat_recipe",
      });
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },
    enabled: authReady && !!user,
    staleTime: TAB_NAV_USAGE_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  /** Использовано вопросов к Помощнику (help) сегодня. Нужно для отображения лимита на вкладке Help. */
  const { data: helpUsedToday } = useQuery({
    queryKey: ["usage-help-today", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc("get_usage_count_today", {
        p_user_id: user.id,
        p_feature: "help",
      });
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },
    enabled: authReady && !!user,
    staleTime: TAB_NAV_USAGE_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const UNLIMITED_ACCESS_EMAILS = ["alesah007@gmail.com"];
  const hasUnlimitedAccess = user?.email && UNLIMITED_ACCESS_EMAILS.includes(user.email);

  const status = profileV2?.status ?? "free";
  const expiresAt = profileV2?.premium_until ?? null;
  const subscriptionPlan = (latestSubscription?.plan === "month" || latestSubscription?.plan === "year")
    ? latestSubscription.plan
    : null;
  const subscriptionExpiresAt = latestSubscription?.expires_at ?? null;
  const trialUntil = profileV2?.trial_until ?? null;
  const trialUsed = profileV2?.trial_used ?? false;
  const planInitialized = profileV2?.plan_initialized ?? false;
  const lastActiveMemberId = profileV2?.last_active_member_id ?? null;
  /** Ротирующиеся подсказки в поле ввода чата рецептов; `null`/отсутствие колонки → true (как DEFAULT в БД). */
  const showInputHints = profileV2?.show_input_hints !== false;

  /** Тема UI: до загрузки профиля `null` (не применять из БД). */
  const themePreference: ThemePreference | null =
    !user || isLoadingProfile
      ? null
      : profileV2 == null
        ? "light"
        : profileV2.theme && isThemePreference(profileV2.theme)
          ? profileV2.theme
          : "light";

  /** Trial: источник истины — trial_until (см. `getMsUntilTrialEnd` в trialLifecycle). */
  const trialMsRemaining = getMsUntilTrialEnd(trialUntil);
  const hasTrialAccess = trialMsRemaining != null && trialMsRemaining > 0;
  const trialRemainingMs = hasTrialAccess ? trialMsRemaining! : 0;
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

  const usedTodayFromEvents = chatRecipeUsedToday ?? 0;
  const usedToday = usedTodayFromEvents;

  const dailyLimitFromDb = profileV2?.daily_limit ?? 5;
  const limits = getSubscriptionLimits(effectiveStatus);
  const aiDailyLimit = limits.aiDailyLimit;
  const effectiveDailyLimit = aiDailyLimit ?? dailyLimitFromDb;
  const remaining = aiDailyLimit === null ? null : Math.max(0, aiDailyLimit - usedToday);
  const limitExceeded =
    !hasUnlimitedAccess && isAiDailyLimitExceeded(usedToday, aiDailyLimit);
  const canGenerate = hasUnlimitedAccess ? true : !limitExceeded;
  const canSendAi = !limitExceeded;

  const helpDailyLimit = limits.helpDailyLimit;
  const helpUsed = helpUsedToday ?? 0;
  const helpRemaining = helpDailyLimit === null ? null : Math.max(0, helpDailyLimit - helpUsed);
  const helpLimitExceeded =
    !hasUnlimitedAccess && helpDailyLimit !== null && helpUsed >= helpDailyLimit;

  /** Дни до окончания trial (то же значение для UI). */
  const trialDaysRemaining = trialRemainingDays;

  /** Free: 7 избранных; trial/premium: без лимита (50 в БД). */
  const favoritesLimit = effectiveStatus === "free" ? 7 : 50;

  const isPremium = effectiveStatus === "premium";
  const isTrial = effectiveStatus === "trial";

  const refetchUsage = () => {
    queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["subscription-plan", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["usage-chat-recipe-today", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["usage-help-today", user?.id] });
  };

  /** Сразу выставить число использованных help-запросов (при LIMIT_REACHED), чтобы счётчик показал 0 без ожидания refetch. */
  const setHelpUsedToday = (used: number) => {
    if (user?.id != null && Number.isFinite(used)) {
      queryClient.setQueryData(["usage-help-today", user.id], used);
    }
  };

  const setShowInputHints = useMutation({
    mutationFn: async (value: boolean) => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("profiles_v2")
        .update({ show_input_hints: value })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    },
  });

  const setThemePreference = useMutation({
    mutationFn: async (value: ThemePreference) => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase.from("profiles_v2").update({ theme: value }).eq("user_id", user.id);
      if (error) throw error;
    },
    onMutate: async (value: ThemePreference) => {
      if (!user?.id) return;
      await queryClient.cancelQueries({ queryKey: ["profile-subscription", user.id] });
      const prev = queryClient.getQueryData<ProfileV2SubscriptionRow | null>(["profile-subscription", user.id]);
      queryClient.setQueryData(["profile-subscription", user.id], (old: ProfileV2SubscriptionRow | null | undefined) =>
        old ? { ...old, theme: value } : old
      );
      return { prev };
    },
    onError: (_err, _value, ctx) => {
      if (user?.id && ctx?.prev !== undefined) {
        queryClient.setQueryData(["profile-subscription", user.id], ctx.prev);
      }
    },
    onSettled: () => {
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["profile-subscription", user.id] });
      }
    },
  });

  const setPlanInitialized = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("profiles_v2")
        .update({ plan_initialized: true })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
    },
  });

  const incrementUsage = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      if (hasUnlimitedAccess) return;
      const { error } = await supabase.rpc("increment_usage", { target_user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plan", user?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["subscription-plan", user?.id] });
    },
  });

  /** Активировать trial по кнопке. RPC возвращает { result, trial_until }. */
  const startTrial = useMutation({
    mutationFn: async (): Promise<{ activated: boolean }> => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.rpc("start_trial");
      if (error) throw error;
      const payload = data as { result?: string; trial_until?: string } | null;
      const result = payload?.result ?? "error";
      if (result === "already_used") {
        throw new Error("TRIAL_ALREADY_USED");
      }
      if (result === "already_active") {
        return { activated: false };
      }
      if (result !== "activated") {
        throw new Error(payload?.error ?? "Не удалось активировать триал");
      }
      return { activated: true };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["profile-subscription", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plan", user?.id] });
      if (
        data?.activated &&
        user?.id &&
        !hasSeenTrialActivatedModal(user.id)
      ) {
        useAppStore.getState().setShowTrialActivatedModal(true);
      }
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
      queryClient.invalidateQueries({ queryKey: ["subscription-plan", user?.id] });
    },
  });

  /** Запуск оплаты Т-Банк: создаёт платёж и редиректит на PaymentURL. SuccessURL/FailURL обязательны для Tinkoff Init. */
  const startPayment = useMutation({
    mutationFn: async (plan: "month" | "year") => {
      if (!user) throw new Error("User not authenticated");
      const { trackUsageEvent } = await import("@/utils/usageEvents");
      trackUsageEvent("purchase_start", { properties: { plan } });
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
    subscriptionPlan,
    subscriptionExpiresAt,
    planInitialized,
    /** Premium/Trial: последний выбранный member из profiles_v2 (NULL = семья или не задано). */
    lastActiveMemberId,
    showInputHints,
    setShowInputHints: setShowInputHints.mutateAsync,
    isUpdatingShowInputHints: setShowInputHints.isPending,
    themePreference,
    setThemePreference: setThemePreference.mutateAsync,
    isUpdatingThemePreference: setThemePreference.isPending,
    setPlanInitialized: setPlanInitialized.mutateAsync,
    expiresAt,
    trialUntil,
    isExpired,
    isPremium,
    hasPremiumAccess,
    hasAccess,
    hasUnlimitedAccess,
    hasTrialAccess,
    trialRemainingMs,
    trialRemainingDays,
    trialUsed,
    isTrial,
    subscriptionStatus: effectiveStatus,
    canGenerate,
    canSendAi,
    remaining,
    usedToday,
    dailyLimit: effectiveDailyLimit,
    dailyLimitFromDb,
    aiDailyLimit,
    trialDaysRemaining,
    favoritesLimit,
    helpRemaining,
    helpDailyLimit,
    helpUsed,
    helpLimitExceeded,
    isLoading: isLoadingProfile,
    incrementUsage: incrementUsage.mutateAsync,
    updateSubscriptionStatus: updateSubscriptionStatus.mutateAsync,
    refetchUsage,
    setHelpUsedToday,
    startPayment: startPayment.mutateAsync,
    isStartingPayment: startPayment.isPending,
    cancelSubscription: cancelSubscription.mutateAsync,
    isCancellingSubscription: cancelSubscription.isPending,
    startTrial: startTrial.mutateAsync,
    isStartingTrial: startTrial.isPending,
  };
}
