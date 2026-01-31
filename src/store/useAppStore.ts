import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "little-bites-app-store";

export interface ShoppingListItem {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  checked: boolean;
  sourceRecipe?: string;
}

interface AppState {
  shoppingList: ShoppingListItem[];

  toggleShoppingItem: (id: string) => void;
  removeShoppingItem: (id: string) => void;
  setShoppingItemChecked: (id: string, checked: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      shoppingList: [],

      toggleShoppingItem: (id) =>
        set((state) => ({
          shoppingList: state.shoppingList.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        })),

      removeShoppingItem: (id) =>
        set((state) => ({
          shoppingList: state.shoppingList.filter((item) => item.id !== id),
        })),

      setShoppingItemChecked: (id, checked) =>
        set((state) => ({
          shoppingList: state.shoppingList.map((item) =>
            item.id === id ? { ...item, checked } : item
          ),
        })),
    }),
    { name: STORAGE_KEY }
  )
);
