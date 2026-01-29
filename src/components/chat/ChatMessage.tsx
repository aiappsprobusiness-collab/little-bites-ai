import { useState, useRef, forwardRef, useMemo } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Trash2, ChefHat, Clock, Heart, ShoppingCart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useFavorites } from "@/hooks/useFavorites";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
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

    // Fallback: парсим форматированный текст (как от formatRecipeResponse) — для сообщений из истории
    const fromFormatted = parseRecipeFromFormattedText(content);
    if (fromFormatted) return fromFormatted;
  } catch (e) {
    // Не JSON или невалидный JSON - возвращаем null
    return null;
  }

  return null;
}

/**
 * Парсит рецепт из форматированного текста (🍽️ **Title**, 🥘 **Ингредиенты:**, 👨‍🍳 **Приготовление:**).
 * Нужно для сообщений из истории, где сохраняется только отформатированный текст.
 */
function parseRecipeFromFormattedText(text: string): Recipe | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const titleMatch = trimmed.match(/(?:🍽️\s*)?\*\*([^*]+)\*\*/);
  const title = titleMatch ? titleMatch[1].trim() : null;
  if (!title) return null;

  const timeMatch = trimmed.match(/⏱️\s*Время приготовления:\s*(\d+)\s*мин/);
  const cookingTime = timeMatch ? parseInt(timeMatch[1], 10) : undefined;

  const ingredients: string[] = [];
  const ingsSection = trimmed.match(/(?:🥘\s*)?\*\*Ингредиенты:\*\*\s*\n([\s\S]*?)(?=(?:👨‍🍳\s*)?\*\*Приготовление:\*\*|$)/i);
  if (ingsSection && ingsSection[1]) {
    ingsSection[1].trim().split(/\n/).forEach((line) => {
      const cleaned = line.replace(/^\d+\.\s*/, '').replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]*/u, '').trim();
      if (cleaned) ingredients.push(cleaned);
    });
  }

  const steps: string[] = [];
  const stepsSection = trimmed.match(/(?:👨‍🍳\s*)?\*\*Приготовление:\*\*\s*\n([\s\S]*?)$/i);
  if (stepsSection && stepsSection[1]) {
    stepsSection[1].trim().split(/\n/).forEach((line) => {
      const cleaned = line.replace(/^\d+\.\s*/, '').trim();
      if (cleaned) steps.push(cleaned);
    });
  }

  return {
    title,
    ingredients: ingredients.length ? ingredients : undefined,
    steps: steps.length ? steps : undefined,
    cookingTime,
  };
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
    const [showShoppingModal, setShowShoppingModal] = useState(false);
    const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());
    const x = useMotionValue(0);
    const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
    const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);
    const constraintsRef = useRef(null);
    const { addFavorite, isAdding } = useFavorites();
    const { addItem, createList, activeList } = useShoppingLists();
    const favorites = useAppStore((s) => s.favorites);
    const addToAppStoreFavorite = useAppStore((s) => s.addFavorite);
    const setFavoriteRemoteId = useAppStore((s) => s.setFavoriteRemoteId);
    const addToAppStoreShoppingList = useAppStore((s) => s.addToShoppingList);
    const { toast } = useToast();

    const sourceForParse = (rawContent ?? content).trim();
    const recipe = role === "assistant" ? parseRecipeFromContent(sourceForParse) : null;
    const displayContent = recipe ? formatRecipe(recipe) : content;

    const isFavorite =
      !!recipe &&
      favorites.some(
        (f) => f.recipe.title?.toLowerCase().trim() === recipe.title?.toLowerCase().trim()
      );

    const handleAddToFavorites = async () => {
      if (!recipe) return;
      if (isFavorite) return;
      const recipeSuggestion: RecipeSuggestion = {
        title: recipe.title,
        description: recipe.description || "",
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        cookingTime: recipe.cookingTime || 0,
        ageRange: recipe.ageRange || "",
      };
      const localId = addToAppStoreFavorite(recipeSuggestion);
      try {
        const saved = await addFavorite({ recipe: recipeSuggestion, memberIds: [] });
        if (saved?.id) {
          setFavoriteRemoteId(localId, saved.id);
        }
      } catch {
        // локально уже добавлен
      }
      toast({ title: "Добавлено в избранное" });
    };

    const openShoppingModal = () => {
      if (!recipe?.ingredients?.length) return;
      setSelectedIngredients(new Set(recipe.ingredients.map((_, i) => i)));
      setShowShoppingModal(true);
    };

    const toggleIngredient = (index: number) => {
      setSelectedIngredients((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    };

    const handleAddToList = async () => {
      if (!recipe?.ingredients?.length) return;
      const toAdd = recipe.ingredients.filter((_, i) => selectedIngredients.has(i));
      if (toAdd.length === 0) {
        toast({ title: "Выберите ингредиенты", variant: "destructive" });
        return;
      }
      addToAppStoreShoppingList(toAdd, recipe.title);
      try {
        let listId = activeList?.id;
        if (!listId) {
          const list = await createList("Список покупок");
          listId = list?.id;
        }
        if (!listId) throw new Error("Нет активного списка");
        for (const raw of toAdd) {
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
        setShowShoppingModal(false);
        toast({ title: "В список покупок", description: `Добавлено ${toAdd.length} ингредиент(ов) из «${recipe.title}»` });
      } catch (e: any) {
        setShowShoppingModal(false);
        toast({ title: "В список покупок", description: `Добавлено ${toAdd.length} ингредиент(ов) в локальный список` });
      }
    };

    const shareText = useMemo(() => {
      const base = recipe ? formatRecipe(recipe) : typeof content === "string" ? content : "";
      const title = recipe?.title ?? "Рецепт";
      const appMention = "\n\n— Рецепт из приложения Little Bites";
      return `${title}\n\n${base}${appMention}`;
    }, [recipe, content]);

    const handleShare = async () => {
      if (!shareText) return;
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title: recipe?.title ?? "Рецепт",
            text: shareText,
          });
          toast({ title: "Поделиться", description: "Рецепт отправлен" });
        } else {
          const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
          if (!canCopy) {
            toast({
              variant: "destructive",
              title: "Копирование недоступно",
              description: "В этом браузере нельзя скопировать рецепт. Скопируйте вручную.",
            });
            return;
          }
          await navigator.clipboard.writeText(shareText);
          toast({ title: "Рецепт скопирован для отправки" });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          toast({ variant: "destructive", title: "Ошибка", description: e.message || "Не удалось поделиться" });
        }
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
            className={`rounded-2xl px-4 py-3 relative ${role === "user"
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
                <Dialog open={showShoppingModal} onOpenChange={setShowShoppingModal}>
                  <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Добавить в список покупок</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">Выберите ингредиенты для добавления</p>
                    <div className="overflow-y-auto space-y-2 py-2">
                      {recipe?.ingredients?.map((ing, i) => (
                        <label
                          key={i}
                          className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedIngredients.has(i)}
                            onCheckedChange={() => toggleIngredient(i)}
                          />
                          <span className="text-sm flex-1">{ing}</span>
                        </label>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowShoppingModal(false)}>
                        Отмена
                      </Button>
                      <Button onClick={handleAddToList}>
                        Добавить выбранное
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
            {role === "assistant" && recipe && (
              <div
                className="flex flex-row gap-2 mt-2 pt-2 min-h-[44px] border-t border-border/50 shrink-0"
                style={{ touchAction: "manipulation" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddToFavorites();
                  }}
                  disabled={isAdding}
                  className={`h-9 w-9 rounded-full shrink-0 shadow-sm ${isFavorite ? "text-red-600 bg-red-100 dark:bg-red-950/50 fill-red-600" : ""}`}
                  title="Избранное"
                >
                  <Heart
                    className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`}
                  />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openShoppingModal();
                  }}
                  disabled={!recipe?.ingredients?.length}
                  className="h-9 w-9 rounded-full shrink-0 shadow-sm"
                  title="В список покупок"
                >
                  <ShoppingCart className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleShare();
                  }}
                  disabled={!shareText}
                  className="h-9 w-9 rounded-full shrink-0 shadow-sm"
                  title="Поделиться"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            )}
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
