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
import MealPlanPage from "./pages/MealPlanPage";
import RecipePage from "./pages/RecipePage";
import RecipeEditPage from "./pages/RecipeEditPage";
import RecipesPage from "./pages/RecipesPage";
import ChatPage from "./pages/ChatPage";
import FavoritesPage from "./pages/FavoritesPage";
import SosConsultant from "./pages/SosConsultant";
import PlateAnalysis from "./pages/PlateAnalysis";
import ArticlesPage from "./pages/ArticlesPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import { PWAInstall } from "./components/pwa/PWAInstall";

/** Ключи localStorage V1: при наличии любого из них очищаем кэш для миграции на V2 (members, profiles_v2). */
const V1_STORAGE_KEYS = ["child_id", "last_child", "user_usage_data"];

function LegacyCacheClear() {
  useEffect(() => {
    const hasV1 = V1_STORAGE_KEYS.some((k) => localStorage.getItem(k) != null);
    if (hasV1) localStorage.clear();
  }, []);
  return null;
}

const queryClient = new QueryClient();

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
              <Route
                path="/plate-analysis"
                element={
                  <ProtectedRoute>
                    <PlateAnalysis />
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
