import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosHero } from "@/components/sos/SosHero";
import { ChevronDown } from "lucide-react";
import { SosTopicGrid } from "@/components/sos/SosTopicGrid";
import { SosPaywallModal } from "@/components/sos/SosPaywallModal";
import { Paywall } from "@/components/subscription/Paywall";
import {
  getQuickHelpTopics,
  getRegimeTopics,
  getTopicCategory,
  HELP_CATEGORY_LABELS,
  type SosTopicConfig,
  type HelpTopicCategory,
} from "@/data/sosTopics";
import { getTopicById } from "@/constants/sos";
import { cn } from "@/lib/utils";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members } = useFamily();
  const { hasAccess } = useSubscription();

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sosPaywallOpen, setSosPaywallOpen] = useState(false);
  const [topicFilter, setTopicFilter] = useState<HelpTopicCategory>("all");

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;

  const allTopics = useMemo(
    () => [...getQuickHelpTopics(), ...getRegimeTopics()],
    []
  );

  const filteredTopics = useMemo(() => {
    if (topicFilter === "all") return allTopics;
    return allTopics.filter((t) => getTopicCategory(t.id) === topicFilter);
  }, [allTopics, topicFilter]);

  // Deep-link: /sos?scenario=key → /sos/topic/key
  useEffect(() => {
    const key = searchParams.get("scenario");
    if (!key) return;
    const topic = getTopicById(key);
    if (topic) {
      navigate(`/sos/topic/${key}`, { replace: true });
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

        <div className="mt-8">
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Темы</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Выберите ситуацию</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "feeding", "routine", "allergy"] as HelpTopicCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTopicFilter(cat)}
                  className={cn(
                    "text-[13px] font-medium px-3 py-1.5 rounded-full border transition-colors",
                    topicFilter === cat
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                  )}
                >
                  {HELP_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </section>
          <SosTopicGrid
            className="mt-4"
            topics={filteredTopics}
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
