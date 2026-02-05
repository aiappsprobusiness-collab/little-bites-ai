import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { usePlateLogs } from "@/hooks/usePlateLogs";
import { SUPABASE_URL } from "@/integrations/supabase/client";

export default function PlateAnalysis() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
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
      title="Анализ тарелки"
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

          {lastResponse && (
            <div className="space-y-3">
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">Вы:</p>
                  <p className="text-sm">{lastResponse.user}</p>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
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
            logs.map((log) => (
              <div key={log.id} className="space-y-2">
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground mb-1">Вы:</p>
                    <p className="text-sm">{log.user_message}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-primary font-medium mb-1">Рекомендация:</p>
                    <p className="text-sm whitespace-pre-wrap">{log.assistant_message}</p>
                  </CardContent>
                </Card>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t bg-background">
          <div className="flex gap-2">
            <Textarea
              placeholder="Опишите, что съел ребёнок (например: каша овсяная, полбанана, компот)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              className="resize-none"
              disabled={sending || !memberData}
            />
            <Button
              size="icon"
              className="shrink-0 h-auto"
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
