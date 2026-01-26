import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Sparkles } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Paywall } from "@/components/subscription/Paywall";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInputPanel } from "@/components/chat/ChatInputPanel";
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
  const { canGenerate, isPremium, remaining, dailyLimit } = useSubscription();
  const { chat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage } = useChatHistory();
  const { saveRecipesFromChat } = useChatRecipes();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSend = async (input: string) => {
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

      const rawMessage = typeof response?.message === "string" ? response.message : "";
      const displayMessage = hasRecipeJson(rawMessage) ? formatRecipeResponse(rawMessage) : rawMessage;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: displayMessage,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Сохраняем в историю (форматированный текст с эмодзи для рецептов)
      await saveChat({
        message: userMessage.content,
        response: displayMessage,
        childId: selectedChild?.id,
      });

      // Парсим и сохраняем рецепты из сырого ответа (JSON)
      try {
        const mealType = detectMealType(userMessage.content);
        console.log('ChatPage - Detected meal type:', mealType, 'from message:', userMessage.content);
        const savedRecipes = await saveRecipesFromChat({
          userMessage: userMessage.content,
          aiResponse: rawMessage,
          childId: selectedChildId || undefined,
          mealType,
        });

        console.log('ChatPage - Saved recipes:', savedRecipes);
        if (savedRecipes && savedRecipes.length > 0) {
          toast({
            title: "Рецепты сохранены",
            description: `${savedRecipes.length} рецепт(ов) добавлено в ваш список`,
          });
        }
      } catch (error) {
        // Показываем ошибку для отладки
        console.error('Failed to save recipes from chat:', error);
      }
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
    handleSend(prompt);
  };

  const handleDeleteMessage = async (messageId: string) => {
    // Extract the original message ID from our formatted ID
    const originalId = messageId.replace('-user', '').replace('-assistant', '');
    
    try {
      await deleteMessage(originalId);
      // Remove both user and assistant messages with this ID
      setMessages((prev) => prev.filter((m) => !m.id.startsWith(originalId)));
      toast({
        title: "Сообщение удалено",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось удалить сообщение",
      });
    }
  };

  return (
    <MobileLayout showNav={true}>
      {/* Custom header */}
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

      <div className="flex flex-col h-[calc(100vh-130px)] relative">
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-20">
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
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                id={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                onDelete={handleDeleteMessage}
              />
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
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Готовим кулинарное чудо...
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* FAB Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowInputPanel(true)}
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-30"
        >
          <Send className="w-6 h-6" />
        </motion.button>
      </div>

      {/* Input Panel */}
      <ChatInputPanel
        isOpen={showInputPanel}
        onClose={() => setShowInputPanel(false)}
        onSend={handleSend}
        isSending={isChatting}
      />

      <Paywall isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
    </MobileLayout>
  );
}
