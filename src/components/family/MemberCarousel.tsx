import { motion } from 'framer-motion';
import { Plus, Check, Lock } from 'lucide-react';
import { useFamily } from '@/contexts/FamilyContext';
import { useAppStore } from '@/store/useAppStore';
import { useSubscription } from '@/hooks/useSubscription';
import { getSubscriptionLimits } from '@/utils/subscriptionRules';
import { cn } from '@/lib/utils';

interface MemberCarouselProps {
  onAddMember?: () => void;
  compact?: boolean;
}

export function MemberCarousel({ onAddMember, compact = false }: MemberCarouselProps) {
  const { members, selectedMemberId, setSelectedMemberId, primaryMemberId, isFreeLocked, formatAge, isLoading } = useFamily();
  const { subscriptionStatus } = useSubscription();
  const maxMembers = getSubscriptionLimits(subscriptionStatus).maxProfiles;
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-20 h-24 rounded-2xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onAddMember}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30"
      >
        <Plus className="w-5 h-5 text-muted-foreground" />
        <span className="text-muted-foreground font-medium">Добавить члена семьи</span>
      </motion.button>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {members.map((member) => {
        const isSelected = selectedMemberId === member.id;
        const isPrimary = member.id === primaryMemberId;
        const isLockedForFree = isFreeLocked && !isPrimary;

        const handleClick = () => {
          if (isLockedForFree) {
            setPaywallReason("switch_child");
            setPaywallCustomMessage(null);
            useAppStore.getState().setShowPaywall(true);
            return;
          }
          setSelectedMemberId(member.id);
        };

        return (
          <motion.button
            key={member.id}
            whileTap={isLockedForFree ? undefined : { scale: 0.95 }}
            onClick={handleClick}
            className={cn(
              "flex-shrink-0 flex flex-col items-center p-2 rounded-xl transition-all relative",
              compact ? "w-14" : "w-16",
              isLockedForFree && "opacity-75",
              isSelected
                ? "bg-primary shadow-button"
                : isLockedForFree
                  ? "bg-slate-100 shadow-soft"
                  : "bg-card shadow-soft hover:shadow-card"
            )}
          >
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary-foreground flex items-center justify-center"
              >
                <Check className="w-3 h-3 text-primary" />
              </motion.div>
            )}
            <div
              className={cn(
                "rounded-lg flex items-center justify-center text-xl mb-1 relative",
                compact ? "w-8 h-8" : "w-10 h-10",
                isSelected ? "bg-primary-foreground/20" : isLockedForFree ? "bg-slate-200" : "bg-muted"
              )}
            >
              👤
              {isLockedForFree && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-500/40">
                  <Lock className="w-4 h-4 text-white" strokeWidth={2.5} />
                </span>
              )}
            </div>
            <p
              className={cn(
                "font-semibold text-typo-caption truncate w-full text-center",
                isSelected && "text-primary-foreground",
                isLockedForFree && !isSelected && "text-slate-500"
              )}
            >
              {member.name}
            </p>
            {!compact && (
              <p
                className={cn(
                  "text-typo-caption truncate w-full text-center",
                  isSelected ? "text-primary-foreground/80" : isLockedForFree ? "text-slate-400" : "text-muted-foreground"
                )}
              >
                {formatAge(member.age_months ?? null)}
              </p>
            )}
          </motion.button>
        );
      })}

      {members.length < maxMembers && onAddMember && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onAddMember}
          className={cn(
            "flex-shrink-0 flex items-center justify-center rounded-xl bg-muted border-2 border-dashed border-muted-foreground/30",
            compact ? "w-14 h-14" : "w-16 h-20"
          )}
        >
          <Plus className="w-6 h-6 text-muted-foreground" />
        </motion.button>
      )}
    </div>
  );
}
