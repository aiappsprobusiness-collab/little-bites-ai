import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UsageBadge } from "@/components/subscription/UsageBadge";
import { Paywall } from "@/components/subscription/Paywall";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const quickPrompts = [
  "Что приготовить на обед?",
  "Рецепт для аллергика",
  "Идеи для перекуса",
  "Меню на неделю",
];

export default function ChatPage() {
  const { toast } = useToast();
  const { selectedChild, children, selectedChildId, setSelectedChildId } = useSelectedChild();
  const { canGenerate, isPremium } = useSubscription();
  const { chat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, clearHistory } = useChatHistory();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Загружаем историю чата
  useEffect(() => {
    if (historyMessages.length > 0) {
      const formattedMessages: Message[] = [];
      historyMessages.forEach((msg: any) => {
        formattedMessages.push({
          id: `${msg.id}-user`,
          role: "user",
          content: msg.message,
          timestamp: new Date(msg.created_at),
        });
        if (msg.response) {
          formattedMessages.push({
            id: `${msg.id}-assistant`,
            role: "assistant",
            content: msg.response,
            timestamp: new Date(msg.created_at),
          });
        }
      });
      setMessages(formattedMessages);
    }
  }, [historyMessages]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isChatting) return;

    if (!canGenerate && !isPremium) {
      setShowPaywall(true);
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      chatMessages.push({ role: "user", content: userMessage.content });

      const response = await chat({
        messages: chatMessages,
        type: "chat",
      });

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Сохраняем в историю
      await saveChat({
        message: userMessage.content,
        response: response.message,
        childId: selectedChild?.id,
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      
      if (error.message === "usage_limit_exceeded") {
        setShowPaywall(true);
        // Удаляем сообщение пользователя, так как ответ не получен
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

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleClearHistory = async () => {
    try {
      await clearHistory();
      setMessages([]);
      toast({
        title: "История очищена",
        description: "Все сообщения удалены",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось очистить историю",
      });
    }
  };

  return (
    <MobileLayout 
      title="AI Помощник"
      headerRight={<UsageBadge onClick={() => setShowPaywall(true)} />}
    >
      <div className="flex flex-col h-[calc(100vh-180px)]">
        {/* Child selector dropdown */}
        <div className="px-4 py-3 border-b border-border/50">
          <Select 
            value={selectedChildId || "none"} 
            onValueChange={(value) => setSelectedChildId(value === "none" ? null : value)}
          >
            <SelectTrigger className="w-full bg-card">
              <SelectValue placeholder="Выберите ребенка для персонализации" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Выберите ребенка для персонализации</SelectItem>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.avatar_url || "👶"} {child.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !isLoadingHistory && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mb-4">
                <Sparkles className="w-10 h-10 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold mb-2">AI Помощник</h2>
              <p className="text-base text-muted-foreground mb-6 max-w-xs">
                {selectedChild 
                  ? `Готов помочь с питанием для ${selectedChild.name}!`
                  : "Задайте вопрос о детском питании или попросите рецепт"}
              </p>
              
              {/* Quick prompts */}
              <div className="flex flex-wrap justify-center gap-2">
                {quickPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPrompt(prompt)}
                    className="text-sm"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card shadow-soft rounded-bl-sm"
                  }`}
                >
                  <p className="text-base whitespace-pre-wrap">{message.content}</p>
                  <p className="text-[10px] opacity-60 mt-1">
                    {message.timestamp.toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isChatting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-card shadow-soft rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {selectedChild 
                      ? `DeepSeek думает для ${selectedChild.name}...`
                      : "DeepSeek думает..."}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Clear history button */}
        {messages.length > 0 && (
          <div className="flex justify-center py-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              className="text-sm text-muted-foreground"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Очистить историю
            </Button>
          </div>
        )}

        {/* Input area */}
        <div className="px-4 py-3 bg-background">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Спросите о рецепте или питании..."
                className="min-h-[52px] max-h-[120px] resize-none text-base rounded-2xl bg-card border-border/50"
                rows={1}
              />
            </div>
            <Button
              variant="mint"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isChatting}
              className="h-[52px] w-[52px] rounded-2xl flex-shrink-0"
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
    </MobileLayout>
  );
}
