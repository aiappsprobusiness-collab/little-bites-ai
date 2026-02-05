import { useState, useRef, forwardRef, useMemo } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Trash2, ChefHat, Clock, Heart, Share2, BookOpen, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";
import type { RecipeSuggestion } from "@/services/deepseek";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  parseRecipeFromPlainText,
  extractFirstJsonObjectFromStart,
  extractSingleJsonObject,
  isIngredientObject,
  ingredientDisplayText,
  type ParsedIngredient,
  type IngredientWithSubstitute,
} from "@/utils/parseChatRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const UUID_REGEX = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/** Убирает ведущий JSON (сырой или в блоке ```json) из ответа ИИ — в чате только читаемый текст. */
function getTextForDisplay(content: string): string {
  let t = content.trim();
  // Удаляем ведущий code block ```json ... ``` или ``` ... ```
  t = t.replace(/^```(?:json)?\s*\n[\s\S]*?```\s*/i, "").trim();
  // Удаляем сырой JSON в начале
  if (t.startsWith("{")) {
    const jsonStr = extractFirstJsonObjectFromStart(t);
    if (jsonStr) {
      const idx = t.indexOf(jsonStr);
      t = t.slice(idx + jsonStr.length).trim();
    }
  }
  return t || content;
}

/** Заменяет [uuid] на markdown-ссылку article:uuid для рендера кнопки «Читать статью». */
function injectArticleLinks(text: string): string {
  return text.replace(UUID_REGEX, (_, id) => `[Читать статью](article:${id})`);
}

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
  onDelete: (id: string) => void;
  /** Контекст члена семьи для сохранения в избранное */
  memberId?: string;
  memberName?: string;
  /** При клике на ссылку «Читать статью» в ответе ИИ (база знаний) */
  onOpenArticle?: (articleId: string) => void;
}

interface Recipe {
  title: string;
  description?: string;
  ingredients?: ParsedIngredient[];
  steps?: string[];
  cookingTime?: number;
  ageRange?: string;
  chefAdvice?: string;
  familyServing?: string;
}

/** Заголовки секций, которые не должны попадать в массив шагов. */
const STEP_HEADER_PATTERNS = /^(Пошаговое приготовление|Приготовление|Инструкция|Шаги|Рецепт|Как приготовить)$/i;

function filterStepHeaders(steps: string[]): string[] {
  return steps.filter(
    (s) => s.trim().length > 0 && !STEP_HEADER_PATTERNS.test(s.trim())
  );
}

/** Убирает префиксы "Шаг 1:", "Инструкция:", "Ингредиенты:" и отбрасывает пустые/заголовочные строки. */
const STEP_PREFIX_REGEX = /^\s*(Шаг\s*\d+\s*[:\.]?|Инструкция\s*[:\.]?|Ингредиенты\s*[:\.]?)\s*/iu;

function cleanStepLines(steps: string[]): string[] {
  return steps
    .map((s) => s.replace(STEP_PREFIX_REGEX, "").trim())
    .filter((s) => s.length > 0 && !STEP_HEADER_PATTERNS.test(s));
}

function normalizeIngredients(raw: unknown): ParsedIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item && typeof (item as { name: string }).name === "string") {
        const o = item as { name: string; amount?: string; substitute?: string };
        return { name: o.name, amount: o.amount, substitute: o.substitute };
      }
      return String(item);
    })
    .filter((ing) => {
      const text = typeof ing === "string" ? ing : (ing as { name?: string }).name ?? "";
      return String(text).trim().length >= 2;
    });
}

/**
 * Парсит JSON рецепт из текста сообщения
 */
