import { Lock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ProfileChipItem = { type: "like" | "dislike" | "allergy"; label: string };

const chipBase = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] border border-[currentColor]/15";
const likeChipClass = "bg-primary/[0.06] text-primary border-primary/20";
const dislikeChipClass = "bg-transparent text-stone-500 border-stone-200/60";
const allergyChipClass = "bg-rose-50/80 text-rose-800/90 border-rose-200/40";

export interface FamilyMemberCardProps {
  name: string;
  ageStr: string | null;
  avatarEmoji: string;
  visibleChips: ProfileChipItem[];
  overflowCount: number;
  isLocked?: boolean;
  onTeaserClick?: (e: React.MouseEvent) => void;
  isFree?: boolean;
  onClick: () => void;
  index: number;
}

/** Карточка члена семьи в стиле Plan: rounded-2xl, лёгкий бордер, press state. */
export function FamilyMemberCard({
  name,
  ageStr,
  avatarEmoji,
  visibleChips,
  overflowCount,
  isLocked,
  onTeaserClick,
  isFree,
  onClick,
  index,
}: FamilyMemberCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.15 }}
      className="w-full rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]"
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.995 }}
        transition={{ duration: 0.12 }}
        className="w-full flex items-center gap-3 py-3 px-4 text-left hover:bg-primary/[0.04] active:bg-primary/[0.06] transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-primary/[0.06] border border-primary-border/40 flex items-center justify-center text-lg shrink-0 relative">
          {avatarEmoji}
          {isLocked && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25">
              <Lock className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">
            {name}
          </div>
          {ageStr && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {ageStr}
            </div>
          )}
          {(visibleChips.length > 0 || overflowCount > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {visibleChips.map((item, i) =>
                item.type === "like" ? (
                  <span key={`${item.type}-${i}-${item.label}`} className={cn(chipBase, likeChipClass)}>
                    {item.label}
                  </span>
                ) : item.type === "dislike" ? (
                  <span key={`${item.type}-${i}-${item.label}`} className={cn(chipBase, dislikeChipClass)}>
                    {item.label}
                  </span>
                ) : (
                  <span key={`${item.type}-${i}-${item.label}`} className={cn(chipBase, allergyChipClass)}>
                    {item.label}
                  </span>
                )
              )}
              {overflowCount > 0 && (
                <span className={cn(chipBase, "text-muted-foreground border-border/40 bg-muted/20")}>
                  +{overflowCount}
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" strokeWidth={2} aria-hidden />
      </motion.button>
      {isFree && onTeaserClick && (
        <button
          type="button"
          onClick={onTeaserClick}
          className="w-full px-4 pb-3 pt-2 flex flex-col gap-0.5 items-start text-left hover:opacity-90 transition-opacity border-t border-border/30"
        >
          <span className="text-[11px] text-muted-foreground">Настройте продукты и улучшите подбор блюд</span>
          <span className="text-xs font-medium text-primary">Открыть Premium</span>
        </button>
      )}
    </motion.div>
  );
}
