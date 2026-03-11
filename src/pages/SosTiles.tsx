import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosHero } from "@/components/sos/SosHero";
import { SosTopicGrid } from "@/components/sos/SosTopicGrid";
import { Paywall } from "@/components/subscription/Paywall";
import { TopicConsultationSheet } from "@/components/help/TopicConsultationSheet";
import { getSosTopicConfig, getTopicsGroupedBySection, type SosTopicConfig } from "@/data/sosTopics";
import { getChipsForTopic } from "@/data/helpTopicChips";
import { getTopicById } from "@/constants/sos";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import { useAppStore } from "@/store/useAppStore";
import { trackUsageEvent } from "@/utils/usageEvents";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members } = useFamily();
  const subscription = useSubscription();
  const hasAccess = subscription.hasAccess ?? false;
  const rawHelpRemaining = subscription.helpRemaining;
  const helpRemaining =
    rawHelpRemaining != null && Number.isFinite(rawHelpRemaining) ? rawHelpRemaining : null;
  const helpLimitExceeded = Boolean(subscription.helpLimitExceeded);

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const [sheetTopic, setSheetTopic] = useState<{
    key: string;
    title: string;
    chips: ReturnType<typeof getChipsForTopic>;
    isLocked: boolean;
    lockedDescription?: string;
  } | null>(null);

  const groupedSections = useMemo(() => {
    try {
      return getTopicsGroupedBySection();
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    trackUsageEvent("help_open");
  }, []);

  // Блокировка скролла фона при открытом sheet (мобильная)
  useEffect(() => {
    if (sheetOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [sheetOpen]);

  // Deep-link: /sos?scenario=key → открыть sheet по теме и убрать param
  useEffect(() => {
    const key = searchParams.get("scenario");
    if (!key) return;
    const topicConfig = getSosTopicConfig(key);
    const topicMeta = getTopicById(key);
    setInitialMessage(null);
    if (topicConfig) {
      trackUsageEvent("help_topic_open", { properties: { topic_id: topicConfig.id } });
      setSheetTopic({
        key: topicConfig.id,
        title: topicConfig.title,
        chips: getChipsForTopic(topicConfig.id),
        isLocked: topicConfig.requiredTier === "paid" && !hasAccess,
        lockedDescription: topicConfig.intro?.[0] ?? topicConfig.shortSubtitle,
      });
      setSheetOpen(true);
      navigate("/sos", { replace: true });
    } else if (topicMeta) {
      trackUsageEvent("help_topic_open", { properties: { topic_id: topicMeta.id } });
      setSheetTopic({
        key: topicMeta.id,
        title: topicMeta.label,
        chips: getChipsForTopic(topicMeta.id),
        isLocked: false,
      });
      setSheetOpen(true);
      navigate("/sos", { replace: true });
    }
  }, [searchParams, navigate, hasAccess]);

  useLayoutEffect(() => {
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
  }, []);

  const handleOpenWithMessage = (text: string) => {
    setSheetTopic({
      key: "quick",
      title: "Помощник рядом",
      chips: getChipsForTopic("quick"),
      isLocked: false,
    });
    setInitialMessage(text);
    setSheetOpen(true);
  };

  const handleTopicSelect = (topic: SosTopicConfig) => {
    const locked = topic.requiredTier === "paid" && !hasAccess;
    trackUsageEvent("help_topic_open", { properties: { topic_id: topic.id } });
    setInitialMessage(null);
    setSheetTopic({
      key: topic.id,
      title: topic.title,
      chips: getChipsForTopic(topic.id),
      isLocked: locked,
      lockedDescription: locked ? (topic.intro?.[0] ?? topic.shortSubtitle) : undefined,
    });
    setSheetOpen(true);
  };

  const handleLockedTopic = () => {
    setPaywallOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setInitialMessage(null);
  };

  return (
    <MobileLayout showNav>
      <div className="flex flex-col min-h-0 flex-1 px-4 pb-4 pt-0 bg-background">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2 mb-1 shrink-0">
            Добавьте ребёнка в профиле, чтобы получать рекомендации по темам.
          </p>
        )}
        <div className="shrink-0 pb-2">
          <SosHero
            onOpenWithMessage={handleOpenWithMessage}
            helpRemaining={helpRemaining}
            helpLimitExceeded={helpLimitExceeded}
            disabled={helpLimitExceeded}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 pb-24 space-y-6">
          {groupedSections.map((section) => (
            <section key={section.groupId} className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
              <SosTopicGrid
                topics={section.topics}
                hasAccess={hasAccess}
                onSelect={handleTopicSelect}
                onLockedSelect={handleLockedTopic}
              />
            </section>
          ))}
        </div>
      </div>

      {sheetTopic && (
        <TopicConsultationSheet
          isOpen={sheetOpen}
          onClose={handleCloseSheet}
          topicKey={sheetTopic.key}
          topicTitle={sheetTopic.title}
          chips={sheetTopic.chips}
          isLocked={sheetTopic.isLocked}
          lockedDescription={sheetTopic.lockedDescription}
          onOpenPremium={sheetTopic.isLocked ? handleLockedTopic : undefined}
          onLimitReached={() => {
            useAppStore.getState().setPaywallCustomMessage(
              `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("help")}`
            );
            setPaywallOpen(true);
          }}
          initialMessage={initialMessage}
          onInitialMessageSent={() => setInitialMessage(null)}
        />
      )}

      <Paywall
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={() => setPaywallOpen(false)}
      />
    </MobileLayout>
  );
}
