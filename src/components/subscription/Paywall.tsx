import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
}

const FEATURES = [
  "До 10 профилей в семье",
  "Рецепты под аллергии и предпочтения",
  "Один рецепт сразу для всей семьи",
  "Недельные планы питания",
  "Безлимитный AI-помощник",
] as const;

export function Paywall({ isOpen, onClose, onSubscribe }: PaywallProps) {
  const paywallCustomMessage = useAppStore((s) => s.paywallCustomMessage);
  const { startPayment, isStartingPayment, isPremium, hasPremiumAccess, startTrial, isStartingTrial } = useSubscription();
  const [pricingOption, setPricingOption] = useState<"month" | "year">("year");
  /** Показывать форму оплаты только если нет доступа (free/expired) */
  const showPayForm = !hasPremiumAccess;

  const handleStartTrial = async () => {
    await startTrial();
    onSubscribe?.();
    onClose();
  };

  const handlePayPremium = () => {
    startPayment(pricingOption).catch(() => {});
  };

  const handleContinueFree = () => {
    onClose();
  };

  const handleManageSubscription = () => {
    // TODO: Открыть управление подпиской (RevenueCat / App Store)
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-background via-background to-secondary/20 rounded-t-3xl sm:rounded-3xl p-6 pb-safe shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors z-10"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Custom message (upsell из онбординга или при лимитах) */}
            {paywallCustomMessage && (
              <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-sm font-medium text-foreground text-center leading-relaxed">
                  {paywallCustomMessage}
                </p>
              </div>
            )}

            {/* Crown / Premium icon — тёплый, заботливый */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Crown className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-5">
              <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">
                Mama Premium — забота о семье на автопилоте
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Персональные рецепты, планы питания и ИИ-помощник для всей семьи.
              </p>
            </div>

            {/* Features — чекмарки, тёплый тон */}
            <div className="space-y-3 mb-6">
              {FEATURES.map((text, index) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-foreground">{text}</span>
                </motion.div>
              ))}
            </div>

            {showPayForm && (
              <>
                {/* Pricing */}
                <div className="rounded-2xl border border-border bg-card/50 p-4 mb-5 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPricingOption("month")}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        pricingOption === "month"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      299 ₽ / месяц
                    </button>
                    <button
                      type="button"
                      onClick={() => setPricingOption("year")}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        pricingOption === "year"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      2 999 ₽ / год
                    </button>
                  </div>
                  {pricingOption === "year" && (
                    <p className="text-xs text-center text-muted-foreground">
                      Экономия ~17% · 250 ₽/месяц
                    </p>
                  )}
                </div>

                {/* CTA: Trial — активирует trial по кнопке (3 дня) */}
                <Button
                  variant="default"
                  size="lg"
                  className="w-full mb-3 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl"
                  onClick={() => handleStartTrial().catch(() => {})}
                  disabled={isStartingTrial}
                >
                  <Heart className="w-5 h-5 mr-2" />
                  {isStartingTrial ? "Активация…" : "Попробовать Premium бесплатно"}
                </Button>

                {/* CTA: Continue with Premium (month/year) — редирект на Т-Банк */}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full mb-3 h-11 rounded-xl"
                  onClick={handlePayPremium}
                  disabled={isStartingPayment}
                >
                  {isStartingPayment ? "Перенаправление…" : `Продолжить с Premium — ${pricingOption === "month" ? "299 ₽/мес" : "2 999 ₽/год"}`}
                </Button>

                {/* CTA: Continue with Free */}
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full h-11 text-muted-foreground hover:text-foreground rounded-xl"
                  onClick={handleContinueFree}
                >
                  Продолжить с Free
                </Button>
              </>
            )}

            {isPremium && (
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={handleManageSubscription}
              >
                Управлять подпиской
              </Button>
            )}

            {/* Legal */}
            <p className="text-xs text-center text-muted-foreground mt-5">
              Оплачивая подписку, вы соглашаетесь с{" "}
              <a href="/terms" className="underline hover:text-foreground">Пользовательским соглашением</a>,{" "}
              <a href="/privacy" className="underline hover:text-foreground">Политикой конфиденциальности</a> и{" "}
              <a href="/subscription" className="underline hover:text-foreground">Условиями подписки</a>.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
