import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, MoreVertical, X, Star } from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFamily } from "@/contexts/FamilyContext";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import {
  getSession,
  upsertMessage,
  clearSession,
  type TopicSessionMessage,
} from "@/stores/helpTopicSessions";
import type { HelpChipItem } from "@/data/helpTopicChips";
import { HelpResponseBlocks } from "@/components/help/HelpResponseBlocks";
import { cn } from "@/lib/utils";

const MAX_MESSAGES = 12;

export interface TopicConsultationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topicKey: string;
  topicTitle: string;
  /** Чипсы: label на экране, text вставляется в input по клику (без автоотправки). */
  chips: HelpChipItem[];
  isLocked?: boolean;
  lockedDescription?: string;
  onOpenPremium?: () => void;
  /** Для quick topic: есть доступ (Premium/Trial). Если false, тап по premium-чипу открывает paywall. */
  hasAccess?: boolean;
  /** Для quick topic: вызвать при тапе по premium-чипу у Free пользователя (открыть paywall). */
  onPremiumChipTap?: () => void;
  /** Для quick topic: тексты premium-чипов. Fail-safe: не отправлять такие сообщения Free пользователю. */
  premiumChipTexts?: string[];
  /** При LIMIT_REACHED (help 2/день) — открыть paywall; payload.used обновляет счётчик оставшихся запросов. */
  onLimitReached?: (payload?: { feature: string; limit: number; used: number }) => void;
  /** При открытии sheet подставить этот текст в поле ввода (hero чипсы / карточка «Сегодня спрашивают» / тема). Без автоотправки — отправка только по кнопке. */
  initialMessage?: string | null;
  onInitialMessageSent?: () => void;
}

