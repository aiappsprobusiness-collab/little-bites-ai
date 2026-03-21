import { useState, useRef, forwardRef, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, ChefHat, Heart, BookOpen, AlertCircle, CalendarPlus } from "lucide-react";
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
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { HelpSectionCard, HelpWarningCard } from "@/components/help-ui";
import { safeError } from "@/utils/safeLogger";
import { getBenefitLabel } from "@/utils/ageCategory";
import { buildRecipeShareTextShort, SHARE_APP_URL } from "@/utils/shareRecipeText";
import { ChatRecipeCard } from "@/components/chat/ChatRecipeCard";
import { SystemHintCard } from "@/components/chat/SystemHintCard";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import type { SystemHintRoute } from "@/utils/chatRouteFallback";
import { ShareIosIcon } from "@/components/icons/ShareIosIcon";
import {
  trackUsageEvent,
  generateShareRef,
  getShareChannelFromContext,
  getShortShareUrl,
  saveShareRef,
  getShareRecipeUrl,
} from "@/utils/usageEvents";

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
  /** Профиль в карусели: id члена или "family" — тон текста блока пользы */
  selectedProfileId?: string | null;
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
  /** Ответ-отказ по аллергии/dislike: скрываем кнопки лайк, шэринг, в план */
  isBlockedRefusal?: boolean;
  /** Системная подсказка (редирект в Помощник / нерелевантность) — рендерить SystemHintCard, без кнопок рецепта */
  systemHintType?: SystemHintRoute;
  topicKey?: string;
  topicTitle?: string;
  topicShortTitle?: string;
  onOpenAssistant?: (topicKey?: string) => void;
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
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  nutrition_goals?: string[] | null;
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
  ({ id, role, content, timestamp, rawContent, expectRecipe, preParsedRecipe, recipeId: recipeIdProp, isStreaming, onDelete, memberId, memberName, ageMonths, selectedProfileId, onOpenArticle, forcePlainText = false, isConsultationMode = false, isBlockedRefusal = false, systemHintType, topicKey, topicTitle, topicShortTitle, onOpenAssistant }, ref) => {
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
    const location = useLocation();
    const planSlotState = (location.state as { fromPlanSlot?: boolean; plannedDate?: string; mealType?: string; memberId?: string } | null) ?? null;

    const [ingredientOverrides, setIngredientOverrides] = useState<Record<number, string>>({});

    const effectiveRecipe = forcePlainText ? null : (preParsedRecipe ?? null);
    /** Редирект в Помощник или нерелевантный ответ — показывать content как есть, не как «ошибку парсинга» */
    const isRedirectOrIrrelevantContent =
      role === "assistant" &&
      (content.includes("Этот чат помогает подбирать рецепты") || content.includes("Этот вопрос лучше задать во вкладке «Помощник»"));
    const isRecipeParseFailure =
      !forcePlainText &&
      role === "assistant" &&
      !isRedirectOrIrrelevantContent &&
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
              calories: (effectiveRecipe as { calories?: number | null }).calories ?? null,
              proteins: (effectiveRecipe as { proteins?: number | null }).proteins ?? null,
              fats: (effectiveRecipe as { fats?: number | null }).fats ?? null,
              carbs: (effectiveRecipe as { carbs?: number | null }).carbs ?? null,
              member_id: validChildId,
              child_id: validChildId,
              tags: (effectiveRecipe as { mealType?: string }).mealType
                ? ["chat", `chat_${(effectiveRecipe as { mealType: string }).mealType}`]
                : ["chat"],
              ...((effectiveRecipe as { mealType?: string }).mealType && {
                meal_type: (effectiveRecipe as { mealType: string }).mealType,
              }),
              chef_advice: effectiveRecipe.chefAdvice?.trim() || null,
              advice: effectiveRecipe.advice?.trim() || null,
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
      if (effectiveRecipe?.title) {
        return null;
      }
      return typeof content === "string" ? content + "\n\n— Рецепт из приложения Mom Recipes\n" + SHARE_APP_URL : "";
    }, [effectiveRecipe, content]);

    const handleShare = async () => {
      const rid = recipeId ?? undefined;
      const shareRef = generateShareRef();
      const usedNativeShare = typeof navigator !== "undefined" && !!navigator.share;
      const channel = getShareChannelFromContext(usedNativeShare, false);
      let shareUrl = SHARE_APP_URL;
      if (rid) {
        const saved = await saveShareRef(rid, shareRef);
        shareUrl = saved
          ? getShortShareUrl(shareRef, SHARE_APP_URL)
          : getShareRecipeUrl(rid, channel, shareRef, SHARE_APP_URL);
      }
      const title = effectiveRecipe?.title ?? "Рецепт";
      const textToShare = effectiveRecipe?.title
        ? buildRecipeShareTextShort(title, shareUrl)
        : shareText || "";
      if (!textToShare) return;
      trackUsageEvent("share_click", {
        properties: {
          ...(rid ? { recipe_id: rid } : {}),
          share_ref: shareRef,
          channel,
          source_screen: "chat",
        },
      });
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title,
            text: textToShare,
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
          await navigator.clipboard.writeText(textToShare);
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
            const isSystemHint = role === "assistant" && !!systemHintType;
            const Wrapper = isConsultationBubble ? HelpSectionCard : "div";
            const wrapperClassName = isSystemHint
              ? "relative max-w-full"
              : isConsultationBubble
                ? "rounded-2xl rounded-bl-sm border border-border bg-card shadow-soft p-4"
                : role === "user"
                  ? "relative px-3.5 py-2.5 text-xs bg-primary text-primary-foreground rounded-full rounded-br-sm break-words leading-snug"
                  : role === "assistant" && effectiveRecipe
                    ? "relative p-0 overflow-visible"
                    : role === "assistant" && isStreaming
                      ? "relative py-2 pr-3 pl-1 min-w-0 bg-transparent border-0 shadow-none"
                      : "relative p-3 rounded-2xl bg-card border border-border shadow-soft";
            return (
              <Wrapper className={wrapperClassName}>
            {role === "assistant" && systemHintType ? (
              <SystemHintCard
                text={content}
                topicKey={topicKey}
                topicShortTitle={topicShortTitle}
                onOpenAssistant={onOpenAssistant}
                actionSlot={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDelete(true);
                    }}
                    className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all active:scale-95"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                }
                timestamp={timestamp}
              />
            ) : role === "assistant" && showParseError ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Не удалось распознать рецепт. Попробуйте уточнить запрос.</p>
                {rawContent?.trim() && !rawContent.trim().startsWith("{") && rawContent.length < 500 ? (
                  <p className="text-[10px] opacity-80 pt-0.5 border-t border-border/50 mt-1">{rawContent.trim().slice(0, 300)}</p>
                ) : null}
              </div>
            ) : role === "assistant" && effectiveRecipe ? (
              <>
                <ChatRecipeCard
                  recipe={effectiveRecipe}
                  ageMonths={ageMonths}
                  selectedProfileId={selectedProfileId ?? null}
                  chatMessageId={id}
                  savedRecipeId={recipeId}
                  showChefTip={showChefTip}
                  ingredientOverrides={ingredientOverrides}
                  onSubstituteClick={() => {
                    toast({
                      title: "Скоро будет доступно",
                      description: "Замена ингредиентов в разработке. Мы дорабатываем эту функцию для вас.",
                    });
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
            {!forcePlainText && !systemHintType && (role !== "assistant" || !isStreaming) && (
            <p className={`text-xs mt-1.5 ${role === "user" ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
              {timestamp.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            )}
            {role === "assistant" && !isStreaming && !isConsultationMode && !systemHintType && (
              <div
                className="flex flex-row items-center justify-between gap-2 mt-3 pt-3 border-t border-border/50 shrink-0"
                style={{ touchAction: "manipulation" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {!isBlockedRefusal ? (
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
                      disabled={!(effectiveRecipe?.title || shareText)}
                      className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
                      title="Поделиться"
                    >
                      <ShareIosIcon className="h-4 w-4" />
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
                ) : (
                  <div />
                )}
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

        <ConfirmActionModal
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Удалить сообщение?"
          description="Это действие нельзя отменить"
          confirmText="Удалить"
          cancelText="Отмена"
          onConfirm={handleDelete}
        />

        {addToPlanOpen && recipeId && isValidRecipeId(recipeId) && effectiveRecipe && (
          <AddToPlanSheet
            open={addToPlanOpen}
            onOpenChange={setAddToPlanOpen}
            recipeId={recipeId}
            recipeTitle={effectiveRecipe.title ?? "Рецепт"}
            mealType={
              planSlotState?.fromPlanSlot && planSlotState?.mealType
                ? planSlotState.mealType
                : (effectiveRecipe as { mealType?: string }).mealType ?? null
            }
            defaultMemberId={
              planSlotState?.fromPlanSlot && planSlotState?.memberId != null
                ? planSlotState.memberId
                : chatMemberId
            }
            defaultDayKey={
              planSlotState?.fromPlanSlot && planSlotState?.plannedDate
                ? planSlotState.plannedDate
                : undefined
            }
            targetSlot={
              planSlotState?.fromPlanSlot && planSlotState?.plannedDate && planSlotState?.mealType
                ? { dayKey: planSlotState.plannedDate, mealType: planSlotState.mealType }
                : null
            }
            onSuccess={() => toast({ title: "Добавлено в план" })}
          />
        )}
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
