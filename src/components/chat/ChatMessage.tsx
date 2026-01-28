import { useState, useRef, forwardRef } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Trash2, ChefHat, Clock, Star, Share2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useToast } from "@/hooks/use-toast";
import { parseIngredient } from "@/utils/parseIngredient";
import { detectCategory, resolveUnit } from "@/utils/productUtils";
import type { RecipeSuggestion } from "@/services/deepseek";

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
  onDelete: (id: string) => void;
}

interface Recipe {
  title: string;
  description?: string;
  ingredients?: string[];
  steps?: string[];
  cookingTime?: number;
  ageRange?: string;
}

/**
 * Парсит JSON рецепт из текста сообщения
 */
function parseRecipeFromContent(content: string): Recipe | null {
  try {
    // Ищем JSON в code blocks - используем greedy quantifier для захвата всего содержимого
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const jsonStr = codeBlockMatch[1].trim();
      // Проверяем что это JSON объект
      if (jsonStr.startsWith('{')) {
        try {
          const parsed = JSON.parse(jsonStr);
          // Если это один рецепт
          if (parsed.title || parsed.name) {
            return {
              title: parsed.title || parsed.name,
              description: parsed.description,
              ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
              steps: Array.isArray(parsed.steps) ? parsed.steps : [],
              cookingTime: parsed.cookingTime || parsed.cooking_time,
              ageRange: parsed.ageRange || '',
            };
          }
          // Если это массив рецептов, берем первый
          if (Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
            const recipe = parsed.recipes[0];
            return {
              title: recipe.title || recipe.name,
              description: recipe.description,
              ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
              steps: Array.isArray(recipe.steps) ? recipe.steps : [],
              cookingTime: recipe.cookingTime || recipe.cooking_time,
              ageRange: recipe.ageRange || '',
            };
          }
        } catch {
          // JSON невалидный - пробуем "исправить" обрезанный JSON
          const fixedJson = tryFixTruncatedJson(jsonStr);
          if (fixedJson) {
            return fixedJson;
          }
        }
      }
    }

    // Если не нашли в code block, ищем обычный JSON объект
    const simpleMatch = content.match(/\{[\s\S]*\}/);
    if (simpleMatch) {
      try {
        const parsed = JSON.parse(simpleMatch[0]);
        if (parsed.title || parsed.name) {
          return {
            title: parsed.title || parsed.name,
            description: parsed.description,
            ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
            steps: Array.isArray(parsed.steps) ? parsed.steps : [],
            cookingTime: parsed.cookingTime || parsed.cooking_time,
            ageRange: parsed.ageRange || '',
          };
        }
      } catch {
        // Невалидный JSON
      }
    }
  } catch (e) {
    // Не JSON или невалидный JSON - возвращаем null
    return null;
  }

  return null;
}

/**
 * Пытается исправить обрезанный JSON рецепта
 */
