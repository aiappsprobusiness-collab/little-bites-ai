import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Send, Loader2, HelpCircle, MoreVertical, Trash2 } from "lucide-react";
import { APP_HEADER_ICON, APP_HEADER_TITLE, MobileLayout } from "@/components/layout/MobileLayout";
import { TopBarIconButton } from "@/components/layout/TopBar";
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
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import type { LimitReachedFeature } from "@/utils/limitReachedMessages";
import { useAppStore } from "@/store/useAppStore";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

const CHAT_HINTS_SEEN_KEY = "chat_hints_seen_v1";
const CHAT_HELP_TOOLTIP_SEEN_KEY = "chat_help_tooltip_seen";
/** Порог (px) от низа скролла: если пользователь в пределах — автоскролл вниз при новых сообщениях. */
const NEAR_BOTTOM_THRESHOLD = 120;

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
  const isConsultationMode = mode === "help";
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
  /** Пользователь близко к низу (<= NEAR_BOTTOM_THRESHOLD) — автоскролл. Обновляется в onScroll. */
  const userNearBottomRef = useRef(true);
  /** Один раз после входа на вкладку: прокрутить ленту к низу после загрузки сообщений. */
  const chatScrollRestoredRef = useRef(false);

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

  // При входе на вкладку Чат (recipes): сбросить scroll страницы, чтобы хедер был виден
  useLayoutEffect(() => {
    if (mode !== "recipes") return;
    window.scrollTo(0, 0);
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
  }, [mode]);

  // После загрузки истории: один раз прокрутить ленту к низу (после layout, без рывка)
  useLayoutEffect(() => {
    if (mode !== "recipes" || messages.length === 0 || chatScrollRestoredRef.current) return;
    chatScrollRestoredRef.current = true;
    const el = messagesContainerRef.current;
    if (!el) return;
    let cancelled = false;
    const id2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !el) return;
        el.scrollTop = el.scrollHeight - el.clientHeight;
        userNearBottomRef.current = true;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id2);
    };
  }, [mode, messages.length]);

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
    userNearBottomRef.current = scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_THRESHOLD;
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
      const limitPayload = (err as { payload?: { feature: string } })?.payload;
      if (err?.message === "LIMIT_REACHED" && limitPayload?.feature) {
        useAppStore.getState().setPaywallCustomMessage(
          `${getLimitReachedTitle()}\n\n${getLimitReachedMessage(limitPayload.feature as LimitReachedFeature)}`
        );
        setShowPaywall(true);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
      } else if (err?.message === "usage_limit_exceeded") {
        useAppStore.getState().setPaywallCustomMessage(
          `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("chat_recipe")}`
        );
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

  const chatTitle = APP_HEADER_TITLE;
  const chatHeaderRight = mode === "help" ? (
    members.length > 0 ? <MemberSelectorButton onProfileChange={() => setMessages([])} /> : undefined
  ) : (
    members.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TopBarIconButton aria-label="Меню чата">
            <MoreVertical className="w-5 h-5" />
          </TopBarIconButton>
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
    ) : undefined
  );

  return (
    <MobileLayout
      showNav
      title={chatTitle} headerTitleIcon={APP_HEADER_ICON}
      headerNoBlur
      headerRight={chatHeaderRight}
    >
      <div className="flex flex-col min-h-0 flex-1 container mx-auto max-w-full overflow-x-hidden px-4 chat-page-bg overflow-hidden">
        {/* Hero под TopBar: статус, время, meta, CTA (только recipes) */}
        {mode === "recipes" && members.length > 0 && (
          <div ref={chatHeroRef} className="shrink-0 border-b border-border/50 bg-background px-4 py-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="shrink-0 h-11 px-4 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-2"
              >
                <span>Задать вопрос</span>
                <Send className="w-4 h-4 shrink-0" />
              </button>
              <MemberSelectorButton onProfileChange={() => setMessages([])} className="shrink-0" />
            </div>
            {chatHeroStatusLine && (
              <p className="text-xs text-muted-foreground leading-snug">{chatHeroStatusLine}</p>
            )}
            <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">
              {chatTimeOfDayLine}
            </p>
            {chatHeaderMeta != null && <div className="mt-0.5">{chatHeaderMeta}</div>}
            {messages.length === 0 && (
              <button
                type="button"
                onClick={() => setShowHintsModal(true)}
                className="block text-left mt-1 text-sm text-primary font-medium no-underline cursor-pointer bg-transparent border-0 p-0 hover:opacity-85 active:opacity-70 transition-opacity"
              >
                Показать подсказки
              </button>
            )}
          </div>
        )}

        {/* Messages: отдельный скролл-контейнер под hero, padding-bottom только под инпут (12px) */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain py-0.5 space-y-3 pb-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Статус при смене профиля: 1.5 сек, плавное появление/исчезновение (резерв 20px без сдвига) */}
          {mode === "recipes" && (
            <div className="min-h-[16px] flex items-center pt-0.5">
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
              <div className="rounded-2xl p-4 bg-card border border-border shadow-soft max-w-[85%]">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
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
                isConsultationMode={isConsultationMode}
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
                <div className="rounded-2xl p-4 bg-card border border-border shadow-soft max-w-[85%]">
                  <p className="text-sm text-foreground leading-relaxed">
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

          <div ref={messagesEndRef} />
        </div>

        {/* Input: единый стиль, 16px padding, divider */}
        <div className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-background px-4 pt-2 pb-3 safe-bottom max-w-full overflow-x-hidden">
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
              className="min-h-[44px] max-h-[120px] flex-1 min-w-0 resize-none rounded-2xl bg-card border border-border py-3 px-4 text-sm placeholder:text-muted-foreground focus-visible:ring-primary/30"
              rows={1}
            />
            <div className="flex items-center gap-2 shrink-0 relative">
              {mode === "recipes" && (
                <div className="relative">
                  <button
                    ref={helpButtonRef}
                    type="button"
                    onClick={() => setShowHintsModal(true)}
                    title="Подсказки"
                    className={`h-10 w-10 rounded-full bg-muted border border-border text-muted-foreground flex items-center justify-center hover:bg-muted/80 hover:text-foreground active:scale-95 transition-all ${showHintPulseAccent ? "chat-hint-btn-pulse" : ""}`}
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
              className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-primary-foreground bg-primary hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
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

      <Paywall
        isOpen={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          useAppStore.getState().setPaywallCustomMessage(null);
        }}
      />
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
