import { motion } from "framer-motion";
import type { SosTopicConfig } from "@/data/sosTopics";
import { ChevronRight, Star } from "lucide-react";
import { IconBadge } from "@/components/ui/IconBadge";
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
    <ul className={cn("flex flex-col gap-2.5", className)} role="list">
      {topics.map((topic) => {
        const locked = topic.requiredTier === "paid" && !hasAccess;
        return (
          <li key={topic.id}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => (locked ? onLockedSelect() : onSelect(topic))}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl border border-border bg-card shadow-soft text-left",
                "hover:bg-muted/30 active:bg-muted/50 transition-colors duration-200"
              )}
            >
              <IconBadge icon={topic.icon} variant={topic.badgeVariant} size="md" />
              <div className="flex-1 min-w-0 py-0.5">
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 break-words">
                  {topic.title}
                </p>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5 break-words">
                  {topic.shortSubtitle}
                </p>
              </div>
              {locked && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md shrink-0">
                  <Star className="w-3 h-3 text-premium-star shrink-0" aria-hidden />
                  Premium
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}
