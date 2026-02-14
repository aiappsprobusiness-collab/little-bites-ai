import { useState, useCallback, useRef, useEffect, type ComponentType } from "react";
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
import { Loader2, ArrowLeft, Baby, UtensilsCrossed, Apple, AlertCircle, Clock, Droplets, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { SosButton } from "@/components/sos/SosButton";
import { SosPaywallModal } from "@/components/sos/SosPaywallModal";
import { Paywall } from "@/components/subscription/Paywall";
import { SUPABASE_URL } from "@/integrations/supabase/client";

const SOS_TOPICS: {
  id: string;
  label: string;
  emoji: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "constipation_diarrhea", label: "Стул малыша", emoji: "🚽", icon: Baby },
  { id: "new_food", label: "Ввод нового продукта", emoji: "🥄", icon: Apple },
  { id: "food_refusal", label: "Не хочет есть", emoji: "😤", icon: UtensilsCrossed },
  { id: "allergy", label: "Аллергия или реакция", emoji: "⚠️", icon: AlertCircle },
  { id: "routine", label: "График кормления", emoji: "⏰", icon: Clock },
  { id: "spitting_up", label: "Срыгивание", emoji: "🍼", icon: Droplets },
  { id: "food_diary", label: "Дневник питания", emoji: "📋", icon: ClipboardList },
];

const sosHints: Record<string, string> = {
  constipation_diarrhea:
    "Опишите, как часто бывает стул, консистенция, как давно изменилось",
  new_food: "Напишите, какой продукт хотите ввести и в каком виде",
  food_refusal:
    "Опишите, что именно отказывается есть и как давно это началось",
  allergy:
    "Опишите, что появилось (сыпь, краснота) и после чего",
  routine:
    "Опишите текущий режим: сколько раз ест, примерные объёмы",
  spitting_up:
    "Опишите, как часто и сколько примерно срыгивает",
  food_diary:
    "Укажите, чем кормили ребёнка, и я подскажу, что улучшить в следующий раз.",
};

/** Убирает эмодзи из текста только для отображения (спокойнее вид). Переносы строк сохраняются. */
function stripEmojiForDisplay(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]/gu, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const SOS_RESPONSE_PREFIX_PATTERNS = [
  /^Здравствуйте!?\s*/i,
  /^Привет!?\s*/i,
  /Выберите\s+(профиль|ребёнка|ребенка)[^.!?]*[.!?]?\s*/i,
  /Я\s+мгновенно\s+подберу[^.!?]*[.!?]?\s*/i,
  /Сначала\s+выберите\s+профиль[^.!?]*[.!?]?\s*/i,
];

/** Удаляет типовые префиксы приветствия/просьбы выбрать профиль в начале ответа (только в первых ~200 символах). */
function sanitizeSosResponse(text: string): string {
  if (!text || text.length < 10) return text;
  const maxHead = 220;
  const head = text.slice(0, maxHead);
  let cleaned = head;
  for (const re of SOS_RESPONSE_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(re, "");
  }
  cleaned = cleaned.trimStart();
  const tail = text.slice(maxHead);
  const result = (cleaned || head) + tail;
  return result.trimStart() || text;
}

