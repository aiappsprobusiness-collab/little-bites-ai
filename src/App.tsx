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
import SosConsultant from "./pages/SosConsultant";
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
import { useAppStore } from "./store/useAppStore";

/** Ключи localStorage V1: удаляем только их, не трогая sb-*-auth-token (Supabase). */
const V1_STORAGE_KEYS = ["child_id", "last_child", "user_usage_data", "recipe_cache"];

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
          <LegacyCacheClear />
          <FamilyProvider>
            <Toaster />
            <Sonner />
            <PWAInstall />
            <PWAUpdateToast />
            <GlobalPaywall />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<Navigate to="/chat" replace />} />
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
                    <SosConsultant />
                  </ProtectedRoute>
                }
              />
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
