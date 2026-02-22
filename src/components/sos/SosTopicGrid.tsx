import { motion } from "framer-motion";
import type { SosTopicConfig } from "@/data/sosTopics";
import { ChevronRight } from "lucide-react";
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
    <ul className={cn("flex flex-col gap-4", className)} role="list">
      {topics.map((topic) => {
        const Icon = topic.icon;
        const locked = topic.requiredTier === "paid" && !hasAccess;
        return (
          <li key={topic.id}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => (locked ? onLockedSelect() : onSelect(topic))}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card shadow-soft text-left",
                "hover:bg-muted/30 active:bg-muted/50 transition-colors duration-200"
              )}
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-muted shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0 py-0.5">
                <p className="text-base font-semibold text-foreground leading-snug line-clamp-2 break-words">
                  {topic.title}
                </p>
                <p className="text-sm text-muted-foreground leading-snug line-clamp-2 mt-1 break-words">
                  {topic.shortSubtitle}
                </p>
              </div>
              {locked && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md shrink-0">
                  Premium
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden />
            </motion.button>
          </li>
        );
      })}
    </ul>
  );
}
