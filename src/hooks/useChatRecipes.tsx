import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useRecipes } from './useRecipes';
import { parseRecipesFromChat } from '@/utils/parseChatRecipes';
import { resolveUnit } from '@/utils/productUtils';
import type { Tables } from '@/integrations/supabase/types';
import { RECIPES_LIST_SELECT, RECIPES_PAGE_SIZE } from '@/lib/supabase-constants';
import mockRecipes from '@/mocks/mockRecipes.json';

type Recipe = Tables<'recipes'>;
const IS_DEV = import.meta.env.DEV;

/**
 * Хук для работы с рецептами из чата
 */
export function useChatRecipes() {
  const { user } = useAuth();
  const { createRecipe } = useRecipes();
  const queryClient = useQueryClient();

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
      childId,
      mealType,
    }: {
      userMessage: string;
      aiResponse: string;
      childId?: string;
      mealType?: 'breakfast' | 'lunch' | 'snack' | 'dinner';
    }): Promise<{ savedRecipes: Recipe[]; displayText: string }> => {
      if (!user) throw new Error('User not authenticated');

      // Парсим рецепты из ответа
      console.log('=== Parsing recipes from chat ===');
      console.log('User message:', userMessage);
      console.log('AI response (first 500 chars):', aiResponse.substring(0, 500));
      console.log('AI response length:', aiResponse.length);

      const { recipes: parsedRecipes, displayText } = parseRecipesFromChat(userMessage, aiResponse);
      console.log('=== Parsed recipes result ===');
      console.log('Number of parsed recipes:', parsedRecipes.length);
      console.log('Parsed recipes details:', parsedRecipes.map(r => ({
        title: r.title,
        mealType: r.mealType,
        ingredientsCount: r.ingredients.length,
        stepsCount: r.steps.length
      })));

      if (parsedRecipes.length === 0) {
        console.warn('No recipes found in chat response');
        return { savedRecipes: [], displayText };
      }

      // Сохраняем каждый рецепт
      const savedRecipes: Recipe[] = [];

      // Слова и фразы, которые не должны быть в названии рецепта
      const invalidTitlePatterns = [
        /^(яркое|нравится|детям|полезно|вкусно)/i,
        /(размять|нарезать|варить|жарить|тушить|готовить|добавить|смешать)/i,
        /^(мякоть|ингредиент|приготовление|шаг|способ)/i,
        /^рецепт из чата$/i, // Дефолтное название пропускаем если нет другого
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
            console.warn('=== Skipping invalid recipe title ===');
            console.warn('Invalid title:', parsedRecipe.title);
            console.warn('This looks like a description or instruction, not a recipe name');
            continue; // Пропускаем рецепты с некорректными названиями
          }

          // Определяем тип приема пищи
          const recipeMealType = parsedRecipe.mealType || mealType;

          // Создаем теги для рецепта
          const tags = ['chat'];
          if (recipeMealType) {
            tags.push(`chat_${recipeMealType}`);
          }

          console.log('=== Saving recipe from chat ===');
          console.log('Recipe title:', parsedRecipe.title);
          console.log('Tags:', tags);
          console.log('Meal type:', recipeMealType);
          console.log('Ingredients count:', parsedRecipe.ingredients.length);
          console.log('Steps count:', parsedRecipe.steps.length);

          // Схема recipes: cooking_time_minutes — integer; child_id — UUID или null; tags — text[]
          const cookingMinutes =
            parsedRecipe.cookingTime != null
              ? (typeof parsedRecipe.cookingTime === 'number'
                ? Math.floor(parsedRecipe.cookingTime)
                : parseInt(String(parsedRecipe.cookingTime), 10))
              : null;
          const validChildId =
            childId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(childId)
              ? childId
              : null;

          const newRecipe = await createRecipe({
            recipe: {
              title: parsedRecipe.title,
              description: parsedRecipe.description || 'Рецепт предложен AI ассистентом',
              cooking_time_minutes: Number.isFinite(cookingMinutes) ? cookingMinutes : null,
              child_id: validChildId,
              tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : []),
            },
            ingredients: parsedRecipe.ingredients.map((ing, index) => ({
              name: ing,
              amount: null,
              unit: resolveUnit(null, ing),
              category: 'other' as const,
              order_index: index,
            })),
            steps: parsedRecipe.steps.map((step, index) => ({
              instruction: step,
              step_number: index + 1,
              duration_minutes: null,
              image_url: null,
            })),
          });

          console.log('=== Recipe saved successfully ===');
          console.log('Saved recipe ID:', newRecipe.id);
          console.log('Saved recipe title:', newRecipe.title);
          console.log('Saved recipe tags:', newRecipe.tags);
          savedRecipes.push(newRecipe);
        } catch (error) {
          console.error('Failed to save recipe from chat:', error, parsedRecipe);
          // Продолжаем сохранять другие рецепты даже если один не удался
        }
      }

      // Инвалидируем кэш
      queryClient.invalidateQueries({ queryKey: ['chat_recipes', user.id] });
      queryClient.invalidateQueries({ queryKey: ['recipes', user.id] });

      return { savedRecipes, displayText };
    },
  });

  return {
    getTodayChatRecipes,
    saveRecipesFromChat: saveRecipesFromChat.mutateAsync,
    isSaving: saveRecipesFromChat.isPending,
  };
}
