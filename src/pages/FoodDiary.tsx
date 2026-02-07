import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { usePlateLogs } from "@/hooks/usePlateLogs";
import { SUPABASE_URL } from "@/integrations/supabase/client";

export default function FoodDiary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const { hasPremiumAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);

  // Нет доступа (free/expired): при открытии дневника — Paywall
  useEffect(() => {
    if (!hasPremiumAccess) {
      setPaywallCustomMessage("Готовьте для всех детей сразу с Premium — дневник и анализ тарелки.");
      setShowPaywall(true);
    }
    return () => setPaywallCustomMessage(null);
  }, [hasPremiumAccess, setShowPaywall, setPaywallCustomMessage]);
  const { selectedMember, members } = useFamily();
  const { logs, isLoading: logsLoading } = usePlateLogs(30);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResponse, setLastResponse] = useState<{ user: string; assistant: string } | null>(null);

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

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !session?.access_token || !memberData) return;
    setSending(true);
    setInput("");
    setLastResponse(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "balance_check",
          stream: false,
          memberData,
          memberId: selectedMember?.id ?? members[0]?.id ?? null,
          messages: [{ role: "user", content: text }],
        }),
      });
      const data = await res.json();
      const assistant = data?.message?.trim() || "Не удалось получить ответ.";
      setLastResponse({ user: text, assistant });
      queryClient.invalidateQueries({ queryKey: ["plate_logs", user?.id] });
    } catch {
      setLastResponse({
        user: text,
        assistant: "Ошибка сети. Попробуйте позже.",
      });
    } finally {
      setSending(false);
    }
  }, [input, session?.access_token, memberData, selectedMember?.id, members, queryClient, user?.id]);

  return (
    <MobileLayout
      title="Дневник питания"
      showNav
      headerLeft={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      }
    >
      <div className="flex flex-col h-[calc(100vh-3.5rem)] pb-16">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!memberData && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Добавьте ребёнка в профиле для персональных рекомендаций.
            </p>
          )}

          <p className="text-xs font-medium text-muted-foreground px-1">Сегодняшняя тарелка</p>

          {lastResponse && (
            <div className="space-y-3">
              <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">Вы:</p>
                  <p className="text-sm">{lastResponse.user}</p>
                </CardContent>
              </Card>
              <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm border-l-4 border-l-primary">
                <CardContent className="p-3">
                  <p className="text-xs text-primary font-medium mb-1">Рекомендация:</p>
                  <p className="text-sm whitespace-pre-wrap">{lastResponse.assistant}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            logs.map((log) => {
              const date = log.created_at ? new Date(log.created_at) : null;
              const dateStr = date ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "";
              return (
                <div key={log.id} className="space-y-2">
                  <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm relative">
                    <CardContent className="p-3 pr-20">
                      <p className="absolute top-2 right-2 text-[10px] text-muted-foreground">{dateStr}</p>
                      <p className="text-xs text-muted-foreground mb-1">Вы:</p>
                      <p className="text-sm">{log.user_message}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm relative border-l-4 border-l-primary">
                    <CardContent className="p-3 pr-20">
                      <p className="absolute top-2 right-2 text-[10px] text-muted-foreground">{dateStr}</p>
                      <p className="text-xs text-primary font-medium mb-1">Рекомендация:</p>
                      <p className="text-sm whitespace-pre-wrap">{log.assistant_message}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t bg-white/80 backdrop-blur-sm">
          <div className="flex gap-2 items-end rounded-full bg-slate-100/80 px-4 py-2 border border-slate-200/80">
            <Textarea
              placeholder="Что малыш съел сегодня? Например: полбаночки кабачка и компот"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              className="resize-none flex-1 min-h-[44px] max-h-24 bg-transparent border-0 shadow-none focus-visible:ring-0 rounded-full"
              disabled={sending || !memberData}
            />
            <Button
              size="icon"
              className="shrink-0 h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={sendMessage}
              disabled={sending || !input.trim() || !memberData}
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
