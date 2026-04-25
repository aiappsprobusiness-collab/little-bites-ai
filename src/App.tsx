import { useEffect, useRef, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { FamilyProvider } from "@/contexts/FamilyContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import HomePage from "./pages/HomePage";
import ScanPage from "./pages/ScanPage";
import ProfilePage from "./pages/ProfilePage";
import ChildProfileEditPage from "./pages/ChildProfileEditPage";
import MealPlanPage from "./pages/MealPlanPage";
import RecipePage from "./pages/RecipePage";
import RecipeEditPage from "./pages/RecipeEditPage";
import RecipesPage from "./pages/RecipesPage";
import ChatPage from "./pages/ChatPage";
import FavoritesPage from "./pages/FavoritesPage";
import SosLayout from "./pages/SosLayout";
import SosTiles from "./pages/SosTiles";
import SosTopicPage from "./pages/SosTopicPage";
import SosScenarioScreen from "./pages/SosScenarioScreen";
import FoodDiary from "./pages/FoodDiary";
import ArticlesPage from "./pages/ArticlesPage";
import AuthPage from "./pages/AuthPage";
import AuthSignupSuccessPage from "./pages/AuthSignupSuccessPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AuthUpdatePasswordPage from "./pages/AuthUpdatePasswordPage";
import PublicRecipeSharePage from "./pages/PublicRecipeSharePage";
import SharedPlanPage from "./pages/SharedPlanPage";
import LandingOnboardingScreen from "./pages/LandingOnboardingScreen";
import AppPreloginScreen from "./pages/AppPreloginScreen";
import VkFunnelPage from "./pages/VkFunnelPage";
import { RootRedirect } from "./components/RootRedirect";
import MarketingLinkRedirectPage from "./pages/MarketingLinkRedirectPage";
import MarketingLinksPage from "./pages/admin/MarketingLinksPage";
import NotFound from "./pages/NotFound";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Subscription from "./pages/legal/Subscription";
import SubscriptionManagePage from "./pages/SubscriptionManagePage";
import { PaymentSuccess, PaymentFail } from "./pages/PaymentResult";
import { PWAInstall } from "./components/pwa/PWAInstall";
import { PWAUpdateToast } from "./components/pwa/PWAUpdateToast";
import { Paywall } from "./components/subscription/Paywall";
import { TrialActivatedModal } from "./components/subscription/TrialActivatedModal";
import { FreeVsPremiumModal } from "./components/subscription/FreeVsPremiumModal";
import { TrialLifecycleModalsHost } from "./components/subscription/TrialLifecycleModalsHost";
import { FavoritesLimitSheet } from "./components/plan/FavoritesLimitSheet";
import { FF_UNIFIED_PAYWALL } from "./config/featureFlags";
import { DinnerReminderBanner } from "./components/DinnerReminderBanner";
import { useAppStore } from "./store/useAppStore";
import { useSubscription } from "./hooks/useSubscription";
import { useAuth } from "./hooks/useAuth";
import { useToast } from "./hooks/use-toast";
import { captureAttributionFromLocationOnce } from "./utils/usageEvents";
import { isEffectiveTrialTier, TRIAL_ENDING_SOON_MS } from "./utils/trialLifecycle";
import {
  PAYWALL_TRIAL_ALREADY_USED,
  PAYWALL_TRIAL_ENDS_TODAY,
  PAYWALL_TRIAL_ENDS_TOMORROW,
} from "@/utils/unifiedPaywallCopy";
import { ReactQueryDiag } from "./dev/ReactQueryDiag";
import { AppThemeProvider } from "@/components/theme/AppThemeProvider";
import { ThemeProfileSync } from "@/components/theme/ThemeProfileSync";
import { ThemeColorMeta } from "@/components/theme/ThemeColorMeta";
import { shouldHandOffEmailAuthToCallback } from "@/utils/authEmailLinkParams";
import { TOP_MAIL_RU_COUNTER_ID } from "@/constants/topMailRuCounter";

/** Ключи localStorage V1: удаляем только их, не трогая sb-*-auth-token (Supabase). */
const V1_STORAGE_KEYS = ["child_id", "last_child", "user_usage_data", "recipe_cache"];

/** Netlify/host может отдавать `/auth/callback/` — без нормализации guard зацикливает replace. */
function isAuthCallbackPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/auth/callback";
}

function isAuthResetPasswordPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/auth/reset-password";
}

function AuthCallbackRedirectGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  /** Один replace на URL: иначе Strict Mode / повтор эффекта даёт второй replace → отмена навигации и шторм (см. docs). */
  const emailHandoffKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isAuthCallbackPath(location.pathname)) return;
    if (isAuthResetPasswordPath(location.pathname)) return;
    if (!shouldHandOffEmailAuthToCallback(location.pathname, location.search, location.hash || "")) return;
    const key = `${location.pathname}${location.search}${location.hash || ""}`;
    if (emailHandoffKeyRef.current === key) return;
    emailHandoffKeyRef.current = key;
    window.location.replace(`/auth/callback${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);
  return <>{children}</>;
}

/** Обновляет --app-height для мобилки/PWA (адресная строка, клавиатура, ориентация). */
function AppHeightSync() {
  useEffect(() => {
    const setHeight = () => {
      document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
    };
    setHeight();
    window.addEventListener("resize", setHeight);
    window.addEventListener("orientationchange", setHeight);
    return () => {
      window.removeEventListener("resize", setHeight);
      window.removeEventListener("orientationchange", setHeight);
    };
  }, []);
  return null;
}

function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromLocationOnce();
  }, []);
  return null;
}

/** Доп. pageView при смене маршрута SPA; первый просмотр — из сниппета в index.html `<head>` (без дубля). */
function TopMailRuSpaPageView() {
  const location = useLocation();
  const lastRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${location.pathname}${location.search}${location.hash}`;

    if (lastRouteKeyRef.current === null) {
      lastRouteKeyRef.current = key;
      return;
    }
    if (lastRouteKeyRef.current === key) return;

    lastRouteKeyRef.current = key;
    window._tmr = window._tmr || [];
    window._tmr.push({
      id: TOP_MAIL_RU_COUNTER_ID,
      type: "pageView",
      start: Date.now(),
    });
  }, [location.pathname, location.search, location.hash]);

  return null;
}

/** Админ-страницы: только при VITE_ADMIN_MODE=true (см. .env). */
function AdminMarketingLinksRoute() {
  const enabled = import.meta.env.VITE_ADMIN_MODE === "true";
  if (!enabled) return <Navigate to="/" replace />;
  return <MarketingLinksPage />;
}

function LegacyCacheClear() {
  useEffect(() => {
    V1_STORAGE_KEYS.forEach((key) => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    });
  }, []);
  return null;
}

const queryClient = new QueryClient();

function GlobalPaywall() {
  const showPaywall = useAppStore((s) => s.showPaywall);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  return (
    <Paywall
      isOpen={showPaywall}
      onClose={() => setShowPaywall(false)}
      onSubscribe={() => setShowPaywall(false)}
    />
  );
}

function TrialActivatedModalHost() {
  const { user } = useAuth();
  const show = useAppStore((s) => s.showTrialActivatedModal);
  const setShow = useAppStore((s) => s.setShowTrialActivatedModal);
  const setFreeVsPremium = useAppStore((s) => s.setShowFreeVsPremiumModal);

  useEffect(() => {
    if (!user) setShow(false);
  }, [user, setShow]);

  if (!user) return null;

  return (
    <TrialActivatedModal
      open={show}
      userId={user.id}
      onClose={() => setShow(false)}
      onOpenPricing={() => setFreeVsPremium(true)}
    />
  );
}

function GlobalFreeVsPremiumModalHost() {
  const { hasAccess, trialUsed, startTrial } = useSubscription();
  const { toast } = useToast();
  const open = useAppStore((s) => s.showFreeVsPremiumModal);
  const setOpen = useAppStore((s) => s.setShowFreeVsPremiumModal);
  const showTrialCta = !hasAccess && !trialUsed;

  return (
    <FreeVsPremiumModal
      open={open}
      onClose={() => setOpen(false)}
      showTrialCta={showTrialCta}
      onTryTrial={async () => {
        setOpen(false);
        try {
          await startTrial();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "TRIAL_ALREADY_USED") {
            toast({ title: PAYWALL_TRIAL_ALREADY_USED, description: "Оформите полную версию для полного доступа." });
          } else if (msg) {
            toast({ variant: "destructive", title: "Ошибка", description: msg });
          }
        }
      }}
    />
  );
}

