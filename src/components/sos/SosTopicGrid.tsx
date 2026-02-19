import { motion } from "framer-motion";
import type { SosTopicConfig } from "@/data/sosTopics";
import { cn } from "@/lib/utils";

export interface SosTopicGridProps {
  topics: SosTopicConfig[];
  hasAccess: boolean;
  onSelect: (topic: SosTopicConfig) => void;
  onLockedSelect: () => void;
  className?: string;
}

export function SosTopicGrid({
  topics,
  hasAccess,
  onSelect,
  onLockedSelect,
  className,
}: SosTopicGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 items-stretch", className)}>
      {topics.map((topic) => {
        const Icon = topic.icon;
        const locked = topic.requiredTier === "paid" && !hasAccess;
        return (
          <motion.button
            key={topic.id}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => (locked ? onLockedSelect() : onSelect(topic))}
            className={cn(
              "relative rounded-2xl p-5 text-left border bg-card",
              "flex flex-col gap-3 min-w-0",
              "border-border hover:bg-muted/20",
              "active:bg-primary/[0.03] active:border-primary/20",
              "transition-colors"
            )}
          >
            {locked && (
              <span className="absolute top-2.5 right-2.5 text-[10px] font-medium text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                Premium
              </span>
            )}
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/[0.06] shrink-0 self-start">
              <Icon className="w-5 h-5 text-primary/80" />
            </span>
            <span className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 pr-8">
              {topic.title}
            </span>
            <span className="text-[13px] text-muted-foreground leading-snug line-clamp-2 mt-auto">
              {topic.shortSubtitle}
            </span>
            <span className="absolute bottom-3 right-3 text-muted-foreground/50" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
