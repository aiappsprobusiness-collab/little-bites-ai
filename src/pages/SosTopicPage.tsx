import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSosTopicConfig } from "@/data/sosTopics";
import { cn } from "@/lib/utils";
import { Paywall } from "@/components/subscription/Paywall";
import {
  HelpChipRow,
  HelpPrimaryCTA,
  HelpAccordion,
} from "@/components/help-ui";

export default function SosTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { selectedMember, members, formatAge } = useFamily();
  const { hasAccess } = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const topic = topicId ? getSosTopicConfig(topicId) : null;

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;
  const ageMonths = selectedMember?.age_months ?? members[0]?.age_months ?? null;
  const ageLabel = ageMonths != null ? formatAge(ageMonths) : null;
  const personalization =
    memberName && ageLabel ? `Для ${memberName} · ${ageLabel}` : memberName ? `Для ${memberName}` : null;

  const locked = topic?.requiresPremium && !hasAccess;
  const showFreePart = true;
  const showFullContent = !locked || showFreePart;

  if (!topicId || !topic) {
    navigate("/sos", { replace: true });
    return null;
  }

  const handleAskAssistant = (prefill?: string) => {
    const text = prefill || topic.title;
    navigate(`/chat?mode=help&prefill=${encodeURIComponent(text)}`);
  };

  const handleUpgrade = () => {
    setPaywallOpen(true);
  };

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

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 pb-8">
        {topic.requiresPremium && (
          <div className={cn(
            "rounded-2xl border p-4 mb-6",
            "bg-primary/[0.06] border-primary/20"
          )}>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>
                {hasAccess ? "Персональные рекомендации" : "Premium: персональные рекомендации"}
              </span>
            </div>
            {topic.premiumValue && topic.premiumValue.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {topic.premiumValue.map((v, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            )}
            {!hasAccess && (
              <Button
                variant="default"
                size="sm"
                className="mt-3 rounded-xl"
                onClick={handleUpgrade}
              >
                Оформить Premium
              </Button>
            )}
          </div>
        )}

        {locked && (
          <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground leading-[1.65]">
              Откройте персональные рекомендации и план действий по этой теме.
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-3 rounded-xl"
              onClick={handleUpgrade}
            >
              Оформить Premium
            </Button>
          </div>
        )}

        {showFullContent && (
          <article className="space-y-6" style={{ lineHeight: 1.65 }}>
            {/* Короткий лид (1–2 строки) */}
            <p className="text-sm text-foreground leading-[1.65]">
              {(locked ? topic.intro.slice(0, 1) : topic.intro).slice(0, 2).join(" ")}
            </p>

            {/* Что это может быть */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Что это может быть</h2>
              {topic.intro.length > 2 && !locked ? (
                <div className="text-sm text-muted-foreground space-y-2 leading-[1.65]">
                  {topic.intro.slice(2).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : topic.bullets.length > 0 ? (
                <ul className="text-sm text-muted-foreground space-y-1.5 leading-[1.65] list-disc list-inside">
                  {topic.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Что делать сейчас */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Что делать сейчас</h2>
              <ul className="text-sm text-muted-foreground space-y-2 leading-[1.65]">
                {(locked ? topic.checklistNow.slice(0, 2) : topic.checklistNow).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Когда обращаться к врачу — блок с olive 5%, иконка ⚠️ */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Когда обращаться к врачу</h2>
              <div className="rounded-2xl bg-primary/[0.05] border border-primary/20 p-4 sm:p-5 flex gap-3">
                <span className="text-lg shrink-0 leading-none" aria-hidden>⚠️</span>
                <ul className="text-sm text-muted-foreground space-y-1.5 leading-[1.65] min-w-0">
                  {topic.redFlags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {!locked && topic.faq.length > 0 && (
              <section>
                <HelpAccordion
                  title="Частые вопросы"
                  items={topic.faq}
                  openIndex={openFaqIndex}
                  onToggle={(i) => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                />
              </section>
            )}

            {/* Спросить помощника */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-1.5">Спросить помощника</h2>
              <p className="text-[12px] text-muted-foreground mb-3 leading-[1.65]">
                Задайте свой вопрос — откроется чат с помощником.
              </p>
              <HelpChipRow
                items={topic.askChips.map((c) => ({ label: c.label, value: c.prefill }))}
                onSelect={(value) => handleAskAssistant(value)}
              />
              <HelpPrimaryCTA className="mt-3" onClick={() => handleAskAssistant()}>
                Спросить у помощника
              </HelpPrimaryCTA>
            </section>

            {/* Один дисклеймер */}
            <p className="text-[12px] text-muted-foreground mt-8 leading-[1.65]">
              Это справочная информация. Не заменяет консультацию врача.
            </p>
          </article>
        )}

        {!topic.requiresPremium && topic.premiumValue && topic.premiumValue.length > 0 && (
          <div className="mt-6 rounded-2xl border border-primary/10 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>Premium: персональный план</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {topic.premiumValue.slice(0, 2).map((v, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-xl"
              onClick={handleUpgrade}
            >
              Подробнее про Premium
            </Button>
          </div>
        )}
      </main>

      <Paywall
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={() => setPaywallOpen(false)}
      />
    </div>
  );
}