/** Мягкий баннер: при effective trial и остатке ≤24ч — «сегодня/завтра», иначе «через N дней». */
function TrialSoftBanner() {
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const { trialUntil, hasPremiumAccess, trialRemainingMs, trialRemainingDays } = useSubscription();
  const trialUx = isEffectiveTrialTier(trialUntil, hasPremiumAccess);
  useEffect(() => {
    if (!trialUx) return;
    if (trialRemainingMs <= TRIAL_ENDING_SOON_MS) {
      const endOfTrial = new Date(Date.now() + trialRemainingMs);
      const now = new Date();
      const isToday =
        endOfTrial.getDate() === now.getDate() &&
        endOfTrial.getMonth() === now.getMonth() &&
        endOfTrial.getFullYear() === now.getFullYear();
      setPaywallCustomMessage(isToday ? PAYWALL_TRIAL_ENDS_TODAY : PAYWALL_TRIAL_ENDS_TOMORROW);
    } else if (trialRemainingDays != null) {
      const days =
        trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней";
      setPaywallCustomMessage(`Пробный период заканчивается через ${trialRemainingDays} ${days}`);
    }
  }, [trialUx, trialRemainingMs, trialRemainingDays, setPaywallCustomMessage]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    {import.meta.env.DEV ? <ReactQueryDiag /> : null}
    <AppThemeProvider>
    <TooltipProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthCallbackRedirectGuard>
        <AuthProvider>
          <ThemeProfileSync />
          <ThemeColorMeta />
          <AppHeightSync />
          <TopMailRuSpaPageView />
          <AttributionCapture />
          <LegacyCacheClear />
          <FamilyProvider>
            <Toaster />
            <Sonner />
            <PWAInstall />
            <PWAUpdateToast />
            <GlobalPaywall />
            <TrialActivatedModalHost />
            <GlobalFreeVsPremiumModalHost />
            <TrialLifecycleModalsHost />
            {!FF_UNIFIED_PAYWALL ? <FavoritesLimitSheet /> : null}
            <TrialSoftBanner />
            <DinnerReminderBanner />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/signup-success" element={<AuthSignupSuccessPage />} />
              {/* Публичный маршрут: обрабатывает magic link / email confirmation, сам ждёт session и редиректит; не оборачивать в ProtectedRoute */}
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/auth/reset-password" element={<AuthUpdatePasswordPage />} />
              <Route path="/auth/update-password" element={<Navigate to="/auth/reset-password" replace />} />
              <Route path="/welcome" element={<LandingOnboardingScreen />} />
              <Route path="/prelogin" element={<AppPreloginScreen />} />
              <Route path="/vk" element={<VkFunnelPage />} />
              <Route path="/r/:shareRef" element={<PublicRecipeSharePage />} />
              <Route path="/go/:slug" element={<MarketingLinkRedirectPage />} />
              <Route path="/admin/marketing-links" element={<AdminMarketingLinksRoute />} />
              <Route path="/p/:ref" element={<SharedPlanPage />} />
              <Route path="/" element={<RootRedirect />} />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scan"
                element={
                  <ProtectedRoute>
                    <ScanPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile/child/:id"
                element={
                  <ProtectedRoute>
                    <ChildProfileEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/meal-plan"
                element={
                  <ProtectedRoute>
                    <MealPlanPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recipe/:id"
                element={
                  <ProtectedRoute>
                    <RecipePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recipe/:id/edit"
                element={
                  <ProtectedRoute>
                    <RecipeEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recipe/new"
                element={
                  <ProtectedRoute>
                    <RecipeEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recipes"
                element={
                  <ProtectedRoute>
                    <RecipesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/favorites"
                element={
                  <ProtectedRoute>
                    <FavoritesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sos"
                element={
                  <ProtectedRoute>
                    <SosLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<SosTiles />} />
                <Route path="topic/:topicId" element={<SosTopicPage />} />
                <Route path=":scenarioKey" element={<SosScenarioScreen />} />
              </Route>
              <Route path="/plate-analysis" element={<Navigate to="/diary" replace />} />
              <Route
                path="/diary"
                element={
                  <ProtectedRoute>
                    <FoodDiary />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/articles"
                element={
                  <ProtectedRoute>
                    <ArticlesPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/subscription/manage" element={
                <ProtectedRoute>
                  <SubscriptionManagePage />
                </ProtectedRoute>
              } />
              <Route path="/subscription/terms" element={<Subscription />} />
              <Route path="/subscription" element={<Navigate to="/subscription/terms" replace />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/fail" element={<PaymentFail />} />
              <Route path="/payment/cancel" element={<Navigate to="/payment/fail" replace />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </FamilyProvider>
        </AuthProvider>
        </AuthCallbackRedirectGuard>
      </BrowserRouter>
    </TooltipProvider>
    </AppThemeProvider>
  </QueryClientProvider>
);

export default App;
