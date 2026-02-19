import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Circle } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSosTopicConfig } from "@/data/sosTopics";
import { Paywall } from "@/components/subscription/Paywall";
import { HelpPrimaryCTA, HelpWarningCard } from "@/components/help-ui";

/** Обрезает текст до конца последнего предложения в пределах maxChars (~4–5 строк). */
function trimToSentenceEnd(text: string, maxChars: number = 320): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! ")
  );
  if (lastEnd > maxChars * 0.4) return slice.slice(0, lastEnd + 1).trim();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

export default function SosTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { selectedMember, members, formatAge } = useFamily();
  const { hasAccess } = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const topic = topicId ? getSosTopicConfig(topicId) : null;

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;
  const ageMonths = selectedMember?.age_months ?? members[0]?.age_months ?? null;
  const ageLabel = ageMonths != null ? formatAge(ageMonths) : null;
  const personalization =
    memberName && ageLabel ? `Для ${memberName} · ${ageLabel}` : memberName ? `Для ${memberName}` : null;

  const locked = topic?.requiresPremium && !hasAccess;

  if (!topicId || !topic) {
    navigate("/sos", { replace: true });
    return null;
  }

  const handlePersonalAnalysis = () => {
    if (locked) {
      setPaywallOpen(true);
      return;
    }
    const prefill = topic.prefillText || topic.title;
    navigate(`/chat?mode=help&prefill=${encodeURIComponent(prefill)}`);
  };

  const handleAskOwnQuestion = () => {
    if (locked) {
      setPaywallOpen(true);
      return;
    }
    navigate("/chat?mode=help");
  };

  const fullSummary = topic.intro.slice(0, 2).join(" ");
  const summaryText = trimToSentenceEnd(fullSummary);
  const causesList = topic.bullets.slice(0, 3);
  const causesExtra = topic.bullets.length - causesList.length;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-2 min-h-[var(--header-content-height)] px-4 py-3 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/sos")}
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-typo-title font-semibold text-foreground truncate">
            {topic.title}
          </h1>
          {personalization && (
            <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{personalization}</p>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 pb-10">
        <article className="space-y-8">
          {/* A) Короткое резюме (до конца предложения, 4–5 строк) */}
          <p className="text-sm text-foreground leading-relaxed">
            {summaryText}
          </p>

          {/* B) Возможные причины — 3 пункта, мягкий маркер, «и ещё X» */}
          {causesList.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Возможные причины</h2>
              <ul className="text-sm text-muted-foreground space-y-1.5 leading-[1.5]">
                {causesList.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Circle className="w-1.5 h-1.5 shrink-0 mt-2 fill-primary/70 text-primary/70" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
                {causesExtra > 0 && (
                  <li className="text-muted-foreground/80 text-[12px] pl-3.5">
                    и ещё {causesExtra}{" "}
                    {causesExtra === 1 ? "причина" : causesExtra >= 2 && causesExtra <= 4 ? "причины" : "причин"}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* C) Когда к врачу — HelpWarningCard */}
          {topic.redFlags.length > 0 && (
            <HelpWarningCard title="Когда к врачу">
              <ul className="space-y-1 text-sm">
                {topic.redFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </HelpWarningCard>
          )}

          {/* D) CTA: primary + secondary */}
          <section className="flex flex-col gap-3 pt-2">
            <HelpPrimaryCTA onClick={handlePersonalAnalysis}>
              {memberName
                ? `Получить персональный разбор для ${memberName}`
                : "Получить персональный разбор"}
            </HelpPrimaryCTA>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-10 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-2xl"
              onClick={handleAskOwnQuestion}
            >
              Задать свой вопрос
            </Button>
          </section>

          {/* Дисклеймер — минимальный, без плашки */}
          <p className="text-[11px] text-muted-foreground/80 pt-4">
            Справочная информация.
          </p>
        </article>
      </main>

      <Paywall
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={() => setPaywallOpen(false)}
      />
    </div>
  );
}
