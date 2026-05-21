import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { OnboardingStepper } from "./OnboardingStepper";
import { getMaxMembersByTariff } from "./AddChildForm";
import { PAYWALL_ADD_CHILD_CUSTOM_MESSAGE } from "@/constants/paywallCustomMessages";
import { buildProfileChildCreateUrl } from "@/utils/profileCreateRoutes";
import type { MembersRow } from "@/integrations/supabase/types-v2";

const MEMBER_ICONS = ["🥕", "🥦", "🍅", "🥬", "🌽", "🫐", "🍎", "🥑"];

function memberIcon(index: number): string {
  return MEMBER_ICONS[index % MEMBER_ICONS.length];
}

const MEMBER_TYPE_LABEL: Record<string, string> = {
  child: "Ребёнок",
  adult: "Взрослый",
  family: "Семья",
};

interface FamilyOnboardingProps {
  onComplete: () => void;
}

export function FamilyOnboarding({ onComplete }: FamilyOnboardingProps) {
  const navigate = useNavigate();
  const { members, formatAge } = useFamily();
  const { subscriptionStatus } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);

  const maxMembers = getMaxMembersByTariff(subscriptionStatus);
  const canAddMore = members.length < maxMembers;

  const handleAddClick = () => {
    if (!canAddMore) {
      setPaywallReason("add_child_limit");
      setPaywallCustomMessage(PAYWALL_ADD_CHILD_CUSTOM_MESSAGE);
      setShowPaywall(true);
      return;
    }
    navigate(buildProfileChildCreateUrl({ returnPath: "/chat" }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-8 px-4 text-center max-w-[400px] mx-auto"
    >
      <OnboardingStepper currentStep={1} totalSteps={1} className="w-full mb-6" />

      <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full space-y-5"
          >
            <div className="rounded-2xl px-5 py-6 bg-slate-50/90 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-700/40 space-y-4">
              <h2 className="text-typo-title font-semibold text-foreground">
                Давайте познакомимся с вашей семьёй
              </h2>
              <p className="text-typo-muted text-muted-foreground leading-relaxed">
                Добавьте членов семьи, для которых мы будем подбирать рецепты и планы питания.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-typo-body font-medium text-foreground text-left">
                Расскажите о вашей семье
              </h3>

              {members.length > 0 && (
                <div className="space-y-2">
                  {members.map((member, index) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-border bg-card p-3 flex items-center gap-3 text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">
                        {memberIcon(index)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {member.name}
                        </p>
                        <p className="text-typo-caption text-muted-foreground">
                          {[
                            MEMBER_TYPE_LABEL[(member as MembersRow).type] ?? (member as MembersRow).type,
                            formatAge(member.age_months ?? null),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleAddClick}
                variant={members.length === 0 ? "default" : "outline"}
                className="w-full h-12 gap-2"
              >
                <Plus className="h-5 w-5" />
                Добавить
              </Button>
              {members.length > 0 ? (
                <Button
                  variant="secondary"
                  className="w-full h-11 gap-2"
                  onClick={onComplete}
                >
                  <ArrowRight className="h-4 w-4" />
                  Продолжить
                </Button>
              ) : null}
            </div>
          </motion.div>
    </motion.div>
  );
}
