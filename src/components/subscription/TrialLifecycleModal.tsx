import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TrialLifecycleModalVariant = "ending_soon" | "expired";

type TrialLifecycleModalProps = {
  open: boolean;
  variant: TrialLifecycleModalVariant;
  /** Заголовок напоминания (например «сегодня» / «завтра»). */
  endingSoonTitle: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

const BODY: Record<TrialLifecycleModalVariant, string> = {
  ending_soon: "Сохраните полный доступ к плану питания и AI-рецептам",
  expired: "Чтобы продолжить пользоваться всеми функциями, оформите Premium",
};

/**
 * Лёгкая модалка: напоминание до конца trial или сообщение после окончания (не paywall).
 */
export function TrialLifecycleModal({
  open,
  variant,
  endingSoonTitle,
  onPrimary,
  onSecondary,
}: TrialLifecycleModalProps) {
  const title = variant === "ending_soon" ? endingSoonTitle : "Пробный доступ завершён";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[58] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
          onClick={onSecondary}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className={cn(
              "w-full max-w-md shadow-xl border border-border/50",
              "rounded-t-2xl sm:rounded-2xl bg-card text-card-foreground",
              "flex flex-col overflow-hidden max-h-[min(92dvh,520px)]",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onSecondary}
              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-muted/60 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-5 pt-9 pb-4 sm:pt-10 space-y-2 pr-12">
              <h2 className="text-lg font-semibold leading-snug text-foreground text-balance">{title}</h2>
              <p className="text-sm text-muted-foreground leading-snug">{BODY[variant]}</p>
            </div>

            <div className="flex flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 border-t border-border/40">
              <Button
                variant="default"
                size="sm"
                className="w-full h-11 text-sm font-semibold rounded-xl"
                onClick={onPrimary}
              >
                Оформить Premium
              </Button>
              <Button variant="ghost" size="sm" className="w-full h-10 text-sm rounded-xl" onClick={onSecondary}>
                {variant === "ending_soon" ? "Позже" : "Продолжить с Free"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