export default function SosConsultant() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { selectedMember, members, formatAge } = useFamily();
  const { isPremium } = useSubscription();
  const [sosPaywallOpen, setSosPaywallOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [inputSheetOpen, setInputSheetOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<(typeof SOS_TOPICS)[number] | null>(null);
  const [details, setDetails] = useState("");
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [result, setResult] = useState<{ topic: string; text: string } | null>(null);

  const resultCardRef = useRef<HTMLDivElement>(null);
  // visualViewport: клавиатурный offset считается в useKeyboardInset, сдвигаем sheet вверх, чтобы инпут был виден
  const keyboardInset = useKeyboardInset(inputSheetOpen);

  useEffect(() => {
    if (result && resultCardRef.current) {
      requestAnimationFrame(() => {
        resultCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [result]);

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
      if (topic.id === "food_diary" && memberData) {
        const ageStr = memberData.age_months != null ? formatAge(memberData.age_months) : "[возраст]";
        setDetails(`Ребёнку ${ageStr}. Сегодня ел(а): [список продуктов/объёмы]. Дай рекомендации: что оставить, что добавить/заменить и почему в следующий раз.`);
      } else {
        setDetails("");
      }
      setInputSheetOpen(true);
    },
    [isPremium, memberData, formatAge]
  );

  const handleGetAdvice = useCallback(() => {
    if (!selectedTopic || !memberData || loadingTopic) return;
    const ageMonths = memberData.age_months;
    const userMessage = details.trim()
      ? `${selectedTopic.label}\n${details.trim()}`
      : `${selectedTopic.label}\nДай общий совет по этой проблеме для возраста ${ageMonths} мес`;
    sendSosRequest(selectedTopic, userMessage);
  }, [selectedTopic, details, memberData, sendSosRequest, loadingTopic]);

  const handleSosKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleGetAdvice();
      }
    },
    [handleGetAdvice]
  );

  return (
    <MobileLayout
      title="Мы рядом"
      showNav
      headerLeft={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      }
    >
      <div className="p-4 space-y-6 bg-slate-50 min-h-full">
        {!memberData && (
          <p className="text-typo-muted text-muted-foreground text-center py-4">
            Добавьте ребёнка в профиле, чтобы получать персональные рекомендации.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {SOS_TOPICS.map((topic) => {
            const Icon = topic.icon;
            return (
              <SosButton
                key={topic.id}
                label={topic.label}
                subtext={topic.id === "food_diary" ? "Записать кормление и получить совет" : undefined}
                emoji={topic.emoji}
                icon={<Icon className="w-5 h-5 text-emerald-700" />}
                onClick={() => handleSosClick(topic)}
                disabled={loadingTopic !== null}
                showLock={!isPremium}
                locked={!isPremium}
              />
            );
          })}
        </div>

        {loadingTopic && (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <CardContent className="p-6 flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-typo-muted text-slate-500">Получаем рекомендацию...</span>
            </CardContent>
          </Card>
        )}

        {result && !loadingTopic && (
          <Card ref={resultCardRef} className="rounded-2xl border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
            <CardContent className="p-5 pb-4">
              <div className="space-y-4 text-typo-muted text-slate-700 leading-relaxed">
                {(() => {
                  const sanitized = sanitizeSosResponse(result.text);
                  const displayText = stripEmojiForDisplay(sanitized);
                  const paragraphs = displayText.split(/\n\n+/).filter(Boolean);
                  if (paragraphs.length === 0) return <p className="whitespace-pre-wrap">{sanitized}</p>;
                  return paragraphs.map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {paragraph.trim()}
                    </p>
                  ));
                })()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 text-slate-500"
                onClick={() => setResult(null)}
              >
                Закрыть
              </Button>
            </CardContent>
          </Card>
        )}
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
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-safe px-6 pt-6 pb-8 transition-transform duration-150"
          style={
            keyboardInset > 0
              ? { transform: `translateY(-${keyboardInset}px)` }
              : undefined
          }
        >
          <SheetHeader className="px-0">
            <SheetTitle className="text-typo-title font-semibold text-slate-900">
              {selectedTopic ? selectedTopic.label : "Мы рядом"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <p className="text-typo-muted text-slate-600">
              О чём можно спросить
            </p>
            <Textarea
              placeholder={
                selectedTopic
                  ? sosHints[selectedTopic.id] ?? "Опишите ситуацию (необязательно)"
                  : "Опишите ситуацию (необязательно)"
              }
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              onKeyDown={handleSosKeyDown}
              rows={4}
              className="resize-none rounded-xl border-slate-200 text-typo-body placeholder:text-slate-400"
              disabled={!!loadingTopic}
            />
            <Button
              className="w-full h-12 rounded-[14px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-none"
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
