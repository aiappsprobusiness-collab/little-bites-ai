import { motion } from "framer-motion";
import type { SosTopicConfig } from "@/data/sosTopics";
import { cn } from "@/lib/utils";

export interface SosRecommendedProps {
  topics: SosTopicConfig[];
  hasAccess: boolean;
  onSelect: (topic: SosTopicConfig) => void;
  onLockedSelect: () => void;
}

export function SosRecommended({
  topics,
  hasAccess,
  onSelect,
  onLockedSelect,
}: SosRecommendedProps) {
  if (topics.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Рекомендуем</h3>
      <div className="grid grid-cols-2 gap-3">
        {topics.slice(0, 3).map((topic) => {
          const Icon = topic.icon;
          const locked = topic.requiredTier === "paid" && !hasAccess;
          return (
            <motion.button
              key={topic.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => (locked ? onLockedSelect() : onSelect(topic))}
              className={cn(
                "relative rounded-2xl p-4 text-left border border-border bg-card",
                "hover:bg-muted/40 active:bg-muted/60 transition-colors",
                "flex flex-col gap-2 min-h-[100px]"
              )}
            >
              {locked && (
                <span className="absolute top-2 right-2 text-[10px] font-medium text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                  Premium
                </span>
              )}
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/[0.06] shrink-0">
                <Icon className="w-5 h-5 text-primary/80" />
              </span>
              <span className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2">
                {topic.title}
              </span>
              <span className="text-[12px] text-muted-foreground leading-normal line-clamp-1">
                {topic.subtitle}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
