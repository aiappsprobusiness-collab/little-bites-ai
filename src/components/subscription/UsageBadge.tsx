import { motion } from "framer-motion";
import { Zap, Crown, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

interface UsageBadgeProps {
  onClick?: () => void;
  className?: string;
}

export function UsageBadge({ onClick, className }: UsageBadgeProps) {
  const { isPremium, remaining, dailyLimit, usedToday, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  if (isPremium) {
    return (
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md",
          className
        )}
      >
        <Crown className="w-4 h-4" />
        <span className="text-typo-muted font-semibold">Premium</span>
      </motion.button>
    );
  }

  const percentage = (usedToday / dailyLimit) * 100;
  const isLow = remaining <= 2;
  const isEmpty = remaining === 0;

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
        isEmpty
          ? "bg-destructive/10 text-destructive border border-destructive/30"
          : isLow
          ? "bg-amber-500/10 text-amber-600 border border-amber-500/30"
          : "bg-primary/10 text-primary border border-primary/30",
        className
      )}
    >
      <Zap className="w-4 h-4" />
      <span className="text-typo-muted font-semibold">
        {remaining}/{dailyLimit} AI
      </span>
      
      {/* Progress bar */}
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${100 - percentage}%` }}
          className={cn(
            "h-full rounded-full",
            isEmpty
              ? "bg-destructive"
              : isLow
              ? "bg-amber-500"
              : "bg-primary"
          )}
        />
      </div>
    </motion.button>
  );
}
