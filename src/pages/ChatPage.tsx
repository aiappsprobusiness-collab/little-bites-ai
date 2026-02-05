import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, Loader2, Pencil, Plus, Settings, Square, HelpCircle, Mic, MicOff } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Paywall } from "@/components/subscription/Paywall";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { ArticleReaderModal } from "@/components/articles/ArticleReaderModal";
import { useArticle } from "@/hooks/useArticles";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToast } from "@/hooks/use-toast";
import { useChatRecipes } from "@/hooks/useChatRecipes";
import { detectMealType, parseRecipesFromChat } from "@/utils/parseChatRecipes";
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
  "Придумай ужин из того, что сейчас есть в холодильнике",
  "Составь меню на завтра без глютена и молока для ребенка",
  "Что приготовить за 15 минут, чтобы понравилось и мужу, и детям",
  "Найди рецепт полезного десерта без сахара для малыша",
  "Что приготовить на десерт с учетом аллергии?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
  /** Пока true, ответ ещё стримится; не показываем сырой JSON. */
  isStreaming?: boolean;
}

const STARTER_MESSAGE = "Здравствуйте! Выберите профиль, и я мгновенно подберу идеальный рецепт.";

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isLoadingMembers } = useFamily();
  const { canGenerate, isPremium, remaining, dailyLimit, usedToday, subscriptionStatus } = useSubscription();
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
          const { displayText } = parseRecipesFromChat(msg.message || "", msg.response);
          formatted.push({
            id: `${msg.id}-assistant`,
            role: "assistant",
            content: displayText,
            timestamp: new Date(msg.created_at),
            rawContent: msg.response,
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

      const response = await chat({
        messages: chatMessages,
        type: "chat",
        overrideSelectedMemberId: selectedMemberId,
        overrideSelectedMember: selectedMember,
        overrideMembers: members,
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: m.content + chunk, isStreaming: true } : m
            )
          );
        },
      });
      const rawMessage = typeof response?.message === "string" ? response.message : "";

      const parsed = parseRecipesFromChat(userMessage.content, rawMessage);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: parsed.displayText, rawContent: rawMessage, isStreaming: false }
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

  const { isListening, toggle: toggleMic } = useSpeechRecognition({
    onFinalTranscript: (text) => {
      if (!text.trim()) return;
      setInput(text);
      handleSend(text);
    },
    onError: (msg) => toast({ variant: "destructive", title: "Голосовой ввод", description: msg }),
  });

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
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 safe-top">
        <div className="flex items-center justify-between w-full px-4 h-14">
          <h1 className="text-lg font-bold text-foreground">AI Помощник</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPaywall(true)}
              className="text-sm font-semibold text-primary bg-primary/15 px-3 py-1.5 rounded-full border border-primary/30"
            >
              {isPremium ? "∞" : `${remaining ?? 0}/${dailyLimit ?? 3}`}
            </button>
            <button
              onClick={() => navigate("/profile")}
              title="Настройки профиля"
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-[calc(100vh-130px)]">
        {/* Для кого готовим — закреплён под шапкой, не убегает при скролле */}
        <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm px-4 py-3 border-b border-border/50 space-y-2 shrink-0">
          {isFree && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Осталось {remaining} из {dailyLimit} генераций сегодня
              </p>
              <Progress value={dailyLimit ? (usedToday / dailyLimit) * 100 : 0} className="h-1.5" />
            </div>
          )}
          {!(isFree && members.length === 0) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Готовим для:</span>
              <Select
                value={
                  isFree
                    ? (selectedMemberId === "family" ? members[0]?.id ?? "" : selectedMemberId ?? members[0]?.id ?? "")
                    : (selectedMemberId ?? "family")
                }
                onValueChange={(v) => {
                  const prev = isFree ? (selectedMemberId === "family" ? members[0]?.id : selectedMemberId) ?? members[0]?.id : selectedMemberId ?? "family";
                  if (v !== prev) setMessages([]);
                  setSelectedMemberId(v);
                }}
              >
                <SelectTrigger className="w-[180px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!isFree && <SelectItem value="family">Семья</SelectItem>}
                  {members.map((c, idx) => (
                    <SelectItem key={`${c.id}-${idx}`} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setSheetCreateMode(true);
                  setShowProfileSheet(true);
                }}
                title="Добавить профиль"
              >
                <Plus className="w-4 h-4" />
              </Button>
              {selectedMember && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setSheetCreateMode(false);
                    setShowProfileSheet(true);
                  }}
                  title="Редактировать профиль"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-4">
          {!isLoadingMembers && members.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-8 px-4 text-center"
            >
              <div className="rounded-2xl px-5 py-6 bg-card shadow-soft border border-border/50 max-w-[320px] space-y-4">
                <p className="text-base text-foreground leading-relaxed">
                  Добро пожаловать! Давайте создадим первый профиль члена семьи, чтобы я мог подбирать рецепты персонально.
                </p>
                <Button
                  onClick={() => {
                    setSheetCreateMode(true);
                    setShowProfileSheet(true);
                  }}
                  className="w-full"
                >
                  Создать профиль
                </Button>
              </div>
            </motion.div>
          )}

          {showStarter && !hasUserMessage && members.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-card shadow-soft max-w-[85%]">
                <p className="text-base whitespace-pre-wrap">{STARTER_MESSAGE}</p>
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
                onDelete={handleDeleteMessage}
                memberId={selectedMember?.id}
                memberName={selectedMember?.name}
                onOpenArticle={setOpenArticleId}
              />
            ))}
          </AnimatePresence>

          {isChatting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-start gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={abortChat}
                title="Остановить генерацию"
              >
                <Square className="w-4 h-4" />
              </Button>
              <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-card shadow-soft">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Готовим кулинарное чудо...</span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border/50 bg-background/95 backdrop-blur px-4 py-3 safe-bottom">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Что приготовить?"
              className="min-h-[44px] max-h-[120px] resize-none rounded-2xl bg-card border-border/50 py-3 pb-4"
              rows={1}
            />
            <button
              type="button"
              onClick={() => setShowHintsModal(true)}
              title="Подсказки"
              className="h-11 w-11 shrink-0 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 active:scale-95 transition-all"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isFree) {
                  setShowPaywall(true);
                } else {
                  toggleMic();
                }
              }}
              title={isFree ? "Голосовой ввод (Premium)" : (isListening ? "Остановить запись" : "Голосовой ввод")}
              className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all active:scale-95 ${isFree
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : isListening
                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <Button
              variant="mint"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              disabled={!input.trim() || isChatting}
              onClick={() => handleSend()}
            >
              {isChatting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
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
        <DialogContent className="max-w-[320px] p-4">
          <DialogHeader className="space-y-1 pb-2">
            <DialogTitle className="text-base">Подсказки</DialogTitle>
            <DialogDescription className="sr-only">Примеры запросов для чата с ИИ</DialogDescription>
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
                className="text-left px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 text-xs leading-tight transition-colors"
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
