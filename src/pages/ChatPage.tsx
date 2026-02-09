import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, Loader2, User, Square, HelpCircle } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Paywall } from "@/components/subscription/Paywall";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
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
import { detectMealType, parseRecipesFromChat, type ParsedRecipe } from "@/utils/parseChatRecipes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}

const STARTER_MESSAGE = "Здравствуйте! Выберите профиль, и я мгновенно подберу идеальный рецепт.";

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isLoadingMembers } = useFamily();
  const { canGenerate, isPremium, remaining, dailyLimit, usedToday, subscriptionStatus, isTrial, trialDaysRemaining } = useSubscription();
  const isFree = subscriptionStatus === "free";
  const { chat, abortChat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage } = useChatHistory();
  const { saveRecipesFromChat } = useChatRecipes();

  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [sheetCreateMode, setSheetCreateMode] = useState(false);
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { article: openArticle, isLoading: isArticleLoading } = useArticle(openArticleId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);
  const prevProfileKeyRef = useRef<string>("");
  /** Last saved recipe title (for anti-duplicate: retry once if model returns the same). */
  const lastSavedRecipeTitleRef = useRef<string | null>(null);

  // Очищаем сообщения при смене профиля или списка членов семьи
  useEffect(() => {
    const memberIds = members.map((c) => c.id).join(",");
    const key = `${selectedMemberId ?? "family"}|${memberIds}`;
    if (prevProfileKeyRef.current && prevProfileKeyRef.current !== key) {
      setMessages([]);
    }
    prevProfileKeyRef.current = key;
  }, [selectedMemberId, members]);

  const memberIdForSave = selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : undefined;

  useEffect(() => {
    if (historyMessages.length > 0) {
      const formatted: Message[] = [];
      historyMessages.forEach((msg: any) => {
        formatted.push({
          id: `${msg.id}-user`,
          role: "user",
          content: msg.message,
          timestamp: new Date(msg.created_at),
        });
        if (msg.response) {
          const { displayText, recipes } = parseRecipesFromChat(msg.message || "", msg.response);
          formatted.push({
            id: `${msg.id}-assistant`,
            role: "assistant",
            content: displayText,
            timestamp: new Date(msg.created_at),
            rawContent: msg.response,
            preParsedRecipe: recipes[0] ?? null,
          });
        }
      });
      setMessages(formatted);
    }
  }, [historyMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const showStarter = messages.length === 0 && !isLoadingHistory;
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

      let attempts = 0;
      let response: { message?: string } | null = null;
      let rawMessage = "";
      let parsed = parseRecipesFromChat(userMessage.content, "");

      while (attempts < 2) {
        response = await chat({
          messages: chatMessages,
          type: "chat",
          overrideSelectedMemberId: selectedMemberId,
          overrideSelectedMember: selectedMember,
          overrideMembers: members,
          ...(attempts > 0 && {
            extraSystemSuffix:
              "Previous recipe was duplicated. Generate a DIFFERENT recipe now.",
          }),
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
        parsed = parseRecipesFromChat(userMessage.content, rawMessage);
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

      if (!finalRecipe || !finalValidation.ok) {
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
                  preParsedRecipe: parsed.recipes[0] ?? null,
                }
              : m
          )
        );

        try {
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
          }

          await saveChat({
            message: userMessage.content,
            response: rawMessage,
          });

          if (savedRecipes?.length > 0) {
            toast({
              title: "Рецепты сохранены",
              description: `${savedRecipes.length} рецепт(ов) добавлено в ваш список`,
            });
          }
        } catch (e) {
          console.error("Failed to save recipes from chat:", e);
          await saveChat({ message: userMessage.content, response: rawMessage });
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

  // Обработка предзаполненного сообщения из ScanPage (после загрузки истории и определения handleSend)
  useEffect(() => {
    const state = location.state as { prefillMessage?: string; sourceProducts?: string[] } | null;
    if (state?.prefillMessage && !prefillSentRef.current && !isLoadingHistory && messages.length === 0) {
      prefillSentRef.current = true;
      const prefillText = state.prefillMessage;
      setInput(prefillText);
      // Автоматически отправляем сообщение после небольшой задержки
      const timer = setTimeout(() => {
        handleSend(prefillText);
        // Очищаем state после использования
        window.history.replaceState({}, document.title);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [location.state, isLoadingHistory, messages.length, handleSend]);

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

  return (
    <MobileLayout showNav>
      <div className="sticky top-0 z-40 bg-background/98 backdrop-blur-lg border-b border-slate-200/40 safe-top overflow-hidden max-w-full">
        <div className="container mx-auto px-3 sm:px-4 max-w-full">
          <div className="flex flex-col w-full py-2">
            {/* Row 1: Title left, Profile icon right */}
            <div className="flex items-center justify-between w-full min-w-0">
              <div className="leading-tight min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight truncate">Mom Recipes</h1>
                <p className="text-xs text-muted-foreground truncate">рядом на кухне</p>
              </div>
              <button
                onClick={() => navigate("/profile")}
                title="Профиль"
                className="h-9 w-9 shrink-0 rounded-full bg-slate-100/80 text-slate-600 flex items-center justify-center hover:bg-slate-200/70 hover:text-slate-700 active:scale-95 transition-all"
              >
                <User className="w-5 h-5" />
              </button>
            </div>
            {/* Блок с именем профиля под заголовком — по ширине как на Плане (w-fit) */}
            {members.length > 0 && (
              <div className="flex justify-start items-center mt-1.5 min-w-0 w-fit">
                {isFree ? (
                  <span className="inline-flex items-center w-fit rounded-full min-h-[40px] px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 whitespace-nowrap">
                    <span className="truncate max-w-[140px]">
                      {members.find((c) => c.id === (selectedMemberId ?? members[0]?.id))?.name ?? members[0]?.name ?? ""}
                    </span>
                  </span>
                ) : (
                  <Select
                    value={selectedMemberId ?? "family"}
                    onValueChange={(v) => {
                      const prev = selectedMemberId ?? "family";
                      if (v !== prev) setMessages([]);
                      setSelectedMemberId(v);
                    }}
                  >
                    <SelectTrigger className="inline-flex items-center w-fit max-w-[180px] rounded-full min-h-[40px] px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 active:bg-emerald-100 border-0 shadow-none transition-colors whitespace-nowrap [&>span]:truncate [&>span]:max-w-[140px] focus:ring-0 [&>svg]:hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="family">Семья</SelectItem>
                      {members.map((c, idx) => (
                        <SelectItem key={`${c.id}-${idx}`} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        </div>
        {isTrial && trialDaysRemaining !== null && (
          <div className="container mx-auto px-3 sm:px-4 pb-1.5 max-w-full">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              Trial: осталось {trialDaysRemaining} {trialDaysRemaining === 1 ? "день" : trialDaysRemaining < 5 ? "дня" : "дней"}
            </p>
          </div>
        )}
        {isFree && (
          <div className="container mx-auto px-3 sm:px-4 pb-1.5 max-w-full">
            <p className="text-[11px] text-muted-foreground/80">
              Осталось {remaining} из {dailyLimit} сегодня
            </p>
            <Progress value={dailyLimit ? (usedToday / dailyLimit) * 100 : 0} className="h-1 mt-0.5" />
          </div>
        )}
      </div>

      <div className="flex flex-col h-[calc(100vh-110px)] container mx-auto max-w-full overflow-x-hidden px-3 sm:px-4">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-5 space-y-5 pb-4">
          {!isLoadingMembers && members.length === 0 && (
            <FamilyOnboarding onComplete={() => {}} />
          )}

          {showStarter && !hasUserMessage && members.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-sm px-5 py-4 bg-slate-50/80 border border-slate-200/40 max-w-[85%]">
                <p className="text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">{STARTER_MESSAGE}</p>
              </div>
            </motion.div>
          )}

          {isLoadingHistory && (
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
                  m.role === "assistant" && m.isStreaming && m.content.trim().startsWith("{")
                    ? "Готовлю рецепт…"
                    : m.content
                }
                timestamp={m.timestamp}
                rawContent={m.rawContent}
                expectRecipe={m.role === "assistant"}
                preParsedRecipe={m.preParsedRecipe}
                onDelete={handleDeleteMessage}
                memberId={selectedMember?.id}
                memberName={selectedMember?.name}
                onOpenArticle={setOpenArticleId}
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
                  <span className="text-sm text-muted-foreground">Готовим кулинарное чудо...</span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200/40 bg-background/98 backdrop-blur py-3 safe-bottom max-w-full overflow-x-hidden">
          <div className="flex w-full items-center gap-2 min-w-0">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Что приготовить?"
              className="min-h-[44px] max-h-[120px] flex-1 min-w-0 resize-none rounded-2xl bg-slate-50/80 border-slate-200/50 py-3 px-4 text-base placeholder:text-muted-foreground/70 focus-visible:ring-emerald-500/30"
              rows={1}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowHintsModal(true)}
                title="Подсказки"
                className="h-9 w-9 rounded-full bg-slate-100/80 text-slate-500 flex items-center justify-center hover:bg-slate-200/60 hover:text-slate-600 active:scale-95 transition-all"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
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
      <ProfileEditSheet
        open={showProfileSheet}
        onOpenChange={(open) => {
          setShowProfileSheet(open);
          if (!open) setSheetCreateMode(false);
        }}
        member={sheetCreateMode ? null : selectedMember ?? null}
        createMode={sheetCreateMode}
        onAddNew={() => setSheetCreateMode(true)}
        onCreated={(memberId) => setSelectedMemberId(memberId)}
      />
      <Dialog open={showHintsModal} onOpenChange={setShowHintsModal}>
        <DialogContent className="w-[min(280px,calc(100vw-40px))] max-w-[280px] p-4 rounded-xl border-slate-200/50 mx-auto">
          <DialogHeader className="space-y-0.5 pb-3 text-center">
            <DialogTitle className="text-base font-medium text-foreground">Подсказки для мам 💛</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">С чего начать?</DialogDescription>
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
