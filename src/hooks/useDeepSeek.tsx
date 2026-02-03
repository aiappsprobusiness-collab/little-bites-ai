import { useQuery, useMutation } from '@tanstack/react-query';
import { getDeepSeek, fileToBase64, isDeepSeekConfigured, type ImageAnalysisResponse, type RecipeSuggestion } from '@/services/deepseek';
import { useSelectedChild } from '@/contexts/SelectedChildContext';

export function useDeepSeek() {
  const { children, selectedChild } = useSelectedChild();
  const profile = selectedChild ?? children[0];
  const isConfigured = isDeepSeekConfigured();

  // Анализ изображения
  const analyzeImage = useMutation({
    mutationFn: async (imageFile: File): Promise<ImageAnalysisResponse> => {
      if (!isConfigured) {
        throw new Error('DeepSeek не настроен. Добавьте VITE_DEEPSEEK_API_KEY в .env файл');
      }

      try {
        const base64 = await fileToBase64(imageFile);
        const deepseek = getDeepSeek();
        return await deepseek.analyzeImage(base64, imageFile.type);
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
        throw new Error('DeepSeek не настроен. Добавьте VITE_DEEPSEEK_API_KEY в .env файл');
      }

      try {
        const deepseek = getDeepSeek();
        return await deepseek.generateRecipe(products, childAgeMonths, allergies);
      } catch (error: any) {
        throw error;
      }
    },
  });

  const getRecommendation = useQuery({
    queryKey: ['deepseek-recommendation', profile?.id],
    queryFn: async () => {
      if (!profile || !isConfigured) return null;

      try {
        const deepseek = getDeepSeek();
        const ageMonths = profile.age_months ?? 0;
        return await deepseek.getRecommendation(ageMonths, profile.allergies || undefined);
      } catch (error: any) {
        console.error('Recommendation error:', error);
        return null;
      }
    },
    enabled: !!profile && isConfigured,
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
