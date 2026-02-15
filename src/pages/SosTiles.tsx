import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { SosButton } from "@/components/sos/SosButton";
import { SosPaywallModal } from "@/components/sos/SosPaywallModal";
import { Paywall } from "@/components/subscription/Paywall";
import { SOS_TOPICS, getTopicById, FREE_SOS_TOPIC_IDS } from "@/constants/sos";

export default function SosTiles() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedMember, members, formatAge } = useFamily();
  const { hasAccess } = useSubscription();

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

  // Deep-link: /sos?scenario=key → /sos/key
  useEffect(() => {
    const key = searchParams.get("scenario");
    if (!key) return;
    const topic = getTopicById(key);
    if (topic) {
      navigate(`/sos/${key}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sosPaywallOpen, setSosPaywallOpen] = useState(false);

  const handleSosClick = (topic: (typeof SOS_TOPICS)[number]) => {
    const isFreeTopic = FREE_SOS_TOPIC_IDS.has(topic.id);
    if (!hasAccess && !isFreeTopic) {
      setSosPaywallOpen(true);
      return;
    }
    navigate(`/sos/${topic.id}`);
  };

  return (
    <MobileLayout
      title="Помощь маме"
      showNav
      headerRight={members.length > 0 ? <MemberSelectorButton /> : undefined}
    >
      <div className="px-4 pb-4 space-y-6 bg-slate-50 min-h-full">
        {!memberData && (
          <p className="text-typo-muted text-muted-foreground text-center py-4">
            Добавьте ребёнка в профиле, чтобы получать персональные рекомендации.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {SOS_TOPICS.map((topic) => {
            const Icon = topic.icon;
const isFreeTopic = FREE_SOS_TOPIC_IDS.has(topic.id);
    const locked = !hasAccess && !isFreeTopic;
            return (
              <SosButton
                key={topic.id}
                label={topic.label}
                subtext={topic.id === "food_diary" ? "Записать кормление и получить совет" : undefined}
                emoji={topic.emoji}
                icon={<Icon className="w-5 h-5 text-emerald-700" />}
                onClick={() => handleSosClick(topic)}
                disabled={false}
                showLock={locked}
                locked={locked}
              />
            );
          })}
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
