import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSosContext } from "@/contexts/SosContext";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  getTopicById,
  SOS_TOPIC_IDS,
  sosHints,
  sanitizeSosResponse,
  stripEmojiForDisplay,
} from "@/constants/sos";
import { SUPABASE_URL } from "@/integrations/supabase/client";

export default function SosScenarioScreen() {
  const { scenarioKey } = useParams<{ scenarioKey: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { selectedMember, members, formatAge } = useFamily();
  const { messagesByScenario, appendMessage } = useSosContext();

  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset(true);

  const topic = getTopicById(scenarioKey ?? undefined);
  const validKey = topic && SOS_TOPIC_IDS.has(topic.id) ? topic.id : null;

  const memberData = selectedMember
    ? {
        name: selectedMember.name,
        age_months: selectedMember.age_months ?? 0,
        allergies: selectedMember.allergies ?? [],
      }
    : members[0]
      ? {
          name: members[0].name,
          age_months: members[0].age_months ?? 0,
          allergies: members[0].allergies ?? [],
        }
      : null;

  const messages = validKey ? messagesByScenario[validKey] ?? [] : [];

  useEffect(() => {
    if (!scenarioKey || !SOS_TOPIC_IDS.has(scenarioKey)) {
      navigate("/sos", { replace: true });
    }
  }, [scenarioKey, navigate]);

  useEffect(() => {
    if (topic?.id === "food_diary" && memberData && !details) {
      const ageStr = memberData.age_months != null ? formatAge(memberData.age_months) : "[возраст]";
      setDetails(
        `Ребёнку ${ageStr}. Сегодня ел(а): [список продуктов/объёмы]. Дай рекомендации: что оставить, что добавить/заменить и почему в следующий раз.`
      );
    }
  }, [topic?.id, memberData, formatAge]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [validKey]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (keyboardInset > 0) scrollToBottom();
  }, [keyboardInset, scrollToBottom]);

  const sendRequest = useCallback(async () => {
    if (!validKey || !topic || !session?.access_token || !memberData || loading) return;
    const ageMonths = memberData.age_months;
    const userMessage = details.trim()
      ? `${topic.label}\n${details.trim()}`
      : `${topic.label}\nДай общий совет по этой проблеме для возраста ${ageMonths} мес`;

    appendMessage(validKey, { role: "user", content: userMessage });
    setDetails("");
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "sos_consultant",
          stream: false,
          memberData,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const text = data?.message || "Ошибка запроса. Попробуйте позже.";
        appendMessage(validKey, { role: "assistant", content: text });
        return;
      }
      const raw = (data?.message ?? "").trim() || "Нет ответа.";
      const text = sanitizeSosResponse(raw);
      appendMessage(validKey, { role: "assistant", content: text });
      scrollToBottom();
    } catch {
      appendMessage(validKey, { role: "assistant", content: "Ошибка сети. Проверьте подключение и попробуйте снова." });
      scrollToBottom();
    } finally {
      setLoading(false);
    }
  }, [validKey, topic, session?.access_token, memberData, details, loading, appendMessage, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendRequest();
      }
    },
    [sendRequest]
  );

  if (!validKey || !topic) {
    return null;
  }

  return (
    <div
      className="flex flex-col bg-background text-foreground"
      style={{ height: "100dvh", minHeight: "100dvh" }}
    >
      <header className="sticky top-0 z-40 flex items-center gap-2 min-h-[var(--header-content-height)] px-4 py-[var(--header-row-py)] border-b border-slate-200/40 bg-background/98 backdrop-blur layout-header-safe shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/sos")}
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="flex-1 text-typo-title font-semibold truncate">
          {topic.label}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-typo-muted text-slate-600 text-sm">
            Опишите ситуацию — получите персональный совет. Можно отправить и общий запрос.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-2xl px-4 py-3 max-w-[90%] ${
              msg.role === "user"
                ? "ml-auto rounded-br-sm bg-emerald-600 text-white"
                : "mr-auto rounded-bl-sm bg-slate-100 text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {msg.role === "assistant" ? stripEmojiForDisplay(msg.content) : msg.content}
            </p>
          </div>
        ))}
        {loading && (
          <div className="mr-auto rounded-2xl rounded-bl-sm px-4 py-3 bg-slate-100 text-slate-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="text-sm">Получаем рекомендацию...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        className="sticky bottom-0 border-t border-slate-200/40 bg-background/98 backdrop-blur py-3 px-4 safe-bottom shrink-0"
        style={keyboardInset > 0 ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
      >
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={sosHints[topic.id] ?? "Опишите ситуацию (необязательно)"}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-xl border-slate-200 text-typo-body placeholder:text-slate-400"
            disabled={loading}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700"
            onClick={() => sendRequest()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
