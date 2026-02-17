import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSosTopicConfig } from "@/data/sosTopics";
import { cn } from "@/lib/utils";
import { Paywall } from "@/components/subscription/Paywall";

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

  const cardClass =
    "rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)]";

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
            <p className="text-xs text-muted-foreground truncate">{personalization}</p>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-8 space-y-4">
        {topic.requiresPremium && (
          <div className={cn(
            "rounded-2xl border p-4",
            hasAccess
              ? "bg-primary/5 border-primary/20"
              : "bg-amber-50/80 border-amber-200/60"
          )}>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {hasAccess ? "Персональные рекомендации" : "Premium: персональные рекомендации"}
              </span>
            </div>
            {topic.premiumValue && topic.premiumValue.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {topic.premiumValue.map((v, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
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
          <div className={cardClass + " bg-muted/30 border-amber-200/50"}>
            <p className="text-sm text-muted-foreground">
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
          <>
            <section className={cardClass}>
              <h2 className="text-sm font-semibold text-foreground mb-2">Коротко</h2>
              <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                {(locked ? topic.intro.slice(0, 1) : topic.intro).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="text-sm font-semibold text-foreground mb-2">Что сделать сейчас</h2>
              <ul className="space-y-2">
                {(locked ? topic.checklistNow.slice(0, 2) : topic.checklistNow).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cn(cardClass, "border-amber-200/60 bg-amber-50/50")}>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Когда к врачу
              </h2>
              <ul className="space-y-1.5 text-sm text-amber-900/90">
                {topic.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </section>

            {!locked && topic.faq.length > 0 && (
              <section className={cardClass}>
                <h2 className="text-sm font-semibold text-foreground mb-2">Частые вопросы</h2>
                <div className="space-y-1">
                  {topic.faq.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border/60 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                        className="w-full flex items-center justify-between gap-2 py-3 px-3 text-left text-sm font-medium text-foreground hover:bg-muted/50"
                      >
                        <span className="flex-1 min-w-0">{item.q}</span>
                        {openFaqIndex === i ? (
                          <ChevronUp className="w-4 h-4 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 shrink-0" />
                        )}
                      </button>
                      {openFaqIndex === i && (
                        <div className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
                          {item.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={cardClass}>
              <h2 className="text-sm font-semibold text-foreground mb-2">Спросить помощника</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Выберите вопрос или задайте свой — откроется чат с готовым текстом.
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 scrollbar-none">
                {topic.askChips.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAskAssistant(chip.prefill)}
                    className="shrink-0 h-9 px-4 rounded-full border border-border bg-card text-sm text-foreground hover:bg-muted/80 active:scale-[0.98] transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <Button
                className="w-full mt-3 rounded-xl"
                onClick={() => handleAskAssistant()}
              >
                Спросить у помощника
              </Button>
            </section>
          </>
        )}

        {!topic.requiresPremium && topic.premiumValue && topic.premiumValue.length > 0 && (
          <section className={cn(cardClass, "bg-muted/20 border-primary/10")}>
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
          </section>
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