function tryFixTruncatedJson(jsonStr: string): Recipe | null {
  try {
    // Извлекаем title
    const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : null;
    if (!title) return null;

    // Извлекаем description
    const descMatch = jsonStr.match(/"description"\s*:\s*"([^"]+)"/);
    const description = descMatch ? descMatch[1] : undefined;

    // Извлекаем ingredients
    const ingredientsMatch = jsonStr.match(/"ingredients"\s*:\s*\[([\s\S]*?)\]/);
    let ingredients: string[] = [];
    if (ingredientsMatch) {
      const ingStr = ingredientsMatch[1];
      const ingMatches = ingStr.match(/"([^"]+)"/g);
      if (ingMatches) {
        ingredients = ingMatches.map(s => s.replace(/"/g, ''));
      }
    }

    // Извлекаем steps (даже если массив обрезан)
    const stepsMatch = jsonStr.match(/"steps"\s*:\s*\[([\s\S]*)/);
    let steps: string[] = [];
    if (stepsMatch) {
      const stepsStr = stepsMatch[1];
      const stepMatches = stepsStr.match(/"([^"]+)"/g);
      if (stepMatches) {
        steps = stepMatches.map(s => s.replace(/"/g, ''));
      }
    }

    // Извлекаем cookingTime
    const timeMatch = jsonStr.match(/"(?:cookingTime|cooking_time)"\s*:\s*(\d+)/);
    const cookingTime = timeMatch ? parseInt(timeMatch[1]) : undefined;

    // Извлекаем ageRange
    const ageRangeMatch = jsonStr.match(/"ageRange"\s*:\s*"([^"]+)"/);
    const ageRange = ageRangeMatch ? ageRangeMatch[1] : '';

    return { title, description, ingredients, steps, cookingTime, ageRange };
  } catch {
    return null;
  }
}

/**
 * Форматирует рецепт в красивый вид
 */
function formatRecipe(recipe: Recipe): string {
  let formatted = `🍽️ **${recipe.title}**\n\n`;

  if (recipe.description) {
    formatted += `${recipe.description}\n\n`;
  }

  if (recipe.cookingTime) {
    formatted += `⏱️ Время приготовления: ${recipe.cookingTime} мин\n\n`;
  }

  if (recipe.ingredients && recipe.ingredients.length > 0) {
    formatted += `**Ингредиенты:**\n`;
    recipe.ingredients.forEach((ingredient, index) => {
      formatted += `${index + 1}. ${ingredient}\n`;
    });
    formatted += `\n`;
  }

  if (recipe.steps && recipe.steps.length > 0) {
    formatted += `**Приготовление:**\n`;
    recipe.steps.forEach((step, index) => {
      formatted += `${index + 1}. ${step}\n`;
    });
  }

  return formatted;
}

export const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ id, role, content, timestamp, rawContent, onDelete }, ref) => {
    const [showDelete, setShowDelete] = useState(false);
    const x = useMotionValue(0);
    const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
    const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);
    const constraintsRef = useRef(null);
    const { addFavorite, isAdding } = useFavorites();
    const { addItem, createList, activeList } = useShoppingLists();
    const { toast } = useToast();

    const sourceForParse = (rawContent ?? content).trim();
    const recipe = role === "assistant" ? parseRecipeFromContent(sourceForParse) : null;
    const displayContent = recipe ? formatRecipe(recipe) : content;

    const handleAddToFavorites = async () => {
      if (!recipe) return;
      try {
        const recipeSuggestion: RecipeSuggestion = {
          title: recipe.title,
          description: recipe.description || '',
          ingredients: recipe.ingredients || [],
          steps: recipe.steps || [],
          cookingTime: recipe.cookingTime || 0,
          ageRange: recipe.ageRange || '',
        };
        await addFavorite({ recipe: recipeSuggestion, memberIds: [] });
        toast({ title: "Добавлено в избранное", description: `Рецепт «${recipe.title}» добавлен в избранное` });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Ошибка", description: e.message || "Не удалось добавить в избранное" });
      }
    };

    const handleAddToList = async () => {
      if (!recipe?.ingredients?.length) return;
      try {
        let listId = activeList?.id;
        if (!listId) {
          const list = await createList("Список покупок");
          listId = list?.id;
        }
        if (!listId) throw new Error("Нет активного списка");
        for (const raw of recipe.ingredients) {
          const { name, quantity, unit } = parseIngredient(raw);
          if (!name) continue;
          const u = resolveUnit(unit, name);
          const cat = detectCategory(name);
          await addItem({
            name,
            amount: quantity,
            unit: u,
            category: cat as any,
            is_purchased: false,
            shopping_list_id: listId,
          });
        }
        toast({ title: "В список покупок", description: `Ингредиенты «${recipe.title}» добавлены` });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Ошибка", description: e.message || "Не удалось добавить в список" });
      }
    };

    const handleDragEnd = (_: any, info: PanInfo) => {
      if (info.offset.x < -80) {
        setShowDelete(true);
      }
    };

    const handleDelete = () => {
      onDelete(id);
      setShowDelete(false);
    };

    return (
      <div
        ref={ref}
        className={`relative flex ${role === "user" ? "justify-end" : "justify-start"}`}
      >
        {/* Delete button background - visible on swipe */}
        <motion.div
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-16"
        >
          <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-destructive" />
          </div>
        </motion.div>

        <motion.div
          drag="x"
          dragConstraints={{ left: -100, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          style={{ x }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          className={`relative max-w-[85%] cursor-grab active:cursor-grabbing`}
        >
          <div
            className={`rounded-2xl px-4 py-3 ${role === "user"
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card shadow-soft rounded-bl-sm"
              }`}
          >
            {recipe ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <ChefHat className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-base">{recipe.title}</h3>
                </div>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground italic">{recipe.description}</p>
                )}
                {recipe.cookingTime && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Время приготовления: {recipe.cookingTime} мин</span>
                  </div>
                )}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🥘</span>
                      <p className="font-semibold text-sm">Ингредиенты:</p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {recipe.ingredients.map((ingredient, index) => {
                        // Определяем эмодзи для разных типов ингредиентов
                        const getIngredientEmoji = (ing: string): string => {
                          const lowerIng = ing.toLowerCase();
                          if (lowerIng.includes('молоко') || lowerIng.includes('сливки') || lowerIng.includes('кефир')) return '🥛';
                          if (lowerIng.includes('яйц') || lowerIng.includes('яиц')) return '🥚';
                          if (lowerIng.includes('мясо') || lowerIng.includes('куриц') || lowerIng.includes('говядин') || lowerIng.includes('свинин')) return '🍗';
                          if (lowerIng.includes('рыб') || lowerIng.includes('лосос') || lowerIng.includes('треск')) return '🐟';
                          if (lowerIng.includes('овощ') || lowerIng.includes('морков') || lowerIng.includes('лук') || lowerIng.includes('помидор') || lowerIng.includes('огур')) return '🥕';
                          if (lowerIng.includes('фрукт') || lowerIng.includes('яблок') || lowerIng.includes('банан') || lowerIng.includes('груш')) return '🍎';
                          if (lowerIng.includes('ягода') || lowerIng.includes('клубник') || lowerIng.includes('малин') || lowerIng.includes('черник')) return '🫐';
                          if (lowerIng.includes('крупа') || lowerIng.includes('рис') || lowerIng.includes('гречк') || lowerIng.includes('овсян')) return '🌾';
                          if (lowerIng.includes('масло') || lowerIng.includes('жир')) return '🧈';
                          if (lowerIng.includes('сыр') || lowerIng.includes('творог')) return '🧀';
                          if (lowerIng.includes('хлеб') || lowerIng.includes('булка')) return '🍞';
                          if (lowerIng.includes('сахар') || lowerIng.includes('мед') || lowerIng.includes('сироп')) return '🍯';
                          if (lowerIng.includes('соль') || lowerIng.includes('перец') || lowerIng.includes('специ')) return '🧂';
                          if (lowerIng.includes('вода')) return '💧';
                          return '🥄'; // Дефолтный эмодзи
                        };

                        return (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-base flex-shrink-0">{getIngredientEmoji(ingredient)}</span>
                            <span className="flex-1">{ingredient}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {recipe.steps && recipe.steps.length > 0 && (
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">👨‍🍳</span>
                      <p className="font-semibold text-sm">Приготовление:</p>
                    </div>
                    <ol className="space-y-2 text-sm">
                      {recipe.steps.map((step, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="flex-1 pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddToFavorites}
                    disabled={isAdding}
                    className="h-8 px-2"
                    title="Добавить в избранное"
                  >
                    <Star className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" disabled title="Поделиться">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddToList}
                    className="h-8 px-2"
                    title="Добавить в список покупок"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-base whitespace-pre-wrap select-none">{displayContent}</p>
            )}
            <p className="text-[10px] opacity-60 mt-1">
              {timestamp.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </motion.div>

        {/* Delete confirmation - bottom sheet style */}
        <AnimatePresence>
          {showDelete && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-[100]"
                onClick={() => setShowDelete(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[101] bg-card rounded-t-3xl p-6 pb-8 shadow-xl"
              >
                <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-7 h-7 text-destructive" />
                  </div>
                  <p className="text-center font-medium text-lg">Удалить сообщение?</p>
                  <p className="text-center text-sm text-muted-foreground">Это действие нельзя отменить</p>
                  <div className="flex gap-3 w-full mt-2">
                    <Button
                      variant="secondary"
                      onClick={() => setShowDelete(false)}
                      className="flex-1 py-3 h-auto rounded-xl"
                    >
                      Отмена
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      className="flex-1 py-3 h-auto rounded-xl"
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
