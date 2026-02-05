import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosButton } from "@/components/sos/SosButton";
import { SosPaywallModal } from "@/components/sos/SosPaywallModal";
import { Paywall } from "@/components/subscription/Paywall";
import { SUPABASE_URL } from "@/integrations/supabase/client";

const SOS_TOPICS: { id: string; label: string; emoji: string }[] = [
  { id: "constipation_diarrhea", label: "Запор / Понос", emoji: "🚽" },
  { id: "new_food", label: "Ввод продукта", emoji: "🥄" },
  { id: "food_refusal", label: "Отказ от еды", emoji: "😤" },
  { id: "allergy", label: "Аллергия", emoji: "⚠️" },
  { id: "routine", label: "График кормления", emoji: "⏰" },
  { id: "spitting_up", label: "Срыгивание", emoji: "🍼" },
];

const sosHints: Record<string, string> = {
  constipation_diarrhea:
    "Пример: Не ходит в туалет 2 дня после введения банана. Живот спокойный.",
  new_food: "Пример: Можно ли в 7 месяцев давать клубнику? В каком виде?",
  food_refusal:
    "Пример: Ребенок перестал есть мясо, выплевывает кусочки. Что делать?",
  allergy:
    "Пример: Появились красные точки на животе после нового пюре из кабачка.",
  routine:
    "Пример: Как выстроить график, если ребенок спит 3 раза в день по 40 минут?",
  spitting_up:
    "Пример: Ребенок срыгивает больше 2 столовых ложек после обеда.",
};

export default function SosConsultant() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { selectedMember, members } = useFamily();
  const { isPremium } = useSubscription();
  const [sosPaywallOpen, setSosPaywallOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [inputSheetOpen, setInputSheetOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<(typeof SOS_TOPICS)[number] | null>(null);
  const [details, setDetails] = useState("");
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [result, setResult] = useState<{ topic: string; text: string } | null>(null);

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

  const sendSosRequest = useCallback(
    async (topic: (typeof SOS_TOPICS)[number], userMessage: string) => {
      if (!session?.access_token || !memberData) return;
      setLoadingTopic(topic.id);
      setResult(null);
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
          if (data?.error === "premium_required") {
            setInputSheetOpen(false);
            setSosPaywallOpen(true);
          } else {
            setResult({
              topic: topic.id,
              text: data?.message || "Ошибка запроса. Попробуйте позже.",
            });
          }
          return;
        }
        const text = data?.message?.trim() || "Нет ответа.";
        setResult({ topic: topic.id, text });
        setInputSheetOpen(false);
        setSelectedTopic(null);
        setDetails("");
      } catch {
        setResult({
          topic: topic.id,
          text: "Ошибка сети. Проверьте подключение и попробуйте снова.",
        });
      } finally {
        setLoadingTopic(null);
      }
    },
    [session?.access_token, memberData]
  );

  const handleSosClick = useCallback(
    (topic: (typeof SOS_TOPICS)[number]) => {
      if (!isPremium) {
        setSosPaywallOpen(true);
        return;
      }
      setSelectedTopic(topic);
      setDetails("");
      setInputSheetOpen(true);
    },
    [isPremium]
  );

  const handleGetAdvice = useCallback(() => {
    if (!selectedTopic || !memberData) return;
    const ageMonths = memberData.age_months;
    const userMessage = details.trim()
      ? `${selectedTopic.label}\n${details.trim()}`
      : `${selectedTopic.label}\nДай общий совет по этой проблеме для возраста ${ageMonths} мес`;
    sendSosRequest(selectedTopic, userMessage);
  }, [selectedTopic, details, memberData, sendSosRequest]);

  return (
    <MobileLayout
      title="SOS-консультант"
      showNav
      headerLeft={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      }
    >
      <div className="p-4 space-y-6">
        {!memberData && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Добавьте ребёнка в профиле, чтобы получать персональные рекомендации.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {SOS_TOPICS.map((topic) => (
            <SosButton
              key={topic.id}
              label={topic.label}
              emoji={topic.emoji}
              onClick={() => handleSosClick(topic)}
              disabled={loadingTopic !== null}
              showLock={!isPremium}
              locked={!isPremium}
            />
          ))}
        </div>

        {loadingTopic && (
          <Card className="border-primary/30">
            <CardContent className="p-6 flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Получаем рекомендацию...</span>
            </CardContent>
          </Card>
        )}

        {result && !loadingTopic && (
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <p className="text-sm whitespace-pre-wrap text-foreground">{result.text}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => setResult(null)}
              >
                Закрыть
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/plate-analysis")}
          >
            Анализ тарелки
          </Button>
        </div>
      </div>

      <SosPaywallModal
        open={sosPaywallOpen}
        onOpenChange={setSosPaywallOpen}
        onTryPremium={() => setPaywallOpen(true)}
      />

      <Paywall
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={() => setPaywallOpen(false)}
      />

      <Sheet open={inputSheetOpen} onOpenChange={setInputSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader>
            <SheetTitle>
              {selectedTopic ? `🆘 Помощь: ${selectedTopic.label}` : "🆘 Помощь"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              О чем можно спросить:
            </p>
            <Textarea
              placeholder={
                selectedTopic
                  ? sosHints[selectedTopic.id] ?? "Опишите ситуацию подробнее (необязательно)"
                  : "Опишите ситуацию подробнее (необязательно)"
              }
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="resize-none placeholder:text-muted-foreground"
              disabled={!!loadingTopic}
            />
            <Button
              className="w-full"
              onClick={handleGetAdvice}
              disabled={!!loadingTopic}
            >
              {loadingTopic ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Получить персональный совет
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
