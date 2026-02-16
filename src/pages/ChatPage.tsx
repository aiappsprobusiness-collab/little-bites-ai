import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Send, Loader2, Square, HelpCircle } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Paywall } from "@/components/subscription/Paywall";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { FamilyOnboarding } from "@/components/onboarding/FamilyOnboarding";
import { ArticleReaderModal } from "@/components/articles/ArticleReaderModal";
import { useArticle } from "@/hooks/useArticles";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useChatRecipes } from "@/hooks/useChatRecipes";
import { buildGenerationContext, validateRecipe } from "@/domain/generation";
import type { Profile } from "@/domain/generation";
import { detectMealType, parseRecipesFromChat, parseRecipesFromApiResponse, type ParsedRecipe } from "@/utils/parseChatRecipes";
import { safeError } from "@/utils/safeLogger";
import { getHelpFollowups } from "@/utils/helpFollowups";
import { supabase } from "@/integrations/supabase/client";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

const CHAT_HINT_PHRASES = [
  "Придумай ужин из того, что есть в холодильнике",
  "Что приготовить за 15 минут ребёнку?",
  "Меню на день без сахара и глютена",
  "Полезный десерт для малыша",
];

const HELP_CHAT_STORAGE_KEY = "help_chat_messages_v1";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
  /** Пока true, ответ ещё стримится; не показываем сырой JSON. */
  isStreaming?: boolean;
  /** Уже распарсенный рецепт (из parseRecipesFromChat), чтобы карточка не показывала «Данные повреждены». */
  preParsedRecipe?: ParsedRecipe | null;
  /** ID рецепта в БД (из createRecipe), для добавления в избранное через favorites_v2.recipe_id */
  recipeId?: string | null;
}

/** Формат сообщений help-чата в localStorage (timestamp как строка). */
interface HelpMessageStored {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  rawContent?: string;
}

function parseHelpMessagesFromStorage(raw: string | null): Message[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is HelpMessageStored => m != null && typeof m === "object" && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && typeof m.timestamp === "string")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        ...(m.rawContent != null && { rawContent: String(m.rawContent) }),
      }));
  } catch {
    return [];
  }
}

const STARTER_MESSAGE = "Здравствуйте! Выберите профиль, и я мгновенно подберу идеальный рецепт.";

