import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeLog, safeWarn, safeError } from "@/utils/safeLogger";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useRecipes } from './useRecipes';
import { parseRecipesFromChat } from '@/utils/parseChatRecipes';
import type { ParseRecipesFromChatResult } from '@/utils/parseChatRecipes';
import type { Tables } from '@/integrations/supabase/types';
import { RECIPES_LIST_SELECT, RECIPES_PAGE_SIZE } from '@/lib/supabase-constants';
import mockRecipes from '@/mocks/mockRecipes.json';

type Recipe = Tables<'recipes'>;
const IS_DEV = import.meta.env.DEV;
const UI_SETTLE_MS = 300;
const INVALIDATE_DELAY_MS = 300;

/**
 * Хук для работы с рецептами из чата
 */
export function useChatRecipes() {
  const { user } = useAuth();
  const { createRecipe } = useRecipes();
  const queryClient = useQueryClient();
  const lastProcessedRef = useRef<{ aiResponse: string; result: Promise<{ savedRecipes: Recipe[]; displayText: string }> } | null>(null);

  /**
   * Получить рецепты из чата за последние 48 часов (в т.ч. «семейный ужин», только что сгенерированные).
   * Окно 48ч устраняет расхождения по timezone и гарантирует появление недавних рецептов в плане.
   */
  const getTodayChatRecipes = (mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner') => {
    return useQuery({
      queryKey: ['chat_recipes', user?.id, 'recent', mealType],
      queryFn: async () => {
        if (!user) return [];

        if (IS_DEV) {
          const chat = (mockRecipes as unknown[]).filter(
            (r: { tags?: string[] }) => r.tags && Array.isArray(r.tags) && r.tags.includes('chat')
          ) as Recipe[];
          const filtered = mealType
            ? chat.filter((r: { tags?: string[] }) => {
              const has = r.tags?.includes(`chat_${mealType}`);
              const any = r.tags?.some((t: string) => t.startsWith('chat_'));
              return has || !any;
            })
            : chat;
          return filtered.slice(0, RECIPES_PAGE_SIZE);
        }

        const now = new Date();
        const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const { data: recentRecipes, error: recipesError } = await supabase
          .from('recipes')
          .select(RECIPES_LIST_SELECT)
          .eq('user_id', user.id)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        if (recipesError) throw recipesError;

        const chatRecipes = (recentRecipes ?? []).filter((recipe) => {
          if (!recipe.tags || !Array.isArray(recipe.tags)) return false;
          return recipe.tags.includes('chat');
        });

        const filtered = mealType
          ? chatRecipes.filter((recipe) => {
            const hasMealTypeTag = recipe.tags?.includes(`chat_${mealType}`);
            const hasAnyMealTypeTag = recipe.tags?.some((t: string) => t.startsWith('chat_'));
            return hasMealTypeTag || !hasAnyMealTypeTag;
          })
          : chatRecipes;

        return filtered.slice(0, RECIPES_PAGE_SIZE) as Recipe[];
      },
      enabled: !!user,
    });
  };

  /**
   * Сохранить рецепты из ответа AI в базу данных
   */
  const saveRecipesFromChat = useMutation({
    mutationFn: async ({
      userMessage,
      aiResponse,
      memberId,
      mealType,
      parsedResult: parsedResultIn,
    }: {
      userMessage: string;
      aiResponse: string;
      memberId?: string;
      mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
      /** Предраспарсенный результат — чат может сразу показать displayText, без повторного парсинга */
      parsedResult?: ParseRecipesFromChatResult;
    }): Promise<{ savedRecipes: Recipe[]; displayText: string }> => {
      if (!user) throw new Error('User not authenticated');

      if (lastProcessedRef.current?.aiResponse === aiResponse) {
        return lastProcessedRef.current.result;
      }

      await new Promise((resolve) => setTimeout(resolve, UI_SETTLE_MS));

      const parsed = parsedResultIn ?? parseRecipesFromChat(userMessage, aiResponse);
      const { recipes: parsedRecipes, displayText } = parsed;

      if (parsedRecipes.length === 0) {
        lastProcessedRef.current = { aiResponse, result: Promise.resolve({ savedRecipes: [], displayText }) };
        return { savedRecipes: [], displayText };
      }
      // Сохраняем каждый рецепт
      const savedRecipes: Recipe[] = [];

      // Слова и фразы, которые не должны быть в названии рецепта (в т.ч. отказы ИИ)
      const invalidTitlePatterns = [
        /^(яркое|нравится|детям|полезно|вкусно)/i,
        /(размять|нарезать|варить|жарить|тушить|готовить|добавить|смешать)/i,
        /^(мякоть|ингредиент|приготовление|шаг|способ)/i,
        /^рецепт из чата$/i,
        /не рекомендуется/i,
        /только грудное молоко/i,
        /^только гв\.?$/i,
        /только смесь/i,
        /не вводить прикорм/i,
      ];

      // Проверка, что название валидное
      const isValidTitle = (title: string): boolean => {
        if (!title || title.trim().length < 3) return false;
        if (title.length > 80) return false; // Слишком длинные названия обычно описания
        // До 10 слов: «Фруктовый мусс из банана, манго и папайи», «Салат из огурцов, помидоров и зелени»
        if (title.split(/\s+/).length > 10) return false;
        // Запятые допустимы в названиях с перечислением: «из банана, манго и папайи»

        // Проверяем паттерны
        for (const pattern of invalidTitlePatterns) {
          if (pattern.test(title)) {
            return false;
          }
        }

        return true;
      };

      for (const parsedRecipe of parsedRecipes) {
        try {
          // Валидируем название рецепта
          if (!isValidTitle(parsedRecipe.title)) {
            safeWarn('=== Skipping invalid recipe title ===');
            safeWarn('Invalid title:', parsedRecipe.title);
            safeWarn('This looks like a description or instruction, not a recipe name');
            continue; // Пропускаем рецепты с некорректными названиями
          }

          // Определяем тип приема пищи
          const recipeMealType = parsedRecipe.mealType || mealType;

          // Создаем теги для рецепта
          const tags = ['chat'];
          if (recipeMealType) {
            tags.push(`chat_${recipeMealType}`);
          }

          safeLog('=== Saving recipe from chat ===');
          safeLog('Recipe title:', parsedRecipe.title);
          safeLog('Tags:', tags);
          safeLog('Meal type:', recipeMealType);
          safeLog('Ingredients count:', parsedRecipe.ingredients.length);
          safeLog('Steps count:', parsedRecipe.steps.length);

          // Схема recipes: cooking_time_minutes — integer; child_id — UUID или null; tags — text[]
          const cookingMinutes =
            parsedRecipe.cookingTime != null
              ? (typeof parsedRecipe.cookingTime === 'number'
                ? Math.floor(parsedRecipe.cookingTime)
                : parseInt(String(parsedRecipe.cookingTime), 10))
              : null;
          const validChildId =
            memberId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId)
              ? memberId
              : null;

          const newRecipe = await createRecipe({
            recipe: {
              title: parsedRecipe.title,
              description: parsedRecipe.description || 'Рецепт предложен AI ассистентом',
              cooking_time_minutes: Number.isFinite(cookingMinutes) ? cookingMinutes : null,
              child_id: validChildId,
              tags,
            },
            ingredients: parsedRecipe.ingredients.map((ing, index) => {
              const o = typeof ing === 'object' && ing && 'name' in ing ? (ing as { name: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null; substitute?: string }) : null;
              const nameStr = o?.name ?? (typeof ing === 'string' ? ing : String(ing));
              const displayText = o?.display_text;
              const canonical = o?.canonical_amount != null && (o?.canonical_unit === 'g' || o?.canonical_unit === 'ml')
                ? { amount: o.canonical_amount, unit: o.canonical_unit as 'g' | 'ml' }
                : null;
              return {
                name: nameStr,
                display_text: displayText ?? null,
                canonical_amount: canonical?.amount ?? null,
                canonical_unit: canonical?.unit ?? null,
                amount: null,
                unit: null,
                category: 'other' as const,
                order_index: index,
                ...(o?.substitute != null && o.substitute !== '' && { substitute: String(o.substitute) }),
              };
            }),
            steps: parsedRecipe.steps.map((step, index) => ({
              instruction: step,
              step_number: index + 1,
              duration_minutes: null,
              image_url: null,
            })),
          });

          safeLog('=== Recipe saved successfully ===');
          safeLog('Saved recipe ID:', newRecipe.id);
          safeLog('Saved recipe title:', newRecipe.title);
          safeLog('Saved recipe tags:', newRecipe.tags);
          savedRecipes.push(newRecipe);
        } catch (error) {
          safeError('Failed to save recipe from chat:', error, parsedRecipe);
          // Продолжаем сохранять другие рецепты даже если один не удался
        }
      }

      const result = { savedRecipes, displayText };
      lastProcessedRef.current = { aiResponse, result: Promise.resolve(result) };

      // Один отложенный блок инвалидации — меньше перерисовок подряд
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['chat_recipes', user.id] });
        queryClient.invalidateQueries({ queryKey: ['recipes', user.id] });
      }, INVALIDATE_DELAY_MS);

      return result;
    },
  });

  return {
    getTodayChatRecipes,
    saveRecipesFromChat: saveRecipesFromChat.mutateAsync,
    isSaving: saveRecipesFromChat.isPending,
  };
}
