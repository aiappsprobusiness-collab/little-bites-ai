import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Send, Loader2, HelpCircle, MoreVertical, Trash2 } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSuggestionChips } from "@/utils/chatSuggestionChips";
import { getTimeOfDayLine, formatAllergySummary } from "@/utils/chatHeroUtils";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

const CHAT_HINTS_SEEN_KEY = "chat_hints_seen_v1";
const CHAT_HELP_TOOLTIP_SEEN_KEY = "chat_help_tooltip_seen";

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


export type ChatMode = "recipes" | "help";

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: ChatMode = (searchParams.get("mode") === "help" ? "help" : "recipes");
  const prefillFromQuery = searchParams.get("prefill");
  const { toast } = useToast();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isLoadingMembers } = useFamily();
  const { canGenerate, canSendAi, isPremium, remaining, dailyLimit, usedToday, subscriptionStatus, isTrial, trialDaysRemaining, aiDailyLimit } = useSubscription();
  const isFree = subscriptionStatus === "free";
  const { chat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage, archiveChat } = useChatHistory(selectedMemberId ?? null);
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
  const chatHeroRef = useRef<HTMLDivElement | null>(null);
  /** Статус-индикатор при смене профиля: текст на 1.5 сек. */
  const [profileChangeStatus, setProfileChangeStatus] = useState<string | null>(null);
  const profileChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hintsSeen, setHintsSeen] = useState(() =>
    typeof localStorage !== "undefined" && !!localStorage.getItem(CHAT_HINTS_SEEN_KEY)
  );
  const markHintsSeen = useCallback(() => {
    try {
      localStorage.setItem(CHAT_HINTS_SEEN_KEY, "1");
      setHintsSeen(true);
    } catch {
      setHintsSeen(true);
    }
  }, []);

  const [showHelpTooltip, setShowHelpTooltip] = useState(() =>
    typeof localStorage !== "undefined" && !localStorage.getItem(CHAT_HELP_TOOLTIP_SEEN_KEY)
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  /** Мягкий акцент на кнопке "?" при пустом чате: 2 pulse за сессию. */
  const [showHintPulseAccent, setShowHintPulseAccent] = useState(false);
  const hintPulseShownRef = useRef(false);
  const dismissHelpTooltip = useCallback(() => {
    try {
      localStorage.setItem(CHAT_HELP_TOOLTIP_SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setShowHelpTooltip(false);
  }, []);

  useEffect(() => {
    if (!showHelpTooltip || mode !== "recipes") return;
    const t = setTimeout(dismissHelpTooltip, 3000);
    return () => clearTimeout(t);
  }, [showHelpTooltip, mode, dismissHelpTooltip]);

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
      // Статус-индикатор при смене профиля (1 строка, 1.5 сек)
      const isFamily = selectedMemberId === "family";
      const allergies = isFamily
        ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
        : (selectedMember?.allergies ?? []);
      const profileName = isFamily ? "Семья" : (selectedMember?.name ?? "профиль");
      if (allergies.length > 0) {
        setProfileChangeStatus(`Учёл аллергию: ${allergies[0]}`);
      } else {
        setProfileChangeStatus("Профиль обновлён");
      }
      if (profileChangeTimeoutRef.current) clearTimeout(profileChangeTimeoutRef.current);
      profileChangeTimeoutRef.current = setTimeout(() => {
        setProfileChangeStatus(null);
        profileChangeTimeoutRef.current = null;
      }, 1500);
    }
    prevProfileKeyRef.current = key;
  }, [mode, selectedMemberId, members, selectedMember]);

  useEffect(() => {
    return () => {
      if (profileChangeTimeoutRef.current) clearTimeout(profileChangeTimeoutRef.current);
    };
  }, []);

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

  // Скролл в начало при открытии help-чата (из чипсов или ввода)
  useLayoutEffect(() => {
    if (mode !== "help") return;
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
    messagesContainerRef.current?.scrollTo(0, 0);
  }, [mode]);

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
    const scrollEl = messagesContainerRef.current;
    if (isRecipeMessage && last && scrollEl) {
      if (lastScrolledRecipeIdRef.current === last.id) return;
      lastScrolledRecipeIdRef.current = last.id;
      requestAnimationFrame(() => {
        const messageEl = document.querySelector(`[data-message-id="${last.id}"]`) as HTMLElement | null;
        if (!messageEl) return;
        const heroEl = chatHeroRef.current;
        const heroHeight = heroEl ? heroEl.getBoundingClientRect().height : 0;
        const gap = 12;
        const scrollRect = scrollEl.getBoundingClientRect();
        const msgRect = messageEl.getBoundingClientRect();
        const targetTop = scrollEl.scrollTop + (msgRect.top - scrollRect.top) - heroHeight - gap;
        const clamped = Math.max(0, targetTop);
        scrollEl.scrollTo({ top: clamped, behavior: "smooth" });
      });
    } else {
      if (last?.role === "user" || !last) {
        lastScrolledRecipeIdRef.current = null;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const suggestionChips = useMemo(() => {
    if (mode !== "recipes") return [];
    const isFamily = selectedMemberId === "family";
    const allergies = isFamily
      ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
      : (selectedMember?.allergies ?? []);
    const ageMonths = isFamily
      ? (() => {
        const ages = members.map((m) => m.age_months).filter((a): a is number => a != null);
        return ages.length > 0 ? Math.min(...ages) : null;
      })()
      : (selectedMember?.age_months ?? null);
    return getSuggestionChips({
      selectedMemberId: selectedMemberId ?? null,
      ageMonths,
      allergies,
      isFamily,
      memberName: isFamily ? null : selectedMember?.name ?? null,
    });
  }, [mode, selectedMemberId, selectedMember, members]);

  const showStarter = messages.length === 0 && (mode === "help" || !isLoadingHistory);
  const hasUserMessage = messages.some((m) => m.role === "user");

  /** Пустой чат (recipes): один раз за сессию 2 pulse на кнопке "?". Без зависимости от производной константы — только примитивы, чтобы избежать TDZ в prod-бандле. */
  useEffect(() => {
    const isEmptyHintState = showStarter && !hasUserMessage && members.length > 0 && mode === "recipes" && (hintsSeen || suggestionChips.length === 0);
    if (!isEmptyHintState || hintPulseShownRef.current) return;
    hintPulseShownRef.current = true;
    setShowHintPulseAccent(true);
    const t = setTimeout(() => setShowHintPulseAccent(false), 2000);
    return () => clearTimeout(t);
  }, [showStarter, hasUserMessage, members.length, mode, hintsSeen, suggestionChips]);

  const sendInProgressRef = useRef(false);
  const handleSend = useCallback(async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isChatting || sendInProgressRef.current) return;
    if (messages.every((m) => m.role !== "user")) markHintsSeen();
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
        "Не удалось распознать рецепт. Попробуйте уточнить запрос.";

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
              childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
            });
          } else {
            await saveChat({
              message: userMessage.content,
              response: rawMessage,
              recipeId: recipeIdForHistory,
              childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
            });
          }
        } catch (e) {
          safeError("Failed to save recipes from chat:", e);
          await saveChat({
            message: userMessage.content,
            response: rawMessage,
            recipeId: response?.recipe_id ?? null,
            childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
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
        const fallbackText = "Не удалось распознать рецепт. Попробуйте уточнить запрос.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: fallbackText, rawContent: undefined, isStreaming: false, preParsedRecipe: null }
              : m
          )
        );
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Не удалось получить ответ. Попробуйте снова.",
        });
      }
    } finally {
      sendInProgressRef.current = false;
    }
  }, [input, isChatting, canGenerate, isPremium, messages, selectedMemberId, selectedMember, members, memberIdForSave, chat, saveRecipesFromChat, saveChat, toast, markHintsSeen]);

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

  const handleClearChatConfirm = useCallback(async () => {
    try {
      await archiveChat();
      setMessages([]);
      setShowClearConfirm(false);
      toast({ title: "Чат очищен" });
    } catch {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось очистить чат",
      });
    }
  }, [archiveChat, toast]);

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
      : mode !== "help" && isFree && aiDailyLimit !== null
        ? (
          <span className="block">
            <span className="text-[11px] text-muted-foreground/80">
              Сегодня осталось {remaining} из {aiDailyLimit} AI-запросов
            </span>
            <Progress value={(usedToday / aiDailyLimit) * 100} className="h-1 mt-0.5" />
          </span>
        )
        : undefined;

  /** Для hero: имя профиля (Семья / имя ребёнка). Объявлено до recipesHeaderCenter. */
  const chatProfileName = useMemo(() => {
    if (mode === "help") return "";
    return selectedMemberId === "family" ? "Семья" : (selectedMember?.name ?? "профиль");
  }, [mode, selectedMemberId, selectedMember?.name]);

  /** Строка контекста hero: "Для {profileName} · {allergySummary}". */
  const chatHeroSubtext = useMemo(() => {
    if (mode === "help") return "";
    const isFamily = selectedMemberId === "family";
    const allergies = isFamily
      ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
      : (selectedMember?.allergies ?? []);
    const name = chatProfileName || "профиль";
    const allergySummary = formatAllergySummary(allergies);
    return `Для ${name} · ${allergySummary}`;
  }, [mode, selectedMemberId, selectedMember, members, chatProfileName]);

  const chatTimeOfDayLine = useMemo(() => getTimeOfDayLine(), []);

  /** Строка статуса в hero (без имени — имя только в pill): "Аллергии: ..." или "Без ограничений". */
  const chatHeroStatusLine = useMemo(() => {
    if (mode === "help") return "";
    const isFamily = selectedMemberId === "family";
    const allergies = isFamily
      ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
      : (selectedMember?.allergies ?? []);
    if (allergies.length === 0) return "Без ограничений";
    const first = allergies.slice(0, 2).join(", ");
    const rest = allergies.length > 2 ? ` +${allergies.length - 2}` : "";
    return `Аллергии: ${first}${rest}`;
  }, [mode, selectedMemberId, selectedMember, members]);

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
          background: "rgba(110, 127, 59, 0.12)",
          color: "#6E7F3B",
          border: "1px solid rgba(110, 127, 59, 0.25)",
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
            background: "#6E7F3B",
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
      title={mode === "help" ? "" : undefined}
      headerCenter={mode === "help" ? helpHeaderCenter : undefined}
      headerNoBlur
      headerClassName={mode === "help" ? undefined : undefined}
      headerRight={mode === "help" && members.length > 0 ? (
        <MemberSelectorButton onProfileChange={() => setMessages([])} />
      ) : undefined}
      headerMeta={undefined}
    >
      <div className="flex flex-col min-h-0 flex-1 container mx-auto max-w-full overflow-x-hidden px-3 sm:px-4 chat-page-bg overflow-hidden">
        {/* Sticky hero (recipes): первый блок, непрозрачный фон */}
        {mode === "recipes" && members.length > 0 && (
          <div
            ref={chatHeroRef}
            className="sticky top-0 z-30 shrink-0 isolate px-0.5"
            style={{
              background: "#FCFCFA",
              borderBottom: "1px solid rgba(220, 227, 199, 0.3)",
              boxShadow: "0 1px 0 0 rgba(220, 227, 199, 0.3)",
            }}
          >
              <div className="pb-2 pt-1 px-0.5">
                {/* Строка: заголовок слева, pill + ⋯ справа */}
                <div className="flex items-center justify-between gap-2 min-h-[40px]">
                  <h1 className="text-[18px] font-semibold text-foreground leading-tight truncate min-w-0">
                    Помощник по питанию
                  </h1>
                  <div className="flex items-center gap-0.5 shrink-0 pointer-events-auto">
                    <MemberSelectorButton onProfileChange={() => setMessages([])} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          aria-label="Меню чата"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        <DropdownMenuItem
                          className="text-foreground"
                          onSelect={(e) => {
                            e.preventDefault();
                            setShowClearConfirm(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Очистить чат
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {/* Hero всегда expanded: статус, время суток, meta, CTA */}
                <div className="pt-1">
                  {chatHeroStatusLine && (
                    <p className="text-[13px] text-muted-foreground leading-snug">
                      {chatHeroStatusLine}
                    </p>
                  )}
                  <p className="text-[13px] text-muted-foreground/70 mt-0.5 leading-snug">
                    {chatTimeOfDayLine}
                  </p>
                  {chatHeaderMeta != null && <div className="mt-2">{chatHeaderMeta}</div>}
                  <button
                    type="button"
                    onClick={() => textareaRef.current?.focus()}
                    className="mt-3 h-10 px-4 rounded-[16px] text-white font-medium text-sm shadow-[0_2px_12px_rgba(110,127,59,0.15)] transition-opacity hover:opacity-95 active:opacity-90"
                    style={{ backgroundColor: "#6E7F3B" }}
                  >
                    Задать вопрос
                  </button>
                  {messages.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHintsModal(true)}
                      className="block text-left mt-3 text-[14px] text-primary font-normal no-underline cursor-pointer bg-transparent border-0 p-0 hover:opacity-85 active:opacity-70 active:scale-[0.98] transition-opacity duration-150"
                    >
                      Показать подсказки
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Messages: отдельный скролл-контейнер под hero, padding-bottom только под инпут (12px) */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain py-3 space-y-5 pb-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Статус при смене профиля: 1.5 сек, плавное появление/исчезновение (резерв 20px без сдвига) */}
          {mode === "recipes" && (
            <div className="min-h-[20px] flex items-center px-0.5 pt-1">
              <AnimatePresence mode="wait">
                {profileChangeStatus && (
                  <motion.span
                    key={profileChangeStatus}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="block text-[12px] text-muted-foreground truncate w-full"
                  >
                    {profileChangeStatus}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isLoadingMembers && members.length === 0 && (
            <FamilyOnboarding onComplete={() => { }} />
          )}

          {mode === "recipes" && showStarter && !hasUserMessage && members.length > 0 && !hintsSeen && suggestionChips.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Начните с подсказки</p>
              <div
                className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 min-w-0 scrollbar-none"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {suggestionChips.slice(0, 4).map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => {
                      setInput(phrase);
                      markHintsSeen();
                      textareaRef.current?.focus();
                    }}
                    className="shrink-0 rounded-full px-4 py-2 text-sm bg-primary-light border border-primary-border text-foreground hover:bg-primary-light/90 active:scale-[0.98] transition-all"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showStarter && !hasUserMessage && members.length > 0 && mode === "help" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-sm px-5 py-4 bg-[#F7F8F3] max-w-[85%] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-typo-body text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  Задайте вопрос про питание, стул, аллергию, режим или самочувствие ребёнка. Отвечу по шагам и подскажу, когда к врачу.
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

          <AnimatePresence>
            {isChatting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl rounded-bl-sm px-5 py-4 bg-[#F7F8F3] shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-[85%]">
                  <p className="text-typo-body text-foreground/90 leading-relaxed">
                    {mode === "help" ? "Думаю…" : "Готовлю рецепт…"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2" aria-hidden>
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    className="shrink-0 h-8 px-3 rounded-full text-[13px] leading-tight bg-primary-light/80 text-foreground hover:bg-primary-light active:scale-[0.98] transition-colors whitespace-nowrap"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input: ниже MessagesScroll, непрозрачный фон, без лишнего отступа под nav */}
        <div className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200/30 bg-[#FCFCFA] py-3 max-w-full overflow-x-hidden">
          {mode === "help" && (
            <p className="text-[11px] text-muted-foreground mb-1.5 px-0.5">
              Ответы носят информационный характер и не заменяют консультацию врача.
            </p>
          )}
          <div className="flex w-full items-center gap-2 min-w-0">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "help"
                  ? "Например: Сыпь после творога — что делать?"
                  : "Что приготовить?"
              }
              className="min-h-[44px] max-h-[120px] flex-1 min-w-0 resize-none rounded-2xl bg-white py-3 px-4 text-typo-body placeholder:text-muted-foreground placeholder:font-normal placeholder:text-[14px] focus-visible:ring-primary/30 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-slate-200/40"
              rows={1}
            />
            <div className="flex items-center gap-1.5 shrink-0 relative">
              {mode === "recipes" && (
                <div className="relative">
                  <button
                    ref={helpButtonRef}
                    type="button"
                    onClick={() => setShowHintsModal(true)}
                    title="Подсказки"
                    className={`h-9 w-9 rounded-full bg-primary-light border border-primary-border/40 text-primary flex items-center justify-center hover:bg-primary-light/90 active:scale-[0.98] transition-transform duration-[120ms] ${showHintPulseAccent ? "chat-hint-btn-pulse" : ""}`}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                  {showHelpTooltip && (
                    <>
                      <div
                        role="presentation"
                        className="fixed inset-0 z-[45]"
                        onClick={dismissHelpTooltip}
                      />
                      <div
                        className="chat-help-tooltip absolute bottom-full right-0 mb-2 px-3 py-2 rounded-[10px] bg-primary-light border border-primary-border/50 text-muted-foreground text-[13px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] z-50 whitespace-nowrap"
                        style={{ borderBottomLeftRadius: 2 }}
                      >
                        Подсказки
                        <span
                          className="absolute -bottom-1.5 right-3 w-2.5 h-2.5 bg-primary-light border-r border-b border-primary-border/50 rotate-45"
                          style={{ right: 14 }}
                          aria-hidden
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                type="button"
                disabled={!input.trim() || isChatting}
                onClick={() => handleSend()}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-opacity hover:opacity-95 active:scale-95 bg-primary shadow-[0_2px_8px_rgba(110,127,59,0.2)]"
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
      <Sheet open={showHintsModal} onOpenChange={setShowHintsModal}>
        <SheetContent
          side="bottom"
          overlayClassName="sheet-hints-overlay"
          className="sheet-hints-content rounded-t-2xl max-h-[70vh] flex flex-col"
        >
          <SheetHeader className="text-left pb-3">
            <SheetTitle>Подсказки</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1.5 overflow-y-auto pb-safe">
            {suggestionChips.slice(0, 8).map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => {
                  setInput(phrase);
                  setShowHintsModal(false);
                  textareaRef.current?.focus();
                }}
                className="text-left px-3 py-2.5 rounded-xl bg-primary-light/80 border border-primary-border hover:bg-primary-light text-[13px] leading-snug transition-colors"
              >
                {phrase}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl flex flex-col gap-4 pb-safe"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Очистить чат?</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground">Мы скроем сообщения. Данные не удаляются.</p>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowClearConfirm(false)}
            >
              Отмена
            </Button>
            <Button
              className="flex-1"
              onClick={handleClearChatConfirm}
            >
              Очистить
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