export type ChatMode = "recipes" | "help";

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: ChatMode = (searchParams.get("mode") === "help" ? "help" : "recipes");
  const prefillFromQuery = searchParams.get("prefill");
  const { toast } = useToast();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isLoadingMembers } = useFamily();
  const { canGenerate, isPremium, remaining, dailyLimit, usedToday, subscriptionStatus, isTrial, trialDaysRemaining } = useSubscription();
  const isFree = subscriptionStatus === "free";
  const { chat, abortChat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage } = useChatHistory();
  const { saveRecipesFromChat } = useChatRecipes();

  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /** Пользователь близко к низу (<= 150px) — автоскролл. Обновляется в onScroll. */
  const userNearBottomRef = useRef(true);

  const { article: openArticle, isLoading: isArticleLoading } = useArticle(openArticleId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);
  const lastAppliedPrefillRef = useRef<string | null>(null);
  const prefillQueryAppliedRef = useRef(false);
  const prevProfileKeyRef = useRef<string>("");
  const prevModeRef = useRef<ChatMode | null>(null);
  /** Last saved recipe title (for anti-duplicate: retry once if model returns the same). */
  const lastSavedRecipeTitleRef = useRef<string | null>(null);
  /** Скролл к рецепту выполняем один раз при появлении карточки; повторный скролл через несколько секунд даёт «уплывание». */
  const lastScrolledRecipeIdRef = useRef<string | null>(null);

  const lastAssistantContent = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last?.content ?? "";
  }, [messages]);

  const helpFollowups = useMemo(() => getHelpFollowups(lastAssistantContent), [lastAssistantContent]);

  // Очищаем сообщения при смене профиля или списка членов семьи (только в recipes)
  useEffect(() => {
    if (mode !== "recipes") return;
    const memberIds = members.map((c) => c.id).join(",");
    const key = `${selectedMemberId ?? "family"}|${memberIds}`;
    if (prevProfileKeyRef.current && prevProfileKeyRef.current !== key) {
      setMessages([]);
    }
    prevProfileKeyRef.current = key;
  }, [mode, selectedMemberId, members]);

  // При переходе в help — загружаем сообщения из localStorage (recipes state не трогаем при help → recipes)
  useEffect(() => {
    if (mode !== "help") {
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current !== "help") {
      const saved = localStorage.getItem(HELP_CHAT_STORAGE_KEY);
      setMessages(parseHelpMessagesFromStorage(saved));
    }
    prevModeRef.current = mode;
  }, [mode]);

  // Сохранение help-чата в localStorage при каждом изменении messages
  useEffect(() => {
    if (mode !== "help") return;
    const toStore: HelpMessageStored[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
      ...(m.rawContent != null && { rawContent: m.rawContent }),
    }));
    try {
      localStorage.setItem(HELP_CHAT_STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // ignore quota / private mode
    }
  }, [mode, messages]);

  // Fade-in бейджа «Помощник рядом» при входе в help mode
  useEffect(() => {
    if (mode !== "help") {
      setBadgeVisible(false);
      return;
    }
    setBadgeVisible(false);
    const raf = requestAnimationFrame(() => {
      setBadgeVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Prefill из query (?prefill=...) для help — только вставить в input, очистить param
  useEffect(() => {
    if (mode !== "help" || !prefillFromQuery) {
      if (!prefillFromQuery) prefillQueryAppliedRef.current = false;
      return;
    }
    if (prefillQueryAppliedRef.current) return;
    prefillQueryAppliedRef.current = true;
    try {
      setInput(decodeURIComponent(prefillFromQuery));
    } catch {
      setInput(prefillFromQuery);
    }
    setSearchParams((p) => {
      p.delete("prefill");
      return p;
    }, { replace: true });
  }, [mode, prefillFromQuery, setSearchParams]);

  const memberIdForSave = selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : undefined;

  // В help-режиме историю рецептов не подгружаем — сообщения только в local state
  useEffect(() => {
    if (mode === "help") return;
    if (historyMessages.length === 0) {
      setMessages([]);
      return;
    }
    const recipeIds = [...new Set(historyMessages.map((m: { recipe_id?: string | null }) => m.recipe_id).filter(Boolean))] as string[];
    const formatWithRecipeMap = (recipeMap: Record<string, ParsedRecipe>) => {
      const formatted: Message[] = [];
      historyMessages.forEach((msg: { id: string; message?: string; response?: string; created_at: string; recipe_id?: string | null }) => {
        formatted.push({
          id: `${msg.id}-user`,
          role: "user",
          content: msg.message ?? "",
          timestamp: new Date(msg.created_at),
        });
        if (msg.response) {
          const dbRecipe = msg.recipe_id ? recipeMap[msg.recipe_id] : null;
          const { displayText, recipes } = dbRecipe
            ? { displayText: `Вот рецепт: ${dbRecipe.title}`, recipes: [dbRecipe] }
            : parseRecipesFromChat(msg.message ?? "", msg.response);
          formatted.push({
            id: `${msg.id}-assistant`,
            role: "assistant",
            content: displayText,
            timestamp: new Date(msg.created_at),
            rawContent: msg.response,
            preParsedRecipe: recipes[0] ?? null,
            recipeId: msg.recipe_id ?? undefined,
          });
        }
      });
      setMessages(formatted);
    };
    if (recipeIds.length === 0) {
      formatWithRecipeMap({});
      return;
    }
    supabase
      .from("recipes")
      .select("id, title, description, cooking_time_minutes, meal_type, chef_advice, advice, recipe_ingredients(name, display_text, canonical_amount, canonical_unit), recipe_steps(instruction, step_number)")
      .in("id", recipeIds)
      .then(({ data: rows, error }) => {
        const recipeMap: Record<string, ParsedRecipe> = {};
        if (error) {
          formatWithRecipeMap({});
          return;
        }
        (rows ?? []).forEach((r: {
          id: string;
          title?: string;
          description?: string | null;
          cooking_time_minutes?: number | null;
          meal_type?: string | null;
          chef_advice?: string | null;
          advice?: string | null;
          recipe_ingredients?: Array<{ name: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null }>;
          recipe_steps?: Array<{ instruction: string; step_number: number }>;
        }) => {
          const stepsArr = (r.recipe_steps ?? []).sort((a, b) => a.step_number - b.step_number).map((s) => s.instruction);
          const ingredients = (r.recipe_ingredients ?? []).map((ing) => ({
            name: ing.name,
            display_text: ing.display_text ?? ing.name,
            ...(ing.canonical_amount != null && ing.canonical_unit && { canonical_amount: ing.canonical_amount, canonical_unit: ing.canonical_unit as "g" | "ml" }),
          }));
          recipeMap[r.id] = {
            id: r.id,
            title: r.title ?? "",
            description: r.description ?? undefined,
            ingredients,
            steps: stepsArr,
            cookingTime: r.cooking_time_minutes ?? undefined,
            mealType: (r.meal_type as ParsedRecipe["mealType"]) ?? undefined,
            chefAdvice: r.chef_advice ?? undefined,
            advice: r.advice ?? undefined,
          };
        });
        formatWithRecipeMap(recipeMap);
      });
  }, [mode, historyMessages]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    userNearBottomRef.current = scrollHeight - scrollTop - clientHeight <= 150;
  }, []);

  useEffect(() => {
    if (!userNearBottomRef.current) return;
    const last = messages[messages.length - 1];
    const isRecipeMessage =
      last?.role === "assistant" &&
      last?.preParsedRecipe != null &&
      !last?.isStreaming;
    if (isRecipeMessage && last) {
      if (lastScrolledRecipeIdRef.current === last.id) return;
      lastScrolledRecipeIdRef.current = last.id;
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-message-id="${last.id}"]`) as HTMLElement | null;
        if (el) {
          if (import.meta.env.DEV) {
            console.log("[DEBUG] chat scroll: recipe message -> scrollIntoView once id=", last.id);
          }
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    } else {
      if (last?.role === "user" || !last) {
        lastScrolledRecipeIdRef.current = null;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const showStarter = messages.length === 0 && (mode === "help" || !isLoadingHistory);
  const hasUserMessage = messages.some((m) => m.role === "user");

  const sendInProgressRef = useRef(false);
  const handleSend = useCallback(async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isChatting || sendInProgressRef.current) return;
    sendInProgressRef.current = true;
    if (!canGenerate && !isPremium) {
      sendInProgressRef.current = false;
      setShowPaywall(true);
      return;
    }

    setInput("");
    userNearBottomRef.current = true;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: toSend,
      timestamp: new Date(),
    };
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    try {
      const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      chatMessages.push({ role: "user", content: userMessage.content });

      if (mode === "help") {
        const response = await chat({
          messages: chatMessages,
          type: "sos_consultant",
          overrideSelectedMemberId: selectedMemberId,
          overrideSelectedMember: selectedMember,
          overrideMembers: members,
        });
        const rawMessage = (response?.message ?? "").trim() || "Не удалось получить ответ.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: rawMessage, isStreaming: false }
              : m
          )
        );
        sendInProgressRef.current = false;
        return;
      }

      const activeProfileId = selectedMemberId ?? "family";
      const profiles: Profile[] = members.map((m) => ({
        id: m.id,
        role: (m.type === "adult" || m.type === "family" ? "adult" : "child") as "adult" | "child",
        name: m.name,
        allergies: m.allergies ?? [],
        preferences: m.preferences ?? [],
        difficulty:
          m.difficulty === "easy" || m.difficulty === "medium" || m.difficulty === "any"
            ? m.difficulty
            : undefined,
      }));
      const plan =
        subscriptionStatus === "premium"
          ? "premium"
          : subscriptionStatus === "trial"
            ? "trial"
            : "free";
      const family = { id: "family" as const, profiles, activeProfileId };
      const generationContext = buildGenerationContext(family, activeProfileId, plan);

      const normalizeTitle = (t: string) => t?.trim().toLowerCase() ?? "";
      const lastSaved = normalizeTitle(lastSavedRecipeTitleRef.current ?? "");
      const FAILED_MESSAGE =
        "Не удалось сгенерировать подходящий рецепт. Попробуйте изменить запрос.";

      // Названия рецептов из текущей сессии чата — чтобы не повторять одно и то же блюдо
      const recentRecipeTitles = messages
        .filter((m) => m.role === "assistant" && m.preParsedRecipe?.title)
        .map((m) => m.preParsedRecipe!.title)
        .slice(-6);
      const varietySuffix =
        recentRecipeTitles.length > 0
          ? ` Не повторяй названия блюд, уже предложенных в этом чате: ${recentRecipeTitles.join(", ")}. Предложи другой рецепт.`
          : "";

      let attempts = 0;
      let response: { message?: string; recipes?: unknown[]; recipe_id?: string | null } | null = null;
      let rawMessage = "";
      let parsed = parseRecipesFromChat(userMessage.content, "");
      let apiRecipes: unknown[] = [];

      while (attempts < 2) {
        response = await chat({
          messages: chatMessages,
          type: "chat",
          overrideSelectedMemberId: selectedMemberId,
          overrideSelectedMember: selectedMember,
          overrideMembers: members,
          mealType: detectMealType(userMessage.content) || undefined,
          extraSystemSuffix:
            (attempts > 0 ? "Previous recipe was duplicated. Generate a DIFFERENT recipe now. " : "") + varietySuffix,
          onChunk:
            attempts === 0
              ? (chunk) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + chunk, isStreaming: true }
                      : m
                  )
                );
              }
              : undefined,
        });
        rawMessage = typeof response?.message === "string" ? response.message : "";
        apiRecipes = Array.isArray(response?.recipes) ? response.recipes : [];
        parsed = apiRecipes.length > 0
          ? parseRecipesFromApiResponse(apiRecipes as Array<Record<string, unknown>>, rawMessage || "Вот рецепт")
          : parseRecipesFromChat(userMessage.content, rawMessage);
        const recipe = parsed.recipes[0];

        if (!recipe) {
          break;
        }
        const validation = validateRecipe(recipe, generationContext);
        if (!validation.ok) {
          break;
        }
        if (lastSaved && normalizeTitle(recipe.title) === lastSaved) {
          attempts++;
          continue;
        }
        break;
      }

      const finalRecipe = parsed.recipes[0];
      const finalValidation = finalRecipe ? validateRecipe(finalRecipe, generationContext) : { ok: false };
      const hasRecipeFromApi = apiRecipes.length > 0;
      // Рецепт из API показываем всегда; при провале валидации только не сохраняем
      const showRecipe = !!finalRecipe && (finalValidation.ok || hasRecipeFromApi);

      if (import.meta.env.DEV && finalRecipe) {
        const recipeFromApi = apiRecipes[0] as Record<string, unknown> | undefined;
        const chefAdvice = (finalRecipe as { chefAdvice?: string }).chefAdvice;
        console.log("[DEBUG recipe]", {
          messageId: assistantMessageId,
          recipeId: recipeFromApi?.id ?? (finalRecipe as { id?: string }).id,
          recipeIdFromBackend: response?.recipe_id,
          title: (finalRecipe as { title?: string }).title,
          source: recipeFromApi?.source,
          hasChefAdvice: !!(chefAdvice && chefAdvice.trim()),
          chefAdviceLen: chefAdvice?.length ?? 0,
          recipeKeys: Object.keys(finalRecipe),
          fromApi: apiRecipes.length > 0,
        });
      }

      if (!finalRecipe) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                ...m,
                content: FAILED_MESSAGE,
                rawContent: rawMessage || undefined,
                isStreaming: false,
                preParsedRecipe: null,
              }
              : m
          )
        );
        toast({
          variant: "destructive",
          title: "Не удалось подобрать рецепт",
          description: FAILED_MESSAGE,
        });
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                ...m,
                content: parsed.displayText,
                rawContent: rawMessage,
                isStreaming: false,
                preParsedRecipe: showRecipe ? (parsed.recipes[0] ?? null) : null,
              }
              : m
          )
        );

        try {
          if (!finalValidation.ok && hasRecipeFromApi) {
            toast({
              variant: "default",
              title: "Рецепт показан",
              description: "Не сохранён в список: не совпадает с аллергиями или предпочтениями.",
            });
          }
          let recipeIdForHistory: string | null = response?.recipe_id ?? null;
          if (import.meta.env.DEV) {
            console.log("[DEBUG recipe id]", recipeIdForHistory);
          }
          if (finalValidation.ok) {
            if (recipeIdForHistory) {
              lastSavedRecipeTitleRef.current = finalRecipe?.title ?? null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, recipeId: recipeIdForHistory } : m
                )
              );
            } else {
              const mealType = detectMealType(userMessage.content);
              const { savedRecipes } = await saveRecipesFromChat({
                userMessage: userMessage.content,
                aiResponse: rawMessage,
                memberId: memberIdForSave,
                mealType,
                parsedResult: parsed,
              });
              if (savedRecipes?.length > 0) {
                lastSavedRecipeTitleRef.current = savedRecipes[0]?.title ?? null;
                recipeIdForHistory = savedRecipes[0]?.id ?? null;
                if (import.meta.env.DEV) {
                  console.log("[DEBUG recipe id]", recipeIdForHistory, "(from saveRecipesFromChat)");
                }
                if (recipeIdForHistory) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId ? { ...m, recipeId: recipeIdForHistory } : m
                    )
                  );
                }
                toast({
                  title: "Рецепты сохранены",
                  description: `${savedRecipes.length} рецепт(ов) добавлено в ваш список`,
                });
              }
            }
            await saveChat({
              message: userMessage.content,
              response: rawMessage,
              recipeId: recipeIdForHistory,
            });
          } else {
            await saveChat({
              message: userMessage.content,
              response: rawMessage,
              recipeId: recipeIdForHistory,
            });
          }
        } catch (e) {
          safeError("Failed to save recipes from chat:", e);
          await saveChat({
            message: userMessage.content,
            response: rawMessage,
            recipeId: response?.recipe_id ?? null,
          });
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        toast({ title: "Остановлено" });
        return;
      }
      if (err?.message === "usage_limit_exceeded") {
        setShowPaywall(true);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Не удалось получить ответ. Попробуйте снова.",
        });
      }
    } finally {
      sendInProgressRef.current = false;
    }
  }, [input, isChatting, canGenerate, isPremium, messages, selectedMemberId, selectedMember, members, memberIdForSave, chat, saveRecipesFromChat, saveChat, toast]);

  // Обработка предзаполненного сообщения из state (ScanPage — только для recipes)
  // В help используем только query prefill (?prefill=...)
  useEffect(() => {
    if (mode === "help") return;
    const state = location.state as {
      prefillMessage?: string;
      sourceProducts?: string[];
      prefillOnly?: boolean;
    } | null;
    const prefillText = state?.prefillMessage;
    if (!prefillText) {
      lastAppliedPrefillRef.current = null;
      return;
    }
    if (isLoadingHistory || messages.length > 0) return;
    if (lastAppliedPrefillRef.current === prefillText) return;
    lastAppliedPrefillRef.current = prefillText;
    prefillSentRef.current = true;
    setInput(prefillText);
    window.history.replaceState({}, document.title);
    if (!state.prefillOnly) {
      const timer = setTimeout(() => {
        handleSend(prefillText);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [mode, location.state, isLoadingHistory, messages.length, handleSend]);

  const handleDeleteMessage = async (messageId: string) => {
    const originalId = messageId.replace(/-user$/, "").replace(/-assistant$/, "");
    try {
      await deleteMessage(originalId);
      setMessages((prev) => prev.filter((m) => !m.id.startsWith(originalId)));
      toast({ title: "Сообщение удалено" });
    } catch {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось удалить сообщение",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;
  const ageMonths = selectedMember?.age_months ?? members[0]?.age_months ?? null;
  const ageLabel = ageMonths != null ? (ageMonths < 12 ? `${ageMonths} мес` : `${Math.floor(ageMonths / 12)} ${ageMonths % 12 === 0 ? "лет" : "г."}`) : null;
  const chatHeaderMeta =
    mode !== "help" && isTrial && trialDaysRemaining !== null
      ? (
        <span className="text-typo-caption text-amber-700 dark:text-amber-400 font-medium">
          Trial: осталось {trialDaysRemaining} {trialDaysRemaining === 1 ? "день" : trialDaysRemaining < 5 ? "дня" : "дней"}
        </span>
      )
      : mode !== "help" && isFree
        ? (
          <span className="block">
            <span className="text-[11px] text-muted-foreground/80">Осталось {remaining} из {dailyLimit} сегодня</span>
            <Progress value={dailyLimit ? (usedToday / dailyLimit) * 100 : 0} className="h-1 mt-0.5" />
          </span>
        )
        : undefined;

  const helpHeaderCenter = mode === "help" ? (
    <div className="flex flex-col items-center justify-center text-center w-full px-4">
      <h1 className="text-typo-title font-semibold text-foreground truncate w-full">
        Помощник по питанию ребёнка
      </h1>
      {members.length > 0 && (
        <span className="text-typo-caption text-muted-foreground truncate w-full mt-0.5">
          Для {memberName ?? ""}{ageLabel ? ` · ${ageLabel}` : ""}
        </span>
      )}
      <span
        className="inline-flex items-center gap-1.5 mt-1.5 shrink-0"
        style={{
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 8px",
          borderRadius: 9999,
          background: "rgba(104, 143, 59, 0.12)",
          color: "#5E7E2F",
          border: "1px solid rgba(104, 143, 59, 0.25)",
          opacity: badgeVisible ? 1 : 0,
          transform: badgeVisible ? "translateY(0)" : "translateY(-2px)",
          transition: "opacity 180ms ease-out, transform 180ms ease-out",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#6C8F3B",
          }}
          aria-hidden
        />
        Помощник рядом
      </span>
      <span
        className="block w-full mt-1.5 text-muted-foreground"
        style={{
          fontSize: 13,
          opacity: 0.75,
          maxWidth: 320,
          lineHeight: 1.4,
        }}
      >
        Я не ставлю диагнозы, но подскажу, на что обратить внимание.
      </span>
    </div>
  ) : null;

  return (
    <MobileLayout
      showNav
      title={mode === "help" ? "" : "Чат"}
      headerCenter={helpHeaderCenter}
      headerNoBlur
      headerRight={members.length > 0 ? <MemberSelectorButton onProfileChange={() => mode === "recipes" && setMessages([])} /> : undefined}
      headerMeta={mode === "help" ? undefined : chatHeaderMeta}
    >
      <div className="flex flex-col min-h-0 flex-1 container mx-auto max-w-full overflow-x-hidden px-3 sm:px-4">
        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain py-3 space-y-5 pb-4"
        >
          {!isLoadingMembers && members.length === 0 && (
            <FamilyOnboarding onComplete={() => { }} />
          )}

          {showStarter && !hasUserMessage && members.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-sm px-5 py-4 bg-slate-50/80 border border-slate-200/40 max-w-[85%]">
                <p className="text-typo-body text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {mode === "help"
                    ? "Задайте вопрос про питание, стул, аллергию, режим или самочувствие ребёнка. Отвечу по шагам и подскажу, когда к врачу."
                    : STARTER_MESSAGE}
                </p>
              </div>
            </motion.div>
          )}

          {mode === "recipes" && isLoadingHistory && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <AnimatePresence>
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                id={m.id}
                role={m.role}
                content={
                  m.role === "assistant" && m.isStreaming && mode === "recipes" && m.content.trim().startsWith("{")
                    ? "Готовлю рецепт…"
                    : m.content
                }
                timestamp={m.timestamp}
                rawContent={mode === "recipes" ? m.rawContent : undefined}
                expectRecipe={mode === "recipes" && m.role === "assistant"}
                preParsedRecipe={mode === "recipes" ? m.preParsedRecipe : null}
                recipeId={mode === "recipes" ? m.recipeId : undefined}
                isStreaming={m.isStreaming}
                onDelete={handleDeleteMessage}
                memberId={selectedMember?.id}
                memberName={selectedMember?.name}
                ageMonths={selectedMember?.age_months ?? undefined}
                onOpenArticle={setOpenArticleId}
                forcePlainText={mode === "help"}
              />
            ))}
          </AnimatePresence>

          {isChatting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-start gap-3">
              <button
                type="button"
                onClick={abortChat}
                title="Остановить генерацию"
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-slate-100/80 text-slate-500 hover:bg-slate-200/60 hover:text-slate-600 active:scale-95 transition-all"
              >
                <Square className="w-4 h-4" />
              </button>
              <div className="rounded-2xl rounded-bl-sm px-5 py-4 bg-slate-50/80 border border-slate-200/40">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-typo-muted text-muted-foreground">
                    {mode === "help" ? "Получаю ответ…" : "Готовим кулинарное чудо..."}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {mode === "help" && !isChatting && messages.some((m) => m.role === "assistant") && helpFollowups.length > 0 && (
            <div className="pt-1 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-2 px-0.5">Спросить ещё</p>
              <div
                className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1 min-w-0 scrollbar-none"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {helpFollowups.map((chip) => (
                  <button
                    key={chip.prefill}
                    type="button"
                    onClick={() => {
                      setInput(chip.prefill);
                      textareaRef.current?.focus();
                    }}
                    className="shrink-0 h-8 px-3 rounded-full text-[13px] leading-tight border border-slate-200/60 bg-slate-50/80 text-foreground hover:bg-slate-100/80 active:scale-[0.98] transition-colors whitespace-nowrap"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200/40 bg-background/98 backdrop-blur py-3 safe-bottom max-w-full overflow-x-hidden">
          {mode === "help" && (
            <p className="text-[11px] text-muted-foreground mb-1.5 px-0.5">
              Я отвечу безопасно и по шагам. Диагнозов не ставлю.
            </p>
          )}
          <div className="flex w-full items-center gap-2 min-w-0">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "help" ? "Например: Сыпь после творога — что делать?" : "Что приготовить?"}
              className="min-h-[44px] max-h-[120px] flex-1 min-w-0 resize-none rounded-2xl bg-slate-50/80 border-slate-200/50 py-3 px-4 text-typo-body placeholder:text-muted-foreground/70 focus-visible:ring-emerald-500/30"
              rows={1}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              {mode === "recipes" && (
                <button
                  type="button"
                  onClick={() => setShowHintsModal(true)}
                  title="Подсказки"
                  className="h-9 w-9 rounded-full bg-slate-100/80 text-slate-500 flex items-center justify-center hover:bg-slate-200/60 hover:text-slate-600 active:scale-95 transition-all"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                disabled={!input.trim() || isChatting}
                onClick={() => handleSend()}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-opacity hover:opacity-95 active:scale-95 bg-[#6B8E23] hover:bg-[#5a7d1e]"
                style={{ boxShadow: "0 4px 14px -2px rgba(107, 142, 35, 0.35)" }}
              >
                {isChatting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Paywall isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
      <ArticleReaderModal
        article={openArticle}
        open={!!openArticleId}
        onOpenChange={(open) => !open && setOpenArticleId(null)}
        isLoading={isArticleLoading}
      />
      <Dialog open={showHintsModal} onOpenChange={setShowHintsModal}>
        <DialogContent className="w-[min(280px,calc(100vw-40px))] max-w-[280px] p-4 rounded-xl border-slate-200/50 mx-auto">
          <DialogHeader className="space-y-0.5 pb-3 text-center">
            <DialogTitle className="text-typo-title font-semibold text-foreground">Подсказки для мам 💛</DialogTitle>
            <DialogDescription className="text-typo-caption text-muted-foreground">С чего начать?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {CHAT_HINT_PHRASES.map((phrase, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setInput(phrase);
                  setShowHintsModal(false);
                  textareaRef.current?.focus();
                }}
                className="text-left px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/50 hover:bg-emerald-50/50 hover:border-emerald-200/40 text-[13px] leading-snug transition-colors"
              >
                {phrase}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </MobileLayout>
  );
}
