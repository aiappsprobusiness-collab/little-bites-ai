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
  HelpSectionCard,
  HelpWarningCard,
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

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-8 space-y-4">
        {topic.requiresPremium && (
          <div className={cn(
            "rounded-2xl border p-4",
            hasAccess
              ? "bg-primary/[0.06] border-primary/20"
              : "bg-primary/[0.06] border-primary/20"
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
          <HelpSectionCard className="bg-muted/30">
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
          </HelpSectionCard>
        )}

        {showFullContent && (
          <>
            <HelpSectionCard title="Коротко">
              <div className="space-y-2 text-sm text-muted-foreground">
                {(locked ? topic.intro.slice(0, 1) : topic.intro).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </HelpSectionCard>

            <HelpSectionCard
              title="Что сделать сейчас"
              icon={<CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
            >
              <ul className="space-y-2">
                {(locked ? topic.checklistNow.slice(0, 2) : topic.checklistNow).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </HelpSectionCard>

            <HelpWarningCard title="Когда к врачу">
              <ul className="space-y-1.5">
                {topic.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </HelpWarningCard>

            {!locked && topic.faq.length > 0 && (
              <HelpSectionCard>
                <HelpAccordion
                  title="Частые вопросы"
                  items={topic.faq}
                  openIndex={openFaqIndex}
                  onToggle={(i) => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                />
              </HelpSectionCard>
            )}

            <HelpSectionCard title="Спросить помощника">
              <p className="text-[12px] text-muted-foreground mb-3">
                Задайте свой вопрос — откроется чат с помощником.
              </p>
              <HelpChipRow
                items={topic.askChips.map((c) => ({ label: c.label, value: c.prefill }))}
                onSelect={(value) => handleAskAssistant(value)}
              />
              <HelpPrimaryCTA className="mt-3" onClick={() => handleAskAssistant()}>
                Спросить у помощника
              </HelpPrimaryCTA>
            </HelpSectionCard>
          </>
        )}

        {!topic.requiresPremium && topic.premiumValue && topic.premiumValue.length > 0 && (
          <HelpSectionCard className="bg-muted/20 border-primary/10">
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
          </HelpSectionCard>
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
