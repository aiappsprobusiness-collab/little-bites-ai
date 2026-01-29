import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseIngredient } from "@/utils/parseIngredient";
import type { RecipeSuggestion } from "@/services/deepseek";

const STORAGE_KEY = "little-bites-app-store";

export interface FavoriteItem {
  id: string;
  recipe: RecipeSuggestion;
  createdAt: string;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  checked: boolean;
  sourceRecipe?: string;
}

interface AppState {
  favorites: FavoriteItem[];
  shoppingList: ShoppingListItem[];

  addFavorite: (recipe: RecipeSuggestion) => void;
  removeFavorite: (id: string) => void;

  /** Добавляет ингредиенты в список покупок (строки парсятся через parseIngredient). Без дубликатов по name. */
  addToShoppingList: (ingredients: string[], sourceRecipe?: string) => void;
  toggleShoppingItem: (id: string) => void;
  removeShoppingItem: (id: string) => void;
  setShoppingItemChecked: (id: string, checked: boolean) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      favorites: [],
      shoppingList: [],

      addFavorite: (recipe) =>
        set((state) => ({
          favorites: [
            {
              id: generateId(),
              recipe,
              createdAt: new Date().toISOString(),
            },
            ...state.favorites,
          ],
        })),

      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        })),

      addToShoppingList: (ingredients, sourceRecipe) =>
        set((state) => {
          const existingNames = new Set(
            state.shoppingList.map((i) => i.name.toLowerCase().trim())
          );
          const newItems: ShoppingListItem[] = ingredients
            .map((raw) => {
              const { name, quantity, unit } = parseIngredient(raw);
              if (!name.trim()) return null;
              if (existingNames.has(name.toLowerCase().trim())) return null;
              existingNames.add(name.toLowerCase().trim());
              return {
                id: generateId(),
                name: name.trim(),
                amount: quantity,
                unit,
                checked: false,
                sourceRecipe,
              };
            })
            .filter((x): x is ShoppingListItem => x !== null);
          return {
            shoppingList: [...state.shoppingList, ...newItems],
          };
        }),

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
