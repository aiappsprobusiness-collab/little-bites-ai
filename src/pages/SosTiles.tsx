import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { APP_HEADER_ICON, APP_HEADER_TITLE, MobileLayout } from "@/components/layout/MobileLayout";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosHero } from "@/components/sos/SosHero";
import { SosTopicGrid } from "@/components/sos/SosTopicGrid";
import { Paywall } from "@/components/subscription/Paywall";
import { TopicConsultationSheet } from "@/components/help/TopicConsultationSheet";
import {
  getQuickHelpTopics,
  getRegimeTopics,
  getTopicCategory,
  getSosTopicConfig,
  HELP_CATEGORY_LABELS,
  type SosTopicConfig,
  type HelpTopicCategory,
} from "@/data/sosTopics";
import { getChipsForTopic } from "@/data/helpTopicChips";
import { getTopicById } from "@/constants/sos";
import { cn } from "@/lib/utils";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members } = useFamily();
  const { hasAccess } = useSubscription();

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [topicFilter, setTopicFilter] = useState<HelpTopicCategory>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTopic, setSheetTopic] = useState<{
    key: string;
    title: string;
    chips: ReturnType<typeof getChipsForTopic>;
    isLocked: boolean;
    lockedDescription?: string;
  } | null>(null);

  const allTopics = useMemo(
    () => [...getQuickHelpTopics(), ...getRegimeTopics()],
    []
  );

  const filteredTopics = useMemo(() => {
    if (topicFilter === "all") return allTopics;
    return allTopics.filter((t) => getTopicCategory(t.id) === topicFilter);
  }, [allTopics, topicFilter]);

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
    if (topicConfig) {
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

  const handleTopicSelect = (topic: SosTopicConfig) => {
    const locked = topic.requiredTier === "paid" && !hasAccess;
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
  };

  return (
    <MobileLayout showNav title={APP_HEADER_TITLE} headerTitleIcon={APP_HEADER_ICON}>
      <div className="px-4 pb-4 pt-0 bg-background min-h-full">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2 mb-1">
            Добавьте ребёнка в профиле, чтобы получать рекомендации по темам.
          </p>
        )}
        <SosHero />

        <div className="mt-3">
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Темы</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Выберите ситуацию</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none" style={{ scrollbarWidth: "none" }}>
              {(["all", "feeding", "routine", "allergy"] as HelpTopicCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTopicFilter(cat)}
                  className={cn(
                    "shrink-0 h-9 px-4 rounded-full text-sm font-semibold border transition-colors duration-200",
                    topicFilter === cat
                      ? "bg-primary/10 border-primary/20 text-foreground"
                      : "bg-transparent border border-border text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {HELP_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </section>
          <SosTopicGrid
            className="mt-2"
            topics={filteredTopics}
            hasAccess={hasAccess}
            onSelect={handleTopicSelect}
            onLockedSelect={handleLockedTopic}
          />
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