function parseRecipeFromContent(content: string): Recipe | null {
  try {
    // Ответ начинается с JSON (формат «сначала JSON, потом текст») — берём только первый объект
    if (content.trim().startsWith("{")) {
      const jsonStr = extractFirstJsonObjectFromStart(content);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.title || parsed.name) {
            const ings = normalizeIngredients(parsed.ingredients);
            const rawSteps = Array.isArray(parsed.steps)
              ? parsed.steps.map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
              : [];
            const steps = cleanStepLines(filterStepHeaders(rawSteps));
            return {
              title: parsed.title || parsed.name,
              description: parsed.description,
              ingredients: ings,
              steps,
              cookingTime: parsed.cookingTime || parsed.cooking_time,
              ageRange: parsed.ageRange || "",
              chefAdvice: parsed.chefAdvice,
              familyServing: parsed.familyServing,
            };
          }
          if (Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
            const r = parsed.recipes[0];
            const rawStepsR = Array.isArray(r.steps)
              ? r.steps.map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
              : [];
            const stepsR = cleanStepLines(filterStepHeaders(rawStepsR));
            return {
              title: r.title || r.name,
              description: r.description,
              ingredients: normalizeIngredients(r.ingredients),
              steps: stepsR,
              cookingTime: r.cookingTime || r.cooking_time,
              ageRange: r.ageRange || "",
              chefAdvice: r.chefAdvice,
              familyServing: r.familyServing,
            };
          }
        } catch {
          // fallback ниже
        }
      }
    }

    // Ищем JSON в code blocks - используем greedy quantifier для захвата всего содержимого
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const jsonStr = codeBlockMatch[1].trim();
      // Проверяем что это JSON объект
      if (jsonStr.startsWith('{')) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.title || parsed.name) {
            const rawStepsCb = Array.isArray(parsed.steps)
              ? parsed.steps.map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
              : [];
            const stepsCb = cleanStepLines(filterStepHeaders(rawStepsCb));
            return {
              title: parsed.title || parsed.name,
              description: parsed.description,
              ingredients: normalizeIngredients(parsed.ingredients),
              steps: stepsCb,
              cookingTime: parsed.cookingTime || parsed.cooking_time,
              ageRange: parsed.ageRange || '',
              chefAdvice: parsed.chefAdvice,
              familyServing: parsed.familyServing,
            };
          }
          if (Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
            const recipe = parsed.recipes[0];
            const rawStepsCb2 = Array.isArray(recipe.steps)
              ? recipe.steps.map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
              : [];
            const stepsCb2 = cleanStepLines(filterStepHeaders(rawStepsCb2));
            return {
              title: recipe.title || recipe.name,
              description: recipe.description,
              ingredients: normalizeIngredients(recipe.ingredients),
              steps: stepsCb2,
              cookingTime: recipe.cookingTime || recipe.cooking_time,
              ageRange: recipe.ageRange || '',
              chefAdvice: recipe.chefAdvice,
              familyServing: recipe.familyServing,
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

    // Если не нашли в code block, ищем один полный JSON-объект (игнорируем текст до/после)
    const jsonStr = extractSingleJsonObject(content);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.title || parsed.name) {
          const rawStepsSm = Array.isArray(parsed.steps)
            ? parsed.steps.map((s: unknown) => (typeof s === "string" ? s : (s as { instruction?: string })?.instruction ?? String(s)))
            : [];
          const stepsSm = cleanStepLines(filterStepHeaders(rawStepsSm));
          return {
            title: parsed.title || parsed.name,
            description: parsed.description,
            ingredients: normalizeIngredients(parsed.ingredients),
            steps: stepsSm,
            cookingTime: parsed.cookingTime || parsed.cooking_time,
            ageRange: parsed.ageRange || '',
            chefAdvice: parsed.chefAdvice,
            familyServing: parsed.familyServing,
          };
        }
      } catch {
        // Невалидный JSON
      }
    }

    // Fallback: парсим форматированный текст (как от formatRecipeResponse) — для сообщений из истории
    const fromFormatted = parseRecipeFromFormattedText(content);
    if (fromFormatted) return fromFormatted;

    // Fallback: обычный текст без JSON — название (эмодзи/капс) и ингредиенты (1., 2., 3. или -)
    const fromPlain = parseRecipeFromPlainText(content);
    if (fromPlain)
      return {
        title: fromPlain.title,
        description: fromPlain.description,
        ingredients: fromPlain.ingredients,
        steps: fromPlain.steps,
        cookingTime: fromPlain.cookingTime,
        ageRange: undefined,
      };
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
 * Форматирует рецепт в красивый вид (для шаринга и т.д.)
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
    recipe.ingredients.forEach((ing, index) => {
      formatted += `${index + 1}. ${ingredientDisplayText(ing)}\n`;
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
  ({ id, role, content, timestamp, rawContent, onDelete, memberId, memberName, onOpenArticle }, ref) => {
    const [showDelete, setShowDelete] = useState(false);
    const x = useMotionValue(0);
    const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
    const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);
    const constraintsRef = useRef(null);
    const { user } = useAuth();
    const { isPremium } = useSubscription();
    const { favorites, addFavorite, removeFavorite, isAdding, isRemoving } = useFavorites();
    const { toast } = useToast();

    const sourceForParse = (rawContent ?? content).trim();
    const recipe = role === "assistant" ? parseRecipeFromContent(sourceForParse) : null;
    const hasSubstitutes = isPremium && recipe?.ingredients?.some((ing) => isIngredientObject(ing) && (ing as { substitute?: string }).substitute);
    // Для отображения: убираем ведущий JSON, чтобы в чате был только читаемый текст с Markdown
    const displayContent = role === "assistant" ? getTextForDisplay(content) : content;
    const displayWithArticleLinks =
      role === "assistant" && onOpenArticle ? injectArticleLinks(displayContent) : displayContent;

    const favoriteEntry = recipe
      ? favorites.find((f) => f.recipe.title?.toLowerCase().trim() === recipe.title?.toLowerCase().trim())
      : null;
    const isFavorite = !!favoriteEntry;

    const handleToggleFavorite = async () => {
      if (!recipe) return;
      if (isFavorite && favoriteEntry) {
        try {
          await removeFavorite(favoriteEntry.id);
          toast({ title: "Удалено из избранного" });
        } catch (e: unknown) {
          console.error("DB Error in ChatMessage removeFavorite:", (e as Error).message);
          toast({ title: "Не удалось удалить из избранного", variant: "destructive" });
        }
        return;
      }
      const recipeSuggestion: RecipeSuggestion = {
        title: recipe.title,
        description: recipe.description || "",
        ingredients: (recipe.ingredients || []).map((ing) => (typeof ing === "string" ? ing : ingredientDisplayText(ing))),
        steps: recipe.steps || [],
        cookingTime: recipe.cookingTime || 0,
        ageRange: recipe.ageRange || "",
      };
      try {
        await addFavorite({ recipe: recipeSuggestion, memberIds: [], memberId, memberName });
        toast({ title: "Добавлено в избранное" });
      } catch (e: unknown) {
        console.error("DB Error in ChatMessage handleAddToFavorites:", (e as Error).message);
        toast({ title: "Не удалось добавить в избранное", variant: "destructive" });
      }
    };

    const shareText = useMemo(() => {
      const base = recipe ? formatRecipe(recipe) : typeof content === "string" ? content : "";
      const appMention = "\n\n— Рецепт из приложения Mom Recipes";
      return `${base}${appMention}`;
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
            className={`relative ${role === "user"
              ? "px-4 py-3 bg-primary text-primary-foreground rounded-full rounded-br-sm"
              : role === "assistant" && recipe
                ? "rounded-bl-sm overflow-hidden px-4 pb-3"
                : "px-4 py-3 bg-card shadow-soft rounded-2xl rounded-bl-sm"
              }`}
          >
            {role === "assistant" && recipe ? (
              /* Карточка рецепта: не выводим ингредиенты текстом, рендерим карточки */
              <div className="bg-white rounded-[40px] p-6 sm:p-8 shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-slate-50 max-w-full">
                <h3 className="text-2xl font-semibold leading-relaxed text-[#2D3436] mb-2">{recipe.title}</h3>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{recipe.description}</p>
                )}
                {recipe.cookingTime != null && recipe.cookingTime > 0 && (
                  <p className="text-xs text-muted-foreground mb-4">⏱️ {recipe.cookingTime} мин</p>
                )}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Ингредиенты</p>
                    <div className="flex flex-wrap gap-2">
                      {recipe.ingredients
                        .map((ing, idx) => {
                          const isObj = isIngredientObject(ing);
                          const name = typeof ing === "string" ? ing : (ing as { name?: string }).name ?? "";
                          const amount = isObj ? (ing as { amount?: string }).amount : "";
                          const displayText = typeof ing === "string" ? ing : `${name}${amount ? ` — ${amount}` : ""}`.trim();
                          if (displayText.length < 2) return null;
                          const substitute = isObj ? (ing as IngredientWithSubstitute).substitute : undefined;
                          const hasSubstitute = !!substitute?.trim();
                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-2 bg-[#F1F5E9]/60 border border-[#6B8E23]/10 rounded-full px-3 py-1.5"
                            >
                              <span className="text-[#2D3436] font-medium text-sm">
                                {displayText}
                              </span>
                              {hasSubstitute && (
                                isPremium ? (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="shrink-0 text-[#6B8E23] p-0.5 rounded-full hover:bg-[#6B8E23]/10" aria-label="Заменить">
                                          <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-[240px]">
                                        <p className="text-xs">{substitute}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="text-muted-foreground shrink-0" title="Доступно в Premium">
                                    <Lock className="w-3 h-3" />
                                  </span>
                                )
                              )}
                            </div>
                          );
                        })
                        .filter(Boolean)}
                    </div>
                  </div>
                )}
                {recipe.steps && recipe.steps.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Приготовление</p>
                    <div className="space-y-5">
                      {recipe.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-3 items-start">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-500">
                            {idx + 1}
                          </span>
                          <span className="text-[#2D3436] leading-relaxed pt-0.5">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(recipe.chefAdvice || recipe.familyServing) && (
                  <div className="space-y-3">
                    {recipe.chefAdvice && (
                      <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100 flex gap-3 items-start">
                        <span className="text-xl shrink-0" aria-hidden>👨‍🍳</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-600 mb-0.5">Секрет шефа</p>
                          <p className="text-sm text-[#2D3436] leading-snug">{recipe.chefAdvice}</p>
                        </div>
                      </div>
                    )}
                    {recipe.familyServing && (
                      <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100 flex gap-3 items-start">
                        <span className="text-xl shrink-0" aria-hidden>👶</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-600 mb-0.5">Адаптация для ребёнка</p>
                          <p className="text-sm text-[#2D3436] leading-snug">{recipe.familyServing}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : role === "assistant" ? (
              <div className="chat-message-content text-sm select-none prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-p:text-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-sm prose-strong:text-sm [&>*]:text-sm px-4 py-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith("article:") && onOpenArticle) {
                        const articleId = href.slice(8);
                        return (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 gap-1.5 mt-1 inline-flex"
                            onClick={(e) => {
                              e.preventDefault();
                              onOpenArticle(articleId);
                            }}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Читать статью
                          </Button>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {displayWithArticleLinks}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-base whitespace-pre-wrap select-none px-4 py-3">{displayContent}</p>
            )}
            <p className="text-[10px] opacity-60 mt-1">
              {timestamp.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {role === "assistant" && (
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
                    handleToggleFavorite();
                  }}
                  disabled={isAdding || isRemoving}
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
