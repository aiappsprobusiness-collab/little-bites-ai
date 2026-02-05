import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "little-bites-app-store";

interface AppState {
  _version?: number;
  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      _version: 1,
      showPaywall: false,
      setShowPaywall: (v) => set({ showPaywall: v }),
    }),
    { name: STORAGE_KEY, partialize: (s) => ({ _version: s._version }) }
  )
);
