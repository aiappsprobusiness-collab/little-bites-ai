import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "little-bites-app-store";

interface AppState {
  _version?: number;
}

export const useAppStore = create<AppState>()(
  persist(
    () => ({
      _version: 1,
    }),
    { name: STORAGE_KEY }
  )
);
