import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "little-bites-app-store";

interface AppState {
  _version?: number;
  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;
  /** При открытии paywall из онбординга (Free + 2-й профиль) — показать это сообщение */
  paywallCustomMessage: string | null;
  setPaywallCustomMessage: (v: string | null) => void;
  /** Причина открытия paywall для аналитики (paywall_view.properties.paywall_reason) */
  paywallReason: string | null;
  setPaywallReason: (v: string | null) => void;
  showFavoritesLimitSheet: boolean;
  setShowFavoritesLimitSheet: (v: boolean) => void;
  /** После успешного start_trial (один показ, пока не закрыли — см. trialActivatedModalStorage) */
  showTrialActivatedModal: boolean;
  setShowTrialActivatedModal: (v: boolean) => void;
  /** После закрытия онбординга trial — продолжить flow (например замена блюда). Не персистится. */
  trialOnboardingResumeCallback: (() => void | Promise<void>) | null;
  setTrialOnboardingResumeCallback: (fn: (() => void | Promise<void>) | null) => void;
  /** Экран Free vs Premium (модалка). */
  showFreeVsPremiumModal: boolean;
  setShowFreeVsPremiumModal: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      _version: 1,
      showPaywall: false,
      setShowPaywall: (v) =>
        set((s) => ({ ...s, showPaywall: v, ...(v ? {} : { paywallCustomMessage: null, paywallReason: null }) })),
      paywallCustomMessage: null,
      setPaywallCustomMessage: (v) => set({ paywallCustomMessage: v }),
      paywallReason: null,
      setPaywallReason: (v) => set({ paywallReason: v }),
      showFavoritesLimitSheet: false,
      setShowFavoritesLimitSheet: (v) => set((s) => ({ ...s, showFavoritesLimitSheet: v })),
      showTrialActivatedModal: false,
      setShowTrialActivatedModal: (v) => set({ showTrialActivatedModal: v }),
      trialOnboardingResumeCallback: null,
      setTrialOnboardingResumeCallback: (fn) => set({ trialOnboardingResumeCallback: fn }),
      showFreeVsPremiumModal: false,
      setShowFreeVsPremiumModal: (v) => set({ showFreeVsPremiumModal: v }),
    }),
    { name: STORAGE_KEY, partialize: (s) => ({ _version: s._version }) }
  )
);
