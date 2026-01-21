import { useQuery, useMutation } from '@tanstack/react-query';
import { getGigaChat, fileToBase64, isGigaChatConfigured, type ImageAnalysisResponse, type RecipeSuggestion } from '@/services/gigachat';
import { useChildren } from './useChildren';

export function useGigaChat() {
  const { children, calculateAgeInMonths } = useChildren();
  const selectedChild = children[0];
  const isConfigured = isGigaChatConfigured();

  // Анализ изображения
  const analyzeImage = useMutation({
    mutationFn: async (imageFile: File): Promise<ImageAnalysisResponse> => {
      if (!isConfigured) {
        throw new Error('GigaChat не настроен. См. GIGACHAT_SETUP.md');
      }

      try {
        const base64 = await fileToBase64(imageFile);
        const gigachat = getGigaChat();
        return await gigachat.analyzeImage(base64, imageFile.type);
      } catch (error: any) {
        throw new Error(error.message || 'Не удалось проанализировать изображение');
      }
    },
  });

  // Генерация рецепта
  const generateRecipe = useMutation({
    mutationFn: async ({
      products,
      childAgeMonths,
      allergies,
    }: {
      products: string[];
      childAgeMonths?: number;
      allergies?: string[];
    }): Promise<RecipeSuggestion> => {
      if (!isConfigured) {
        throw new Error('GigaChat не настроен. См. GIGACHAT_SETUP.md');
      }

      try {
        const gigachat = getGigaChat();
        return await gigachat.generateRecipe(products, childAgeMonths, allergies);
      } catch (error: any) {
        // Пробрасываем оригинальное сообщение об ошибке
        throw error;
      }
    },
  });

  // Получение рекомендации
  const getRecommendation = useQuery({
    queryKey: ['gigachat-recommendation', selectedChild?.id],
    queryFn: async () => {
      if (!selectedChild || !isConfigured) return null;

      try {
        const gigachat = getGigaChat();
        const ageMonths = calculateAgeInMonths(selectedChild.birth_date);
        return await gigachat.getRecommendation(ageMonths, selectedChild.allergies || undefined);
      } catch (error: any) {
        console.error('Recommendation error:', error);
        return null;
      }
    },
    enabled: !!selectedChild && isConfigured,
    staleTime: 1000 * 60 * 60, // 1 час
  });

  return {
    analyzeImage: analyzeImage.mutateAsync,
    generateRecipe: generateRecipe.mutateAsync,
    recommendation: getRecommendation.data,
    isAnalyzing: analyzeImage.isPending,
    isGenerating: generateRecipe.isPending,
    isLoadingRecommendation: getRecommendation.isLoading,
    analyzeError: analyzeImage.error,
    generateError: generateRecipe.error,
  };
}
