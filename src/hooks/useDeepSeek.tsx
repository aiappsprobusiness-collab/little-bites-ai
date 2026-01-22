import { useQuery, useMutation } from "@tanstack/react-query";
import {
  fileToBase64,
  type ImageAnalysisResponse,
  type RecipeSuggestion,
} from "@/services/deepseek";
import { useChildren } from "./useChildren";
import { useDeepSeekAPI } from "./useDeepSeekAPI";

function extractJsonFromText(text: string): any {
  const trimmed = (text || "").trim();
  const match =
    trimmed.match(/```json\n?([\s\S]*?)\n?```/i) || trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no_json");
  const jsonStr = (match[1] || match[0]).trim();
  return JSON.parse(jsonStr);
}

export function useDeepSeek() {
  const { children, calculateAgeInMonths } = useChildren();
  const selectedChild = children[0];
  const { analyze, chat } = useDeepSeekAPI();

  // Анализ изображения
  const analyzeImage = useMutation({
    mutationFn: async (imageFile: File): Promise<ImageAnalysisResponse> => {
      try {
        const base64 = await fileToBase64(imageFile);
        return await analyze({ imageBase64: base64, mimeType: imageFile.type });
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
      try {
        const parts: string[] = [
          `Создай детский рецепт из продуктов: ${products.join(", ")}.`,
        ];
        if (childAgeMonths) parts.push(`Возраст ребенка: ${childAgeMonths} месяцев.`);
        if (allergies?.length) {
          parts.push(
            `Аллергии: ${allergies.join(", ")}. Не используй эти продукты и их производные.`
          );
        }
        parts.push("Ответ строго в JSON согласно формату.");

        const resp = await chat({
          type: "recipe",
          messages: [{ role: "user", content: parts.join(" ") }],
        });

        const parsed = extractJsonFromText(resp?.message || "");
        if (!parsed?.title || !Array.isArray(parsed?.ingredients) || !Array.isArray(parsed?.steps)) {
          throw new Error("invalid_recipe_json");
        }

        return {
          title: String(parsed.title),
          description: String(parsed.description || ""),
          ingredients: parsed.ingredients.map((x: any) => String(x)),
          steps: parsed.steps.map((x: any) => String(x)),
          cookingTime: Number(parsed.cookingTime || parsed.cooking_time || 20),
          ageRange: String(parsed.ageRange || ""),
        };
      } catch (error: any) {
        if (error?.message === "no_json" || error?.message === "invalid_recipe_json") {
          throw new Error("DeepSeek вернул неожиданный формат. Попробуйте ещё раз.");
        }
        throw error;
      }
    },
  });

  // Получение рекомендации
  const getRecommendation = useQuery({
    queryKey: ['deepseek-recommendation', selectedChild?.id],
    queryFn: async () => {
      if (!selectedChild) return null;

      try {
        const ageMonths = calculateAgeInMonths(selectedChild.birth_date);
        const resp = await chat({
          type: "chat",
          messages: [
            {
              role: "user",
              content: `Дай краткую полезную рекомендацию по питанию для ребенка ${ageMonths} месяцев (2-3 предложения).`,
            },
          ],
        });
        return resp?.message || null;
      } catch (error: any) {
        console.error('Recommendation error:', error);
        return null;
      }
    },
    enabled: !!selectedChild,
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
