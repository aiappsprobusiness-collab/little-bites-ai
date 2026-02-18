import { motion } from "framer-motion";
import type { SosTopicConfig } from "@/data/sosTopics";
import { cn } from "@/lib/utils";

export interface SosTopicGridProps {
  topics: SosTopicConfig[];
  hasAccess: boolean;
  onSelect: (topic: SosTopicConfig) => void;
  onLockedSelect: () => void;
}

export function SosTopicGrid({
  topics,
  hasAccess,
  onSelect,
  onLockedSelect,
}: SosTopicGridProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Все темы</h3>
      <div className="grid grid-cols-2 gap-3">
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
                "relative rounded-2xl p-4 text-left border border-border bg-card",
                "hover:bg-muted/40 active:bg-muted/60 transition-colors",
                "flex flex-col gap-2 min-h-0"
              )}
            >
              {locked && (
                <span className="absolute top-2 right-2 text-[10px] font-medium text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                  Premium
                </span>
              )}
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/[0.06] shrink-0 self-start">
                <Icon className="w-4 h-4 text-primary/80" />
              </span>
              <span className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 pr-12">
                {topic.title}
              </span>
              {topic.bullets.length > 0 && (
                <ul className="text-[12px] text-muted-foreground space-y-0.5 list-disc list-inside leading-normal">
                  {topic.bullets.slice(0, 3).map((b, i) => (
                    <li key={i} className="line-clamp-1">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
