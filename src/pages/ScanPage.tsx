import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Image, Sparkles, Loader2, ChevronRight } from "lucide-react";

const detectedProducts = [
  { name: "Тыква", emoji: "🎃", confirmed: true },
  { name: "Яблоко", emoji: "🍎", confirmed: true },
  { name: "Морковь", emoji: "🥕", confirmed: true },
  { name: "Банан", emoji: "🍌", confirmed: false },
];

export default function ScanPage() {
  const [step, setStep] = useState<"capture" | "detecting" | "confirm" | "generating">("capture");
  const [products, setProducts] = useState(detectedProducts);

  const handleCapture = () => {
    setStep("detecting");
    setTimeout(() => setStep("confirm"), 2000);
  };

  const toggleProduct = (index: number) => {
    setProducts(prev => 
      prev.map((p, i) => i === index ? { ...p, confirmed: !p.confirmed } : p)
    );
  };

  const handleGenerate = () => {
    setStep("generating");
  };

  return (
    <MobileLayout title="Сканировать продукты">
      <div className="px-4 pt-6 space-y-6">
        {step === "capture" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Camera Preview Area */}
            <div className="relative aspect-[3/4] rounded-3xl bg-gradient-to-br from-mint-light to-secondary overflow-hidden border-2 border-primary/20">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="w-24 h-24 rounded-full bg-card shadow-card flex items-center justify-center">
                  <Camera className="w-12 h-12 text-primary" />
                </div>
                <p className="text-foreground/70 text-center px-8 font-medium">
                  Наведите камеру на продукты, которые хотите использовать
                </p>
              </div>
              
              {/* Corner guides */}
              <div className="absolute top-6 left-6 w-16 h-16 border-l-4 border-t-4 border-primary rounded-tl-2xl" />
              <div className="absolute top-6 right-6 w-16 h-16 border-r-4 border-t-4 border-primary rounded-tr-2xl" />
              <div className="absolute bottom-6 left-6 w-16 h-16 border-l-4 border-b-4 border-primary rounded-bl-2xl" />
              <div className="absolute bottom-6 right-6 w-16 h-16 border-r-4 border-b-4 border-primary rounded-br-2xl" />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
              >
                <Image className="w-5 h-5 mr-2" />
                Галерея
              </Button>
              <Button
                variant="mint"
                size="lg"
                className="flex-[2]"
                onClick={handleCapture}
              >
                <Camera className="w-5 h-5 mr-2" />
                Сфотографировать
              </Button>
            </div>

            {/* Tips */}
            <Card variant="lavender">
              <CardContent className="p-4">
                <p className="text-sm text-accent-foreground/80">
                  💡 <strong>Совет:</strong> Разложите продукты на светлом фоне для лучшего распознавания
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "detecting" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center"
            >
              <Sparkles className="w-12 h-12 text-primary-foreground" />
            </motion.div>
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Анализируем фото...</h2>
              <p className="text-muted-foreground">ИИ распознает продукты</p>
            </div>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Найденные продукты</h2>
              <p className="text-muted-foreground">
                Подтвердите или уберите лишнее
              </p>
            </div>

            <div className="space-y-3">
              {products.map((product, index) => (
                <motion.div
                  key={product.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    variant={product.confirmed ? "mint" : "default"}
                    className="cursor-pointer"
                    onClick={() => toggleProduct(index)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <span className="text-3xl">{product.emoji}</span>
                      <span className="font-semibold flex-1">{product.name}</span>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          product.confirmed
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {product.confirmed && (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-4 h-4 text-primary-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </motion.svg>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <Button
              variant="mint"
              size="xl"
              className="w-full"
              onClick={handleGenerate}
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Создать рецепты
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        )}

        {step === "generating" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="relative"
            >
              <div className="w-32 h-32 rounded-full gradient-peach flex items-center justify-center">
                <span className="text-5xl">👨‍🍳</span>
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-primary flex items-center justify-center"
              >
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </motion.div>
            </motion.div>
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Создаем рецепты...</h2>
              <p className="text-muted-foreground">
                ИИ подбирает лучшие варианты для вашего малыша
              </p>
            </div>
            <div className="flex gap-2">
              {["🎃", "🍎", "🥕"].map((emoji, i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                  className="text-2xl"
                >
                  {emoji}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
}
