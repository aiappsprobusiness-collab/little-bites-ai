import { useState, useRef, forwardRef, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, ChefHat, Heart, Share2, BookOpen, AlertCircle, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useRecipes } from "@/hooks/useRecipes";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  extractFirstJsonObjectFromStart,
  isIngredientObject,
  type ParsedIngredient,
  type IngredientWithSubstitute,
} from "@/utils/parseChatRecipes";
import { ingredientDisplayLabel, type IngredientItem } from "@/types/recipe";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { IngredientSubstituteSheet } from "@/components/recipe/IngredientSubstituteSheet";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { HelpSectionCard, HelpWarningCard } from "@/components/help-ui";
import { safeError } from "@/utils/safeLogger";
import { getBenefitLabel } from "@/utils/ageCategory";
import { SHARE_APP_URL } from "@/utils/shareRecipeText";
import { ChatRecipeCard } from "@/components/chat/ChatRecipeCard";

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

/** Разбивает текст ответа Help на основной блок и блок "К врачу" / "Когда к врачу" / "Срочно к врачу" (если есть). */
function splitHelpContent(content: string): { main: string; doctorPart: string | null } {
  const re = /(?:^|\n)\s*(?:\*\*)?(?:К\s+врачу\s*:?|Когда\s+к\s+врачу|Срочно\s+к\s+врачу|К\s+врачу\s+если)(?:\*\*)?\s*:?\s*\n/i;
  const match = content.match(re);
  if (!match) return { main: content.trim(), doctorPart: null };
  const idx = content.indexOf(match[0]);
  const main = content.slice(0, idx).trim();
  const doctorPart = content.slice(idx + match[0].length).trim();
  return { main, doctorPart: doctorPart || null };
}

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
  onDelete: (id: string) => void;
  /** true = ответ должен быть рецептом (JSON); при null от парсера показываем ошибку, не текст */
  expectRecipe?: boolean;
  /** Контекст члена семьи для сохранения в избранное */
  memberId?: string;
  memberName?: string;
  /** Возраст выбранного члена (мес.) для подписи «Польза»: ребёнок / взрослый / нейтрально */
  ageMonths?: number | null;
  /** При клике на ссылку «Читать статью» в ответе ИИ (база знаний) */
  onOpenArticle?: (articleId: string) => void;
  /** Уже распарсенный рецепт (из parseRecipesFromChat), чтобы не показывать «Данные повреждены» при расхождении парсеров */
  preParsedRecipe?: Recipe | null;
  /** ID рецепта в БД (от ChatPage после saveRecipesFromChat), для favorites_v2.recipe_id */
  recipeId?: string | null;
  /** true = ответ ещё стримится; не показываем ошибку парсинга до завершения */
  isStreaming?: boolean;
  /** В режиме help: всегда показывать сообщение как текст, без парсинга рецептов и без RecipeCard */
  forcePlainText?: boolean;
  /** Режим консультации (Help Chat): карточка рекомендации, без action icons */
  isConsultationMode?: boolean;
}

type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

interface Recipe {
  title: string;
  description?: string;
  ingredients?: ParsedIngredient[];
  steps?: string[];
  cookingTime?: number;
  ageRange?: string;
  /** Premium: совет от шефа */
  chefAdvice?: string;
  /** Free: короткий мини-совет (поле advice в JSON) */
  advice?: string;
  familyServing?: string;
  mealType?: MealType;
}

/** Чат = child_only: НЕ показываем familyServing (Адаптация для ребёнка/взрослых). */
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

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
      formatted += `${index + 1}. ${typeof ing === "string" ? ing : ingredientDisplayLabel(ing as unknown as IngredientItem)}\n`;
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

const RECIPE_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidRecipeId(v: string): boolean {
  return typeof v === "string" && v.length > 0 && RECIPE_UUID_REGEX.test(v);
}

