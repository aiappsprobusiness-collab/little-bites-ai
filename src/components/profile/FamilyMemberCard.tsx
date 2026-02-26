import { Lock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ProfileChipItem = { type: "like" | "dislike" | "allergy"; label: string };

/** Компактные чипы: меньше padding, меньше радиус, тонкий outline, мелкий шрифт. Аллерген — мягкий розово-персиковый. */
const chipBase = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] border";
const likeChipClass = "bg-primary/5 text-primary border-primary/20";
const dislikeChipClass = "bg-transparent text-stone-500 border-stone-200/80";
const allergyChipClass = "bg-rose-50/90 text-rose-800 border-rose-200/50";

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

/** Элемент списка: белый фон, минимальный радиус, лёгкая граница, компактная высота. List-style, не «батон». */
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
      transition={{ delay: index * 0.03 }}
      className="w-full rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 py-2.5 px-3 text-left hover:bg-muted/20 active:bg-muted/30 transition-colors"
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
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {visibleChips.map((item, i) =>
                item.type === "like" ? (
                  <span
                    key={`${item.type}-${i}-${item.label}`}
                    className={cn(chipBase, likeChipClass)}
                  >
                    {item.label}
                  </span>
                ) : item.type === "dislike" ? (
                  <span
                    key={`${item.type}-${i}-${item.label}`}
                    className={cn(chipBase, dislikeChipClass)}
                  >
                    {item.label}
                  </span>
                ) : (
                  <span
                    key={`${item.type}-${i}-${item.label}`}
                    className={cn(chipBase, allergyChipClass)}
                  >
                    {item.label}
                  </span>
                )
              )}
              {overflowCount > 0 && (
                <span className={cn(chipBase, "text-muted-foreground border-border/50 bg-muted/30")}>
                  +{overflowCount}
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" strokeWidth={2} aria-hidden />
      </button>
      {isFree && onTeaserClick && (
        <button
          type="button"
          onClick={onTeaserClick}
          className="w-full px-3 pb-3 pt-2 flex flex-col gap-0.5 items-start text-left hover:opacity-90 transition-opacity border-t border-border/30"
        >
          <span className="text-[11px] text-muted-foreground">Настройте продукты и улучшите подбор блюд</span>
          <span className="text-xs font-medium text-primary">Открыть Premium</span>
        </button>
      )}
    </motion.div>
  );
}
