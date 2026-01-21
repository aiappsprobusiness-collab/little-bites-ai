import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Image, Sparkles, Loader2, ChevronRight, X } from "lucide-react";
import { useDeepSeek } from "@/hooks/useDeepSeek";
import { useChildren } from "@/hooks/useChildren";
import { useRecipes } from "@/hooks/useRecipes";
import { useToast } from "@/hooks/use-toast";
import { isDeepSeekConfigured } from "@/services/deepseek";

export default function ScanPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { children } = useChildren();
  const { createRecipe } = useRecipes();
  const selectedChild = children[0];
  const { analyzeImage, generateRecipe, isAnalyzing, isGenerating } = useDeepSeek();

  const [step, setStep] = useState<"capture" | "detecting" | "confirm" | "generating">("capture");
  const [products, setProducts] = useState<Array<{ name: string; emoji: string; confirmed: boolean }>>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (file: File) => {
    setSelectedImage(file);
    
    // Создаем preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Если DeepSeek не настроен, используем mock данные
    if (!isDeepSeekConfigured()) {
      toast({
        title: "DeepSeek не настроен",
        description: "Используются тестовые данные. Добавьте VITE_DEEPSEEK_API_KEY в .env файл",
        variant: "default",
      });
      
      // Используем mock данные
      const mockProducts = [
        { name: "Тыква", emoji: "🎃", confirmed: true },
        { name: "Яблоко", emoji: "🍎", confirmed: true },
        { name: "Морковь", emoji: "🥕", confirmed: true },
      ];
      setProducts(mockProducts);
      setStep("confirm");
      return;
    }

    // Начинаем анализ
    setStep("detecting");
    
    try {
      const analysis = await analyzeImage(file);
      console.log('Analysis result:', analysis);
      
      const detectedProducts = analysis.products.map(p => ({
        name: p.name,
        emoji: p.emoji || "🥘",
        confirmed: true,
      }));
      
      if (detectedProducts.length > 0) {
        setProducts(detectedProducts);
        setStep("confirm");
        toast({
          title: "Продукты найдены!",
          description: `Распознано продуктов: ${detectedProducts.length}`,
        });
      } else {
        // Если продукты не найдены, предлагаем создать рецепт вручную
        toast({
          title: "Продукты не распознаны",
          description: "Попробуйте другое фото или создайте рецепт вручную",
          variant: "default",
        });
        setProducts([
          { name: "Продукты не распознаны автоматически", emoji: "❓", confirmed: false },
        ]);
        setStep("confirm");
      }
    } catch (error: any) {
      console.error('Image analysis error:', error);
      
      let errorMessage = "Не удалось проанализировать изображение";
      if (error.message) {
        errorMessage = error.message;
        if (error.message.includes('токен') || error.message.includes('token') || error.message.includes('401') || error.message.includes('403')) {
          errorMessage = "Ошибка авторизации DeepSeek. Проверьте API ключ в .env файле.";
        } else if (error.message.includes('CORS') || error.message.includes('network')) {
          errorMessage = "Проблема с подключением. Проверьте интернет.";
        }
      }
      
      toast({
        variant: "destructive",
        title: "Ошибка анализа",
        description: errorMessage,
      });
      setStep("capture");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageSelect(file);
    }
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const toggleProduct = (index: number) => {
    setProducts(prev => 
      prev.map((p, i) => i === index ? { ...p, confirmed: !p.confirmed } : p)
    );
  };

  const handleGenerate = async () => {
    setStep("generating");
    
    const confirmedProducts = products.filter(p => p.confirmed).map(p => p.name);
    
    if (confirmedProducts.length === 0) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Выберите хотя бы один продукт",
      });
      setStep("confirm");
      return;
    }

    // Если DeepSeek не настроен, переходим на страницу создания рецепта вручную
    if (!isDeepSeekConfigured()) {
      navigate("/recipe/new", {
        state: {
          sourceProducts: confirmedProducts,
        }
      });
      return;
    }

    try {
      const ageMonths = selectedChild 
        ? Math.floor((new Date().getTime() - new Date(selectedChild.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
        : undefined;

      const recipe = await generateRecipe({
        products: confirmedProducts,
        childAgeMonths: ageMonths,
        allergies: selectedChild?.allergies || undefined,
      });

      // Создаем рецепт в базе данных
      const ingredients = recipe.ingredients.map((ing, index) => ({
        name: ing,
        amount: null,
        unit: null,
        category: "other" as const,
        order_index: index,
      }));

      const steps = recipe.steps.map((step, index) => ({
        instruction: step,
        step_number: index + 1,
        duration_minutes: null,
      }));

      const newRecipe = await createRecipe({
        recipe: {
          title: recipe.title,
          description: recipe.description,
          cooking_time_minutes: recipe.cookingTime,
          min_age_months: ageMonths || 6,
          max_age_months: ageMonths ? ageMonths + 12 : 36,
          child_id: selectedChild?.id || null,
          image_url: imagePreview || null,
        },
        ingredients,
        steps,
      });

      toast({
        title: "Рецепт создан!",
        description: `Рецепт "${recipe.title}" успешно добавлен`,
      });

      navigate(`/recipe/${newRecipe.id}`);
    } catch (error: any) {
      console.error('Recipe creation error:', error);
      
      // Более детальное сообщение об ошибке
      let errorMessage = "Не удалось создать рецепт";
      if (error.message) {
        errorMessage = error.message;
        // Улучшаем сообщения для пользователя
        if (error.message.includes('токен') || error.message.includes('token') || error.message.includes('401') || error.message.includes('403')) {
          errorMessage = "Ошибка авторизации DeepSeek. Проверьте API ключ в .env файле.";
        } else if (error.message.includes('CORS') || error.message.includes('network')) {
          errorMessage = "Проблема с подключением к DeepSeek. Проверьте интернет-соединение.";
        }
      }
      
      toast({
        variant: "destructive",
        title: "Ошибка создания рецепта",
        description: errorMessage,
      });
      setStep("confirm");
    }
  };

  const handleReset = () => {
    setStep("capture");
    setProducts([]);
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-card shadow-card flex items-center justify-center">
                    <Camera className="w-12 h-12 text-primary" />
                  </div>
                  <p className="text-foreground/70 text-center px-8 font-medium">
                    Наведите камеру на продукты, которые хотите использовать
                  </p>
                </div>
              )}
              
              {/* Corner guides */}
              <div className="absolute top-6 left-6 w-16 h-16 border-l-4 border-t-4 border-primary rounded-tl-2xl" />
              <div className="absolute top-6 right-6 w-16 h-16 border-r-4 border-t-4 border-primary rounded-tr-2xl" />
              <div className="absolute bottom-6 left-6 w-16 h-16 border-l-4 border-b-4 border-primary rounded-bl-2xl" />
              <div className="absolute bottom-6 right-6 w-16 h-16 border-r-4 border-b-4 border-primary rounded-br-2xl" />
            </div>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileInput}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={handleGalleryClick}
              >
                <Image className="w-5 h-5 mr-2" />
                Галерея
              </Button>
              <Button
                variant="mint"
                size="lg"
                className="flex-[2]"
                onClick={handleCameraClick}
              >
                <Camera className="w-5 h-5 mr-2" />
                Сфотографировать
              </Button>
            </div>

            {/* Tips */}
            <Card variant="lavender">
              <CardContent className="p-4">
                <p className="text-sm text-accent-foreground/80">
                  💡 <strong>Совет:</strong> Разложите продукты на светлом фоне для лучшего распознавания. DeepSeek AI проанализирует фото и найдет все продукты.
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
              <p className="text-muted-foreground">DeepSeek AI распознает продукты</p>
            </div>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {imagePreview && (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Selected"
                  className="w-full rounded-2xl object-cover max-h-64"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleReset}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Найденные продукты</h2>
              <p className="text-muted-foreground">
                Подтвердите или уберите лишнее
              </p>
            </div>

            {products.length === 0 ? (
              <Card variant="default" className="p-8 text-center">
                <CardContent className="p-0">
                  <p className="text-muted-foreground mb-4">
                    Продукты не найдены. Попробуйте другое фото.
                  </p>
                  <Button variant="outline" onClick={handleReset}>
                    Выбрать другое фото
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {products.map((product, index) => (
                    <motion.div
                      key={`${product.name}-${index}`}
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
                  disabled={products.filter(p => p.confirmed).length === 0}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Создать рецепт с DeepSeek
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </>
            )}
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
              <h2 className="text-xl font-bold mb-2">Создаем рецепт...</h2>
              <p className="text-muted-foreground">
                DeepSeek AI подбирает лучший рецепт для вашего малыша
              </p>
            </div>
            <div className="flex gap-2">
              {products.filter(p => p.confirmed).slice(0, 3).map((product, i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                  className="text-2xl"
                >
                  {product.emoji}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
}
