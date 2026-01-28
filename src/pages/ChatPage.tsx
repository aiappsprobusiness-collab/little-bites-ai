import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, ChevronDown, Pencil } from "lucide-react";
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
import { detectMealType } from "@/utils/parseChatRecipes";
import { formatRecipeResponse, hasRecipeJson } from "@/utils/formatRecipeResponse";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rawContent?: string;
}

const SCENARIO_CHIPS = [
  "Придумать ужин на сегодня",
  "Быстрый завтрак ребёнку 2–3 года",
  "Идея перекуса в дорогу",
  "Что приготовить из...",
];

const HINTS = [
  "Напишите, что у вас есть дома, или для кого вы готовите – я подберу идеи.",
  "Ужин, ребёнок 2 года, мало времени.",
  "Что есть в холодильнике? Напишите продукты – предложу варианты ужина.",
  "Напишите возраст ребёнка и сколько у вас времени – подберу быстрый ужин.",
  "Остались вчерашние макароны или каши? Напишите, придумаю, как вкусно их использовать.",
  "Нет сил готовить долго? Напишите 3–4 продукта, которые точно есть, сделаем ужин из них.",
  "Нужен ужин без духовки и сложных шагов – расскажите, что у вас есть на кухне.",
  "Малыш привередничает? Напишите, что он сейчас ест/отказывается есть – предложу идеи.",
  "Нужны блюда без сахара/глютена/лактозы? Уточните ограничения в профиле – адаптирую рецепты.",
];

const STARTER_MESSAGE = "Я помогу с идеями, что приготовить для вашей семьи. Выберите, для кого готовим, и задайте вопрос.";

export default function ChatPage() {
  const { toast } = useToast();
  const { selectedChild, children, selectedChildId, setSelectedChildId } = useSelectedChild();
  const { canGenerate, isPremium, remaining, dailyLimit } = useSubscription();
  const { chat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage } = useChatHistory();
  const { saveRecipesFromChat } = useChatRecipes();

  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [input, setInput] = useState("");
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          formatted.push({
            id: `${msg.id}-assistant`,
            role: "assistant",
            content: msg.response,
            timestamp: new Date(msg.created_at),
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
      const displayMessage = hasRecipeJson(rawMessage) ? formatRecipeResponse(rawMessage) : rawMessage;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: displayMessage,
        timestamp: new Date(),
        rawContent: hasRecipeJson(rawMessage) ? rawMessage : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      await saveChat({
        message: userMessage.content,
        response: displayMessage,
        childId: selectedChild?.id ?? undefined,
      });

      try {
        const mealType = detectMealType(userMessage.content);
        const savedRecipes = await saveRecipesFromChat({
          userMessage: userMessage.content,
          aiResponse: rawMessage,
          childId: childIdForSave,
          mealType,
        });
        if (savedRecipes?.length > 0) {
          toast({
            title: "Рецепты сохранены",
            description: `${savedRecipes.length} рецепт(ов) добавлено в ваш список`,
          });
        }
      } catch (e) {
        console.error("Failed to save recipes from chat:", e);
      }
    } catch (err: any) {
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

  const handleScenarioChip = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

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
          <button
            onClick={() => setShowPaywall(true)}
            className="text-sm font-semibold text-primary bg-primary/15 px-3 py-1.5 rounded-full border border-primary/30"
          >
            {isPremium ? "∞" : `${remaining ?? 0}/${dailyLimit ?? 3}`}
          </button>
        </div>
      </div>

      <div className="flex flex-col h-[calc(100vh-130px)]">
        {/* Для кого готовим */}
        <div className="px-4 py-3 border-b border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Готовим для:</span>
            <Select
              value={selectedChildId ?? "family"}
              onValueChange={(v) => setSelectedChildId(v)}
            >
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
                <ChevronDown className="h-4 w-4 opacity-50" />
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
            {selectedChild && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowProfileSheet(true)}
                title="Редактировать профиль"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
          {children.length > 0 && (
            <div className="w-full overflow-x-auto">
              <div className="flex gap-2 pb-1 min-w-0">
                {children.map((c) => (
                  <Button
                    key={c.id}
                    variant={selectedChildId === c.id ? "default" : "outline"}
                    size="sm"
                    className="rounded-full shrink-0"
                    onClick={() => setSelectedChildId(c.id)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
              />
            ))}
          </AnimatePresence>

          {isChatting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
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

        {/* Chips, hint, input */}
        <div className="border-t border-border/50 bg-background/95 backdrop-blur px-4 py-3 space-y-2 safe-bottom">
          <div className="w-full overflow-x-auto">
            <div className="flex gap-2 pb-1 min-w-0">
              {SCENARIO_CHIPS.map((text) => (
                <Button
                  key={text}
                  variant="outline"
                  size="sm"
                  className="rounded-full shrink-0"
                  onClick={() => handleScenarioChip(text)}
                >
                  {text}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Опишите, что приготовить или что у вас есть дома…"
              className="min-h-[44px] max-h-[120px] resize-none rounded-2xl bg-card border-border/50 py-3"
              rows={1}
            />
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
        onOpenChange={setShowProfileSheet}
        child={selectedChild}
      />
    </MobileLayout>
  );
}
