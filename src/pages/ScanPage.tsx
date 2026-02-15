import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { safeLog, safeError } from "@/utils/safeLogger";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Camera, Image, Sparkles, X, Plus, ChefHat } from "lucide-react";
import { useFamily } from "@/contexts/FamilyContext";
import { useToast } from "@/hooks/use-toast";
import { useDeepSeek } from "@/hooks/useDeepSeek";

export default function ScanPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedMember } = useFamily();
  const { analyzeImage, isAnalyzing } = useDeepSeek();

  const [step, setStep] = useState<"capture" | "detecting" | "confirm">("capture");
  const [products, setProducts] = useState<Array<{ name: string; emoji: string; confirmed: boolean; isAllergy?: boolean }>>([]);
  const [editableProducts, setEditableProducts] = useState<Array<{ id: string; name: string }>>([]);
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

    // Начинаем анализ
    setStep("detecting");

    try {
      const analysis = await analyzeImage(file);
      safeLog('Analysis result:', analysis);

      const allergies = (selectedMember?.allergies ?? []).filter((a) => a?.trim());
      const isAllergen = (productName: string) => {
        if (!productName || productName.includes('не распознаны')) return false;
        const n = productName.toLowerCase().trim();
        return allergies.some((a) => {
          const t = a.trim().toLowerCase();
          return t && (n.includes(t) || t.includes(n));
        });
      };

      const detectedProducts = analysis.products.map((p) => ({
        name: p.name,
        emoji: p.emoji || "🥘",
        confirmed: true,
        isAllergy: isAllergen(p.name),
      }));

      // Преобразуем в редактируемый формат
      const editable = detectedProducts.length > 0
        ? detectedProducts.map((p, i) => ({ id: `product-${i}`, name: p.name }))
        : [{ id: `product-0`, name: "" }]; // Пустой список для ручного ввода

      setEditableProducts(editable);
      setProducts(detectedProducts); // Оставляем для совместимости
      setStep("confirm");

      if (detectedProducts.length > 0) {
        toast({
          title: "Продукты найдены!",
          description: `Распознано продуктов: ${detectedProducts.length}`,
        });
      }
    } catch (error: any) {
      safeError('Image analysis error:', error);

      let errorMessage = "Не удалось проанализировать изображение";
      if (error.message) {
        errorMessage = error.message;
        if (error.message.includes('токен') || error.message.includes('token') || error.message.includes('401') || error.message.includes('403')) {
          errorMessage = "Ошибка авторизации DeepSeek. Проверьте секрет DEEPSEEK_API_KEY в Supabase.";
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

  const updateProductName = (id: string, name: string) => {
    setEditableProducts(prev =>
      prev.map(p => p.id === id ? { ...p, name } : p)
    );
  };

  const removeProduct = (id: string) => {
    setEditableProducts(prev => prev.filter(p => p.id !== id));
  };

  const addProduct = () => {
    setEditableProducts(prev => [
      ...prev,
      { id: `product-${Date.now()}`, name: "" }
    ]);
  };

  const handleGenerate = async () => {
    // Берем продукты из редактируемого списка
    const productNames = editableProducts
      .map(p => p.name.trim())
      .filter(name => name.length > 0);

    if (productNames.length === 0) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Добавьте хотя бы один продукт",
      });
      return;
    }

    // Формируем промпт для чата
    const productsList = productNames.join(", ");
    const userMessage = `Что можно приготовить из этих продуктов: ${productsList}?`;

    // Переходим в чат с предзаполненным сообщением
    navigate("/chat", {
      state: {
        prefillMessage: userMessage,
        sourceProducts: productNames
      }
    });

    toast({
      title: "Переход в чат",
      description: "Рецепт будет сгенерирован в чате",
    });
  };

  const handleReset = () => {
    setStep("capture");
    setProducts([]);
    setEditableProducts([]);
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <MobileLayout title="Сканировать продукты">
      <div className="px-4 space-y-4">
        {step === "capture" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            {/* Camera Preview Area */}
            <div className="relative aspect-[4/5] rounded-3xl bg-gradient-to-br from-mint-light to-secondary overflow-hidden border-2 border-primary/20">
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
            <div className="flex flex-col gap-2">
              <Button
                variant="mint"
                size="lg"
                className="w-full"
                onClick={handleCameraClick}
              >
                <Camera className="w-5 h-5 mr-2" />
                Сфотографировать
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleGalleryClick}
              >
                <Image className="w-5 h-5 mr-2" />
                Галерея
              </Button>
            </div>

            {/* Tips */}
            <Card variant="lavender">
              <CardContent className="p-4">
                <p className="text-typo-muted text-accent-foreground/80">
                  💡 <strong>Совет:</strong> После распознавания вы можете добавить/изменить продукты вручную.
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
              <h2 className="text-typo-title font-semibold mb-2">Анализируем фото...</h2>
            </div>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Превью фото */}
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
                  className="absolute top-2 right-2 bg-background/80"
                  onClick={handleReset}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Редактируемый список продуктов */}
            <div className="space-y-3">
              <h2 className="text-typo-title font-semibold mb-2">Список продуктов</h2>
              {editableProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={product.name}
                    onChange={(e) => updateProductName(product.id, e.target.value)}
                    placeholder="Название продукта"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(product.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </div>

            {/* Кнопка добавить продукт вручную */}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={addProduct}
            >
              <Plus className="w-5 h-5 mr-2" />
              Добавить продукт вручную
            </Button>

            {/* Кнопка сгенерировать рецепт */}
            <Button
              variant="mint"
              size="xl"
              className="w-full"
              onClick={handleGenerate}
              disabled={editableProducts.filter(p => p.name.trim().length > 0).length === 0}
            >
              <ChefHat className="w-5 h-5 mr-2" />
              Сгенерировать рецепт
            </Button>
          </motion.div>
        )}

      </div>
    </MobileLayout>
  );
}
