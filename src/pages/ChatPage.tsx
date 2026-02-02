import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Send, Loader2, Pencil, Plus, Settings, Square, HelpCircle } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Paywall } from "@/components/subscription/Paywall";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useSubscription } from "@/hooks/useSubscription";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
}

const STARTER_MESSAGE = "Я помогу с идеями, что приготовить для вашей семьи. Выберите, для кого готовим, и задайте вопрос.";

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedChild, children, selectedChildId, setSelectedChildId } = useSelectedChild();
  const { canGenerate, isPremium, remaining, dailyLimit } = useSubscription();
  const { chat, abortChat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage } = useChatHistory();
  const { saveRecipesFromChat } = useChatRecipes();

  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [sheetCreateMode, setSheetCreateMode] = useState(false);
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);

  const childIdForSave = selectedChildId && selectedChildId !== "family" ? selectedChildId : undefined;

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

  const handleSend = async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isChatting) return;
    if (!canGenerate && !isPremium) {
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
    setMessages((prev) => [...prev, userMessage]);

    try {
      const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      chatMessages.push({ role: "user", content: userMessage.content });

      const response = await chat({ messages: chatMessages, type: "chat" });
      const rawMessage = typeof response?.message === "string" ? response.message : "";

      const parsed = parseRecipesFromChat(userMessage.content, rawMessage);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: parsed.displayText,
        timestamp: new Date(),
        rawContent: rawMessage,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const mealType = detectMealType(userMessage.content);
        const { savedRecipes } = await saveRecipesFromChat({
          userMessage: userMessage.content,
          aiResponse: rawMessage,
          childId: childIdForSave,
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
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        toast({ title: "Остановлено" });
        return;
      }
      if (err?.message === "usage_limit_exceeded") {
        setShowPaywall(true);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } else {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Не удалось получить ответ. Попробуйте снова.",
        });
      }
    }
  };

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
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Готовим для:</span>
            <Select
              value={selectedChildId ?? "family"}
              onValueChange={(v) => setSelectedChildId(v)}
            >
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Семья</SelectItem>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
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
            {selectedChild && (
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-4">
          {showStarter && !hasUserMessage && (
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
                content={m.content}
                timestamp={m.timestamp}
                rawContent={m.rawContent}
                onDelete={handleDeleteMessage}
                childId={selectedChild?.id}
                childName={selectedChild?.name}
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
      <ProfileEditSheet
        open={showProfileSheet}
        onOpenChange={(open) => {
          setShowProfileSheet(open);
          if (!open) setSheetCreateMode(false);
        }}
        child={sheetCreateMode ? null : selectedChild ?? null}
        createMode={sheetCreateMode}
        onAddNew={() => setSheetCreateMode(true)}
        onCreated={(childId) => setSelectedChildId(childId)}
      />
      <Dialog open={showHintsModal} onOpenChange={setShowHintsModal}>
        <DialogContent className="max-w-[320px] p-4">
          <DialogHeader className="space-y-1 pb-2">
            <DialogTitle className="text-base">Подсказки</DialogTitle>
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
