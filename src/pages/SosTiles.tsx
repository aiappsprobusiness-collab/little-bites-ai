import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosHero } from "@/components/sos/SosHero";
import { ChevronDown } from "lucide-react";
import { SosQuickChips } from "@/components/sos/SosQuickChips";
import { SosRecommended } from "@/components/sos/SosRecommended";
import { SosTopicGrid } from "@/components/sos/SosTopicGrid";
import { SosPaywallModal } from "@/components/sos/SosPaywallModal";
import { Paywall } from "@/components/subscription/Paywall";
import {
  getSosTopicsInOrder,
  getRecommendedTopicIds,
  getSosTopicConfig,
  type SosTopicConfig,
} from "@/data/sosTopics";
import { getTopicById } from "@/constants/sos";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members } = useFamily();
  const { hasAccess } = useSubscription();

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sosPaywallOpen, setSosPaywallOpen] = useState(false);

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;
  const ageMonths = selectedMember?.age_months ?? members[0]?.age_months ?? null;

  const recommendedIds = useMemo(
    () => getRecommendedTopicIds(ageMonths ?? null),
    [ageMonths]
  );
  const recommendedTopics = useMemo(() => {
    return recommendedIds
      .map((id) => getSosTopicConfig(id))
      .filter(Boolean) as SosTopicConfig[];
  }, [recommendedIds]);

  const allTopics = useMemo(() => getSosTopicsInOrder(), []);

  // Deep-link: /sos?scenario=key → /sos/key
  useEffect(() => {
    const key = searchParams.get("scenario");
    if (!key) return;
    const topic = getTopicById(key);
    if (topic) {
      navigate(`/sos/${key}`, { replace: true });
    }
  }, [searchParams, navigate]);

  useLayoutEffect(() => {
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
  }, []);

  const openPaywall = () => {
    setSosPaywallOpen(true);
  };

  const handleAskQuestion = () => {
    navigate("/chat?mode=help");
  };

  const handleSecondaryQuestion = () => {
    if (!memberName) return;
    const text = `Как сегодня себя чувствует ${memberName}?`;
    navigate(`/chat?mode=help&prefill=${encodeURIComponent(text)}`);
  };

  const handleQuickChip = (prefillText: string) => {
    navigate(`/chat?mode=help&prefill=${encodeURIComponent(prefillText)}`);
  };

  const handleTopicSelect = (topic: SosTopicConfig) => {
    navigate(`/sos/topic/${topic.id}`);
  };

  const handleLockedTopic = () => {
    setPaywallOpen(true);
  };

  return (
    <MobileLayout showNav>
      <div className="px-4 pb-6 pt-2 bg-background min-h-full">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-3 mb-2">
            Добавьте ребёнка в профиле, чтобы получать персональные рекомендации.
          </p>
        )}
        <SosHero
          memberName={memberName}
          onAskQuestion={handleAskQuestion}
          onSecondaryQuestion={memberName ? handleSecondaryQuestion : undefined}
          profileSelector={
            members.length > 0 ? (
              <MemberSelectorButton
                className="!min-h-7 h-7 !py-1 !px-2.5 !rounded-full text-[12px] font-medium !max-w-[120px] border border-primary-border bg-primary/[0.06] text-foreground hover:bg-primary/[0.1]"
              />
            ) : (
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="flex items-center gap-1.5 h-7 min-h-7 py-1 px-2.5 rounded-full text-[12px] font-medium border border-primary-border bg-primary/[0.06] text-foreground hover:bg-primary/[0.1] transition-colors"
                aria-label="Выбрать профиль"
              >
                <span>Выбрать</span>
                <ChevronDown className="w-3 h-3 shrink-0 opacity-80" aria-hidden />
              </button>
            )
          }
        />

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Быстрые вопросы</h3>
            <SosQuickChips onSelect={handleQuickChip} />
          </section>

          {recommendedTopics.length > 0 && (
            <SosRecommended
              topics={recommendedTopics}
              hasAccess={hasAccess}
              onSelect={handleTopicSelect}
              onLockedSelect={openPaywall}
            />
          )}

          <SosTopicGrid
            topics={allTopics}
            hasAccess={hasAccess}
            onSelect={handleTopicSelect}
            onLockedSelect={handleLockedTopic}
          />
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
    </MobileLayout>
  );
}
