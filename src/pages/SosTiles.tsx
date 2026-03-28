import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosHero } from "@/components/sos/SosHero";
import { SosTopicGrid } from "@/components/sos/SosTopicGrid";
import { Paywall } from "@/components/subscription/Paywall";
import { TopicConsultationSheet } from "@/components/help/TopicConsultationSheet";
import {
  getSosTopicConfig,
  getHelpMonetizationSections,
  getTopicDisplayTitle,
  type SosTopicConfig,
} from "@/data/sosTopics";
import { getChipsForTopic, getPremiumQuickChipTexts } from "@/data/helpTopicChips";
import { getTopicById } from "@/constants/sos";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import { useAppStore } from "@/store/useAppStore";
import { trackUsageEvent } from "@/utils/usageEvents";
import { getPopularQuestionForToday } from "@/features/help/config/popularQuestions";
import { ChevronRight } from "lucide-react";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members, isLoading: isLoadingMembers } = useFamily();
  const { authReady } = useAuth();
  const subscription = useSubscription();
  const hasAccess = subscription.hasAccess ?? false;
  const refetchUsage = subscription.refetchUsage;
  const setHelpUsedToday = subscription.setHelpUsedToday;
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

  const helpSections = useMemo(() => {
    try {
      return getHelpMonetizationSections();
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
      if (topicConfig.requiredTier === "paid" && !hasAccess) {
        setPaywallOpen(true);
        navigate("/sos", { replace: true });
        return;
      }
      trackUsageEvent("help_topic_open", { properties: { topic_id: topicConfig.id } });
      setSheetTopic({
        key: topicConfig.id,
        title: getTopicDisplayTitle(topicConfig),
        chips: getChipsForTopic(topicConfig.id),
        isLocked: false,
        lockedDescription: undefined,
      });
      setSheetOpen(true);
      navigate("/sos", { replace: true });
    } else if (topicMeta) {
      const cfg = getSosTopicConfig(topicMeta.id);
      if (cfg?.requiredTier === "paid" && !hasAccess) {
        setPaywallOpen(true);
        navigate("/sos", { replace: true });
        return;
      }
      trackUsageEvent("help_topic_open", { properties: { topic_id: topicMeta.id } });
      setSheetTopic({
        key: topicMeta.id,
        title: cfg ? getTopicDisplayTitle(cfg) : topicMeta.label,
        chips: getChipsForTopic(topicMeta.id),
        isLocked: false,
        lockedDescription: undefined,
      });
      setSheetOpen(true);
      navigate("/sos", { replace: true });
    } else {
      // Неизвестный scenario — открываем вкладку Помощник без темы, убираем param
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
      title: "Помощь маме",
      chips: getChipsForTopic("quick"),
      isLocked: false,
    });
    setInitialMessage(text);
    setSheetOpen(true);
  };

  const handleTopicSelect = (topic: SosTopicConfig) => {
    if (topic.requiredTier === "paid" && !hasAccess) {
      handleLockedTopic();
      return;
    }
    trackUsageEvent("help_topic_open", { properties: { topic_id: topic.id } });
    setInitialMessage(null);
    setSheetTopic({
      key: topic.id,
      title: getTopicDisplayTitle(topic),
      chips: getChipsForTopic(topic.id),
      isLocked: false,
      lockedDescription: undefined,
    });
    setSheetOpen(true);
  };

  const handleLockedTopic = () => {
    useAppStore.getState().setPaywallReason("sos_topic_locked");
    useAppStore.getState().setPaywallCustomMessage(null);
    setPaywallOpen(true);
  };

  /** Открыть paywall поверх экрана: сначала закрыть sheet, чтобы paywall был виден. */
  const openPaywallFromSheet = () => {
    setSheetOpen(false);
    setInitialMessage(null);
    setPaywallOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setInitialMessage(null);
  };

  /** Вопрос дня для карточки «Сегодня спрашивают»: Free видит только free-вопросы. */
  const popularQuestion = getPopularQuestionForToday({ hasAccess });

  return (
    <MobileLayout showNav>
      <div className="flex flex-col min-h-0 flex-1 px-4 pb-4 pt-0 bg-background">
        {authReady && !isLoadingMembers && members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2 mb-1 shrink-0">
            Добавьте ребёнка в профиле, чтобы получать рекомендации по темам.
          </p>
        )}

        {/* 1. Главный вход: hero с вопросом и быстрыми чипами */}
        <div className="shrink-0 pb-2">
          <SosHero
            onOpenWithMessage={handleOpenWithMessage}
            helpRemaining={helpRemaining}
            helpLimitExceeded={helpLimitExceeded}
            disabled={helpLimitExceeded}
            hasAccess={hasAccess}
            onPremiumChipTap={() => {
              useAppStore.getState().setPaywallReason("sos_premium_feature");
              useAppStore.getState().setPaywallCustomMessage(null);
              setPaywallOpen(true);
            }}
          />
        </div>

        {/* 2. Сегодня спрашивают — компактный, неакцентный блок */}
        <div className="shrink-0 pb-2">
          <div className="rounded-xl border border-border/80 bg-muted/20 py-2.5 px-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Сегодня спрашивают
            </p>
            <button
              type="button"
              onClick={() => {
                if (!hasAccess && popularQuestion.access === "premium") {
                  setPaywallOpen(true);
                  return;
                }
                handleOpenWithMessage(popularQuestion.text);
              }}
              disabled={helpLimitExceeded}
              className="w-full flex items-center gap-2 text-left py-0.5 -mx-0.5 px-0.5 hover:bg-muted/30 active:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="flex-1 text-sm text-foreground/90 leading-snug line-clamp-2 text-ellipsis break-words min-w-0">
                {popularQuestion.text}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
            </button>
          </div>
        </div>

        {/* 3. Категории / карточки функций */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 pb-24 space-y-4">
          {helpSections.map((section, idx) => (
            <section key={`${section.title}-${idx}`} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              <SosTopicGrid
                topics={section.topics}
                hasAccess={hasAccess}
                onSelect={handleTopicSelect}
                onLockedSelect={handleLockedTopic}
              />
            </section>
          ))}
          {/* 4. Дисклеймер — в самом низу страницы */}
          <p className="text-[11px] text-muted-foreground/90 pt-6 pb-2 text-center leading-relaxed">
            Ответы носят информационный характер и не заменяют консультацию врача.
          </p>
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
          hasAccess={sheetTopic.key === "quick" ? hasAccess : undefined}
          onPremiumChipTap={
            sheetTopic.key === "quick"
              ? () => {
                  useAppStore.getState().setPaywallReason("sos_premium_feature");
                  useAppStore.getState().setPaywallCustomMessage(null);
                  openPaywallFromSheet();
                }
              : undefined
          }
          premiumChipTexts={sheetTopic.key === "quick" ? getPremiumQuickChipTexts() : undefined}
          onLimitReached={(payload) => {
            const used = payload?.feature === "help" && typeof payload?.used === "number"
              ? payload.used
              : 2;
            setHelpUsedToday?.(used);
            refetchUsage?.();
            useAppStore.getState().setPaywallReason("help_limit");
            useAppStore.getState().setPaywallCustomMessage(
              `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("help")}`
            );
            openPaywallFromSheet();
          }}
          initialMessage={initialMessage}
          onInitialMessageSent={() => setInitialMessage(null)}
          popularQuestionTextIfPremium={
            !hasAccess && popularQuestion.access === "premium" ? popularQuestion.text : null
          }
        />
      )}

      <Paywall
        isOpen={paywallOpen}
        onClose={() => {
          setPaywallOpen(false);
          useAppStore.getState().setPaywallReason(null);
          useAppStore.getState().setPaywallCustomMessage(null);
        }}
        onSubscribe={() => {
          setPaywallOpen(false);
          useAppStore.getState().setPaywallReason(null);
          useAppStore.getState().setPaywallCustomMessage(null);
        }}
      />
    </MobileLayout>
  );
}
