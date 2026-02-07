import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Crown, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
}

const features = [
  { icon: "🤖", text: "Безлимитный AI-ассистент" },
  { icon: "👨‍👩‍👧‍👦", text: "До 10 профилей в семье" },
  { icon: "🥗", text: "Рецепты под аллергии и предпочтения" },
  { icon: "📅", text: "Недельные планы питания" },
  { icon: "💬", text: "24/7 помощь в чате" },
];

export function Paywall({ isOpen, onClose, onSubscribe }: PaywallProps) {
  const handleSubscribe = () => {
    // TODO: Интеграция с RevenueCat
    onSubscribe?.();
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
            className="w-full max-w-md bg-gradient-to-b from-background to-secondary/30 rounded-t-3xl sm:rounded-3xl p-6 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Crown icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="flex justify-center mb-6"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <Crown className="w-10 h-10 text-white" />
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0"
                >
                  {[...Array(6)].map((_, i) => (
                    <Sparkles
                      key={i}
                      className="absolute w-4 h-4 text-amber-400"
                      style={{
                        top: `${50 - 45 * Math.cos((i * Math.PI * 2) / 6)}%`,
                        left: `${50 + 45 * Math.sin((i * Math.PI * 2) / 6)}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}
                </motion.div>
              </div>
            </motion.div>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">
                Mama Premium — забота о семье на автопилоте
              </h2>
              <p className="text-muted-foreground text-sm">
                Персональные рецепты, планы питания и ИИ-помощник для всей семьи.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="text-lg">{feature.icon}</span>
                  <span>{feature.text}</span>
                </motion.div>
              ))}
            </div>

            {/* Pricing */}
            <Card variant="elevated" className="mb-6">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">299 ₽ / месяц</p>
                    <p className="text-sm text-muted-foreground">
                      или 3000 ₽ / год
                    </p>
                  </div>
                  <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                    Популярный
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CTA Button */}
            <Button
              variant="mint"
              size="xl"
              className="w-full mb-4"
              onClick={handleSubscribe}
            >
              <Zap className="w-5 h-5 mr-2" />
              Попробовать бесплатно 7 дней
            </Button>

            {/* Terms */}
            <p className="text-xs text-center text-muted-foreground">
              Отменить подписку можно в любое время. Подробнее в{" "}
              <a href="#" className="underline">
                условиях использования
              </a>
              .
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