export const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ id, role, content, timestamp, rawContent, expectRecipe, preParsedRecipe, recipeId: recipeIdProp, isStreaming, onDelete, memberId, memberName, ageMonths, onOpenArticle, forcePlainText = false, isConsultationMode = false }, ref) => {
    const [showDelete, setShowDelete] = useState(false);
    const [localRecipeId, setLocalRecipeId] = useState<string | null>(null);
    const [addToPlanOpen, setAddToPlanOpen] = useState(false);
    const { user } = useAuth();
    const { isPremium, isTrial, favoritesLimit, hasAccess } = useSubscription();
    const showChefTip = isPremium || isTrial;
    const { favorites, isFavorite: isFavoriteFn, toggleFavorite, isToggling } = useFavorites("all");
    const { createRecipe } = useRecipes();
    const chatMemberId = memberId ?? null;
    const setShowPaywall = useAppStore((s) => s.setShowPaywall);
    const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
    const { toast } = useToast();

    const [ingredientOverrides, setIngredientOverrides] = useState<Record<number, string>>({});
    const [substituteSheet, setSubstituteSheet] = useState<{
      open: boolean;
      idx: number;
      ing: ParsedIngredient;
    } | null>(null);

    const effectiveRecipe = forcePlainText ? null : (preParsedRecipe ?? null);
    const isRecipeParseFailure =
      !forcePlainText &&
      role === "assistant" &&
      (expectRecipe === true || (rawContent != null && rawContent.trim().length > 0)) &&
      effectiveRecipe === null;
    /** Ошибку показываем только после завершения стрима; во время генерации — loader, без мигания */
    const showParseError = !isStreaming && isRecipeParseFailure;
    const hasSubstitutes = isPremium && effectiveRecipe?.ingredients?.some((ing) => isIngredientObject(ing) && (ing as { substitute?: string }).substitute);
    // Для отображения: в forcePlainText (help) показываем как есть; иначе убираем ведущий JSON
    const displayContent =
      role === "assistant"
        ? (forcePlainText ? content : getTextForDisplay(content))
        : content;
    const displayWithArticleLinks =
      role === "assistant" && onOpenArticle ? injectArticleLinks(displayContent) : displayContent;

    const recipeId = recipeIdProp ?? localRecipeId;
    const isFavorite = !!(recipeId && isValidRecipeId(recipeId) && isFavoriteFn(recipeId, chatMemberId));

    if (import.meta.env.DEV && effectiveRecipe) {
      const hasChefAdvice = !!(effectiveRecipe.chefAdvice && effectiveRecipe.chefAdvice.trim());
      console.log("[DEBUG render]", {
        keyUsed: id,
        recipeId: recipeId ?? undefined,
        likedComputed: isFavorite,
        isPremium,
        isTrial,
        showChefTip,
        hasChefAdvice,
        chefAdviceLen: effectiveRecipe.chefAdvice?.length ?? 0,
        recipeKeys: Object.keys(effectiveRecipe),
      });
    }

    const handleToggleFavorite = async () => {
      if (!effectiveRecipe) return;
      if (isFavorite) {
        try {
          if (recipeId && isValidRecipeId(recipeId)) {
            await toggleFavorite({ recipeId, memberId: chatMemberId, isFavorite: false });
          }
          toast({ title: "Удалено из избранного" });
        } catch (e: unknown) {
          safeError("ChatMessage removeFavorite:", (e as Error).message);
          toast({ title: "Не удалось удалить из избранного", variant: "destructive", description: (e as Error).message });
        }
        return;
      }
      // Free: лимит 10 избранных
      if (!showChefTip && favorites.length >= (favoritesLimit ?? 10)) {
        setPaywallCustomMessage("Добавьте всю семью в Premium — безлимитное избранное и история.");
        setShowPaywall(true);
        return;
      }
      let idToFavorite = recipeId && isValidRecipeId(recipeId) ? recipeId : null;
      if (!idToFavorite) {
        try {
          const validChildId =
            memberId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId)
              ? memberId
              : null;
          const cookingMinutes =
            effectiveRecipe.cookingTime != null
              ? Math.floor(typeof effectiveRecipe.cookingTime === "number" ? effectiveRecipe.cookingTime : parseInt(String(effectiveRecipe.cookingTime), 10))
              : null;
          const newRecipe = await createRecipe({
            source: "chat_ai",
            recipe: {
              title: effectiveRecipe.title,
              description: effectiveRecipe.description || "Рецепт предложен AI ассистентом",
              cooking_time_minutes: Number.isFinite(cookingMinutes) ? cookingMinutes : null,
              member_id: validChildId,
              child_id: validChildId,
              tags: (effectiveRecipe as { mealType?: string }).mealType
                ? ["chat", `chat_${(effectiveRecipe as { mealType: string }).mealType}`]
                : ["chat"],
              ...((effectiveRecipe as { mealType?: string }).mealType && {
                meal_type: (effectiveRecipe as { mealType: string }).mealType,
              }),
            },
            ingredients: (effectiveRecipe.ingredients || []).map((ing, index) => {
              const o = typeof ing === "object" && ing && "name" in ing ? (ing as { name: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null; substitute?: string }) : null;
              const nameStr = o?.name ?? (typeof ing === "string" ? ing : String(ing));
              const displayText = o?.display_text;
              const canonical = o?.canonical_amount != null && (o?.canonical_unit === "g" || o?.canonical_unit === "ml") ? { amount: o.canonical_amount, unit: o.canonical_unit as "g" | "ml" } : null;
              return {
                name: nameStr,
                display_text: displayText ?? null,
                canonical_amount: canonical?.amount ?? null,
                canonical_unit: canonical?.unit ?? null,
                amount: null,
                unit: null,
                category: "other" as const,
                order_index: index,
                ...(o?.substitute != null && o.substitute !== "" && { substitute: String(o.substitute) }),
              };
            }),
            steps: (effectiveRecipe.steps || []).map((step, index) => ({
              instruction: step,
              step_number: index + 1,
              duration_minutes: null,
              image_url: null,
            })),
          });
          idToFavorite = newRecipe.id;
          setLocalRecipeId(newRecipe.id);
        } catch (e: unknown) {
          safeError("ChatMessage createRecipe:", (e as Error).message);
          toast({ title: "Не удалось добавить в избранное", variant: "destructive", description: (e as Error).message });
          return;
        }
      }
      try {
        const preview = {
          title: effectiveRecipe.title,
          description: effectiveRecipe.description ?? null,
          cookTimeMinutes: effectiveRecipe.cookingTime ?? null,
          ingredientNames: (effectiveRecipe.ingredients || []).map((ing) =>
            typeof ing === "string" ? ing : (ing as { name?: string }).name ?? ""
          ),
          chefAdvice: effectiveRecipe.chefAdvice ?? null,
          advice: effectiveRecipe.advice ?? null,
        };
        await toggleFavorite({
          recipeId: idToFavorite!,
          memberId: chatMemberId,
          isFavorite: true,
          recipeData: {
            title: effectiveRecipe.title,
            description: effectiveRecipe.description ?? null,
            cookTimeMinutes: effectiveRecipe.cookingTime ?? null,
            ingredientNames: (effectiveRecipe.ingredients || []).map((ing) =>
              typeof ing === "string" ? ing : (ing as { name?: string }).name ?? ""
            ),
            chefAdvice: effectiveRecipe.chefAdvice ?? null,
            advice: effectiveRecipe.advice ?? null,
          },
        });
        toast({ title: "Добавлено в избранное" });
      } catch (e: unknown) {
        safeError("ChatMessage toggleFavorite:", (e as Error).message);
        toast({ title: "Не удалось добавить в избранное", variant: "destructive", description: (e as Error).message });
      }
    };

    const shareText = useMemo(() => {
      const base = effectiveRecipe ? formatRecipe(effectiveRecipe) : typeof content === "string" ? content : "";
      const footer = "\n\n— Рецепт из приложения Mom Recipes\n" + SHARE_APP_URL;
      return `${base}${footer}`;
    }, [effectiveRecipe, content]);

    const handleShare = async () => {
      if (!shareText) return;
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title: effectiveRecipe?.title ?? "Рецепт",
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

    const handleDelete = () => {
      onDelete(id);
      setShowDelete(false);
    };

    return (
      <div
        ref={ref}
        data-message-id={id}
        className={`relative flex ${role === "user" ? "justify-end" : "justify-start"} ${role === "assistant" && effectiveRecipe ? "scroll-mt-[60px]" : ""}`}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          exit={{ opacity: 0 }}
          className={`relative ${role === "user" ? "max-w-[80%]" : "max-w-[96%]"}`}
        >
          {(() => {
            const isConsultationBubble = role === "assistant" && forcePlainText;
            const Wrapper = isConsultationBubble ? HelpSectionCard : "div";
            const wrapperClassName = isConsultationBubble
              ? "rounded-2xl rounded-bl-sm border border-border bg-card shadow-soft p-4"
              : role === "user"
                ? "relative px-3.5 py-2.5 text-xs bg-primary text-primary-foreground rounded-full rounded-br-sm break-words leading-snug"
                : role === "assistant" && effectiveRecipe
                  ? "relative p-0 overflow-visible"
                  : "relative p-3 rounded-2xl bg-card border border-border shadow-soft";
            return (
              <Wrapper className={wrapperClassName}>
            {role === "assistant" && showParseError ? (
              <p className="text-xs text-muted-foreground">Не удалось распознать рецепт. Попробуйте уточнить запрос.</p>
            ) : role === "assistant" && effectiveRecipe ? (
              <>
                <ChatRecipeCard
                  recipe={effectiveRecipe}
                  ageMonths={ageMonths}
                  showChefTip={showChefTip}
                  ingredientOverrides={ingredientOverrides}
                  onSubstituteClick={(idx, ing) => setSubstituteSheet({ open: true, idx, ing })}
                />
                <IngredientSubstituteSheet
                  open={!!substituteSheet?.open}
                  onOpenChange={(open) => setSubstituteSheet((s) => (s ? { ...s, open } : null))}
                  ingredientName={typeof substituteSheet?.ing === "string" ? substituteSheet.ing : (substituteSheet?.ing as IngredientWithSubstitute)?.name ?? ""}
                  substituteFromDb={isIngredientObject(substituteSheet?.ing ?? null) ? (substituteSheet?.ing as IngredientWithSubstitute).substitute : undefined}
                  onSelect={(replacement) => {
                    if (substituteSheet != null) {
                      setIngredientOverrides((prev) => ({ ...prev, [substituteSheet.idx]: replacement }));
                      toast({ title: "Ингредиент заменён" });
                    }
                  }}
                />
              </>
            ) : role === "assistant" ? (
              <div className={`chat-message-content text-xs select-none prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-p:text-foreground prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-foreground prose-strong:text-foreground [&>*]:text-foreground ${forcePlainText ? "consultationCard-inner" : ""}`}>
                {forcePlainText ? (() => {
                  const { main, doctorPart } = splitHelpContent(displayWithArticleLinks);
                  const markdownProps = {
                    remarkPlugins: [remarkGfm] as const,
                    components: {
                      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
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
                    },
                  };
                  return (
                    <>
                      <ReactMarkdown {...markdownProps}>{main}</ReactMarkdown>
                      {doctorPart != null && (
                        <HelpWarningCard
                          className="mt-3"
                          icon={<AlertCircle className="w-4 h-4 text-primary shrink-0" aria-hidden />}
                        >
                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&>*]:text-typo-muted">
                            <ReactMarkdown {...markdownProps}>{doctorPart}</ReactMarkdown>
                          </div>
                        </HelpWarningCard>
                      )}
                      <p className="consultationDisclaimer">Это справочная информация.</p>
                    </>
                  );
                })() : (
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
                )}
              </div>
            ) : (
              <p className="text-typo-muted whitespace-pre-wrap select-none leading-snug break-words">{displayContent}</p>
            )}
            {!forcePlainText && (
            <p className={`text-xs mt-1.5 ${role === "user" ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
              {timestamp.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            )}
            {role === "assistant" && !isStreaming && !isConsultationMode && (
              <div
                className="flex flex-row items-center justify-between gap-2 mt-3 pt-3 border-t border-border/50 shrink-0"
                style={{ touchAction: "manipulation" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                <div className="flex flex-row gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleFavorite();
                    }}
                    disabled={isToggling}
                    className={`h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-all active:scale-95 ${isFavorite
                      ? "text-primary bg-primary/10 border border-primary/20 fill-primary"
                      : "text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground"
                      }`}
                    title="В избранное"
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleShare();
                    }}
                    disabled={!shareText}
                    className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
                    title="Поделиться"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  {hasAccess ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (recipeId && isValidRecipeId(recipeId)) setAddToPlanOpen(true);
                      }}
                      disabled={!recipeId || !isValidRecipeId(recipeId)}
                      className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
                      title="В план"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPaywallCustomMessage("Добавление в план доступно в Premium.");
                        setShowPaywall(true);
                      }}
                      className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all active:scale-95"
                      title="В план (Premium)"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDelete(true);
                  }}
                  className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all active:scale-95"
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
              </Wrapper>
            );
          })()}
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
                  <p className="text-center font-semibold text-typo-title">Удалить сообщение?</p>
                  <p className="text-center text-typo-muted text-muted-foreground">Это действие нельзя отменить</p>
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

        {addToPlanOpen && recipeId && isValidRecipeId(recipeId) && effectiveRecipe && (
          <AddToPlanSheet
            open={addToPlanOpen}
            onOpenChange={setAddToPlanOpen}
            recipeId={recipeId}
            recipeTitle={effectiveRecipe.title ?? "Рецепт"}
            mealType={(effectiveRecipe as { mealType?: string }).mealType ?? null}
            defaultMemberId={chatMemberId}
            onSuccess={() => toast({ title: "Добавлено в план" })}
          />
        )}
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