export function TopicConsultationSheet({
  isOpen,
  onClose,
  topicKey,
  topicTitle,
  chips,
  isLocked = false,
  lockedDescription,
  onOpenPremium,
  hasAccess = true,
  onPremiumChipTap,
  premiumChipTexts,
  onLimitReached,
  initialMessage,
  onInitialMessageSent,
}: TopicConsultationSheetProps) {
  const { selectedMemberId, members } = useFamily();
  const { chat } = useDeepSeekAPI();
  /** "family" = общий ответ / уточнить о ком речь; иначе id ребёнка для персонального ответа. */
  const memberId =
    selectedMemberId === "family" || selectedMemberId == null
      ? "family"
      : selectedMemberId || members[0]?.id || "family";

  const [messages, setMessages] = useState<TopicSessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** При отправке сообщения считаем, что пользователь у низа; скроллим к ответу только тогда */
  const wasUserAtBottomRef = useRef(false);
  /** Чтобы при сбросе initialMessage родителем не затирать уже подставленный текст */
  const initialPrefillConsumedRef = useRef(false);

  const loadSession = useCallback(() => {
    if (!memberId || !topicKey) return;
    const session = getSession(memberId, topicKey);
    setMessages(session ?? []);
  }, [memberId, topicKey]);

  useEffect(() => {
    if (isOpen) {
      loadSession();
      if (initialMessage?.trim()) {
        setInput(initialMessage);
        onInitialMessageSent?.();
        initialPrefillConsumedRef.current = true;
        inputRef.current?.focus();
      } else if (!initialPrefillConsumedRef.current) {
        setInput("");
      }
    } else {
      initialPrefillConsumedRef.current = false;
    }
  }, [isOpen, initialMessage, loadSession, onInitialMessageSent]);

  useEffect(() => {
    if (isOpen && memberId && topicKey) loadSession();
  }, [memberId, topicKey, isOpen, loadSession]);

  // После появления нового ответа ассистента — скролл к началу сообщения только если пользователь сам отправил (был у низа)
  const lastMessage = messages[messages.length - 1];
  const lastIsAssistantWithContent =
    lastMessage?.role === "assistant" && lastMessage.content.length > 0;

  useEffect(() => {
    if (!lastIsAssistantWithContent || isSending) return;
    if (!wasUserAtBottomRef.current) return;
    wasUserAtBottomRef.current = false;
    lastAssistantMessageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [lastIsAssistantWithContent, isSending]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !topicKey || isLocked) return;

      // Fail-safe: quick topic — не отправлять premium prompt Free пользователю
      if (
        topicKey === "quick" &&
        premiumChipTexts?.length &&
        premiumChipTexts.some((p) => p.trim() === trimmed) &&
        !hasAccess &&
        onPremiumChipTap
      ) {
        onPremiumChipTap();
        return;
      }

      const userMsg: TopicSessionMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      const assistantId = `a-${Date.now()}`;
      const assistantPlaceholder: TopicSessionMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };

      wasUserAtBottomRef.current = true;

      setMessages((prev) => {
        const next = [...prev, userMsg, assistantPlaceholder].slice(-MAX_MESSAGES);
        upsertMessage(memberId, topicKey, userMsg);
        return next;
      });
      setIsSending(true);
      setInput("");

      try {
        const chatMessages = messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        chatMessages.push({ role: "user", content: trimmed });

        const response = await chat({
          messages: chatMessages,
          type: "sos_consultant",
          overrideSelectedMemberId: memberId || undefined,
        });
        const rawMessage = (response?.message ?? "").trim() || "Не удалось получить ответ.";

        const assistantMsg: TopicSessionMessage = {
          id: assistantId,
          role: "assistant",
          content: rawMessage,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === assistantId ? assistantMsg : m
          );
          upsertMessage(memberId, topicKey, assistantMsg);
          return next;
        });
      } catch (err) {
        const msg = (err as { message?: string })?.message;
        const payload = (err as { payload?: { feature: string; limit: number; used: number } })?.payload;
        if (msg === "LIMIT_REACHED" && onLimitReached) {
          onLimitReached(payload);
        }
        const fallbackText =
          msg === "HELP_TIMEOUT"
            ? "Ответ занимает больше времени. Попробуйте ещё раз."
            : msg === "LIMIT_REACHED"
              ? "Лимит на сегодня исчерпан. Попробуйте завтра или откройте Trial."
              : "Ошибка отправки. Попробуйте ещё раз.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fallbackText } : m))
        );
      } finally {
        setIsSending(false);
      }
    },
    [memberId, topicKey, messages, chat, isLocked, hasAccess, premiumChipTexts, onPremiumChipTap, onLimitReached]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleClearSession = () => {
    clearSession(memberId, topicKey);
    setMessages([]);
  };

  /** Чипс: premium без доступа → paywall; иначе вставить text в input */
  const handleChipClick = (chip: HelpChipItem) => {
    if (isLocked) return;
    if (chip.access === "paid" && !hasAccess && onPremiumChipTap) {
      onPremiumChipTap();
      return;
    }
    setInput(chip.text);
    inputRef.current?.focus();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-black/20"
        className={cn(
          "h-[90dvh] max-h-[92dvh] rounded-t-2xl border-t flex flex-col p-0 gap-0",
          "[&>button]:hidden"
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header: только title + close */}
          <div className="flex items-center gap-2 shrink-0 px-4 py-3 border-b border-border">
            <h2
              className="flex-1 min-w-0 text-[17px] font-semibold text-foreground leading-snug line-clamp-2 break-words hyphens-auto"
              style={{ wordBreak: "break-word" }}
            >
              {topicTitle}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Закрыть"
              className="shrink-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {isLocked ? (
            /* Locked: описание, чипсы disabled, CTA Premium, Назад */
            <div className="flex-1 flex flex-col px-4 py-6 gap-6 overflow-y-auto">
              {lockedDescription && (
                <p className="text-sm text-muted-foreground leading-[1.6]">
                  {lockedDescription}
                </p>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1 flex-nowrap">
                {chips.map((chip) => (
                  <span
                    key={chip.label}
                    className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium border border-border bg-muted/30 text-muted-foreground cursor-not-allowed whitespace-nowrap"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex flex-col gap-3 pt-4">
                <Button
                  className="h-[52px] rounded-[18px] font-semibold bg-primary text-primary-foreground"
                  onClick={onOpenPremium}
                >
                  Открыть в Premium
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-[18px]"
                  onClick={onClose}
                >
                  Назад
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Menu: clear session */}
              <div className="flex justify-end px-2 py-1 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Меню">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleClearSession}>
                      Очистить консультацию
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Подсказка над чипсами */}
              <p className="shrink-0 px-4 text-[12px] text-muted-foreground pb-1.5">
                Выберите быстрый вопрос или опишите своими словами
              </p>

              {/* Чип-ряд: Free сначала, затем Premium (с маркером для Free пользователя) */}
              <div className="shrink-0 px-4 pb-2">
                <div className="flex gap-2 overflow-x-auto pb-1 flex-nowrap overflow-y-hidden">
                  {[...chips]
                    .sort((a, b) => (a.access === "free" ? 0 : 1) - (b.access === "free" ? 0 : 1))
                    .map((chip) => {
                      const isPremiumLocked = chip.access === "paid" && !hasAccess;
                      return (
                        <button
                          key={chip.text}
                          type="button"
                          onClick={() => handleChipClick(chip)}
                          disabled={isSending}
                          className={cn(
                            "shrink-0 px-3 py-2 rounded-full text-[13px] font-medium border transition-colors duration-200 whitespace-nowrap flex items-center gap-1",
                            isPremiumLocked
                              ? "border-amber-200 bg-amber-50/80 text-foreground hover:bg-amber-100/80 active:bg-amber-100"
                              : "border-border/80 bg-background text-foreground hover:bg-muted/30 active:bg-primary/5 active:border-primary/20"
                          )}
                        >
                          {isPremiumLocked && (
                            <Star className="w-3 h-3 text-amber-600 shrink-0" aria-hidden />
                          )}
                          {chip.label}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesScrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 min-h-0"
              >
                <div className="space-y-3 pb-4">
                  {messages.map((m, index) => {
                    const isLastAssistant =
                      m.role === "assistant" &&
                      index === messages.length - 1 &&
                      m.content.length > 0;
                    return (
                      <div
                        key={m.id}
                        ref={isLastAssistant ? lastAssistantMessageRef : undefined}
                        className={cn(
                          "flex",
                          m.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-[1.6]",
                            m.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted/50 text-foreground rounded-bl-md"
                          )}
                        >
                        {m.role === "user" ? (
                          <p className="break-words whitespace-pre-wrap">{m.content}</p>
                        ) : (
                          <>
                            <HelpResponseBlocks content={m.content ?? ""} />
                            {(m.content === "Ответ занимает больше времени. Попробуйте ещё раз." ||
                              m.content === "Ошибка отправки. Попробуйте ещё раз.") &&
                              index === messages.length - 1 &&
                              messages.length >= 2 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => {
                                    const lastUser = messages[messages.length - 2];
                                    if (lastUser?.role === "user") sendMessage(lastUser.content);
                                  }}
                                >
                                  Повторить
                                </Button>
                              )}
                          </>
                        )}
                        </div>
                      </div>
                    );
                  })}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted/50 flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Думаю…</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Composer Help: input на всю ширину, до 2 строк; компактная кнопка Send */}
              <form
                onSubmit={handleSubmit}
                className="shrink-0 p-4 pt-2 border-t border-border bg-background"
              >
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Напишите, что происходит…"
                    rows={2}
                    className="flex-1 min-w-0 min-h-[48px] max-h-[4.5rem] resize-none rounded-xl border-border focus-visible:border-primary/40 border-primary/20"
                    disabled={isSending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(input);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground"
                    disabled={!input.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
