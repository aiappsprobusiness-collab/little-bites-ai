import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import NotFound from "./pages/NotFound";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Subscription from "./pages/legal/Subscription";
import { PaymentSuccess, PaymentFail } from "./pages/PaymentResult";
import { PWAInstall } from "./components/pwa/PWAInstall";
import { PWAUpdateToast } from "./components/pwa/PWAUpdateToast";
import { Paywall } from "./components/subscription/Paywall";
import { FavoritesLimitSheet } from "./components/plan/FavoritesLimitSheet";
import { useAppStore } from "./store/useAppStore";
import { useSubscription } from "./hooks/useSubscription";

/** Ключи localStorage V1: удаляем только их, не трогая sb-*-auth-token (Supabase). */
const V1_STORAGE_KEYS = ["child_id", "last_child", "user_usage_data", "recipe_cache"];

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

function LegacyCacheClear() {
  useEffect(() => {
    V1_STORAGE_KEYS.forEach((key) => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    });
    // console.log("V1 Cache cleared safely");
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

/** Мягкий баннер: при trial и остатке ≤24ч — «сегодня/завтра», иначе «через N дней». */
function TrialSoftBanner() {
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const { hasTrialAccess, trialRemainingMs, trialRemainingDays } = useSubscription();
  useEffect(() => {
    if (!hasTrialAccess) return;
    if (trialRemainingMs <= 86_400_000) {
      const endOfTrial = new Date(Date.now() + trialRemainingMs);
      const now = new Date();
      const isToday =
        endOfTrial.getDate() === now.getDate() &&
        endOfTrial.getMonth() === now.getMonth() &&
        endOfTrial.getFullYear() === now.getFullYear();
      setPaywallCustomMessage(isToday ? "Триал закончится сегодня" : "Триал закончится завтра");
    } else if (trialRemainingDays != null) {
      const days =
        trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней";
      setPaywallCustomMessage(`Триал заканчивается через ${trialRemainingDays} ${days}`);
    }
  }, [hasTrialAccess, trialRemainingMs, trialRemainingDays, setPaywallCustomMessage]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <AppHeightSync />
          <LegacyCacheClear />
          <FamilyProvider>
            <Toaster />
            <Sonner />
            <PWAInstall />
            <PWAUpdateToast />
            <GlobalPaywall />
            <FavoritesLimitSheet />
            <TrialSoftBanner />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<Navigate to="/meal-plan" replace />} />
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
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/fail" element={<PaymentFail />} />
              <Route path="/payment/cancel" element={<Navigate to="/payment/fail" replace />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </FamilyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
