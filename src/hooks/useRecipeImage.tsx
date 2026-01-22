import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRecipeImage() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = async (recipeId: string, recipeName: string): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `https://hidgiyyunigqazssnydm.supabase.co/functions/v1/generate-recipe-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ recipeId, recipeName }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('Image generation error:', error);
        return null;
      }

      const data = await response.json();
      return data.imageUrl || null;
    } catch (error) {
      console.error('Failed to generate image:', error);
      return null;
    }
  };

  const generateImagesForRecipes = async (
    recipes: Array<{ id: string; title: string }>,
    onProgress?: (current: number, total: number) => void
  ) => {
    setIsGenerating(true);
    const total = recipes.length;
    let current = 0;

    for (const recipe of recipes) {
      await generateImage(recipe.id, recipe.title);
      current++;
      onProgress?.(current, total);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsGenerating(false);
  };

  return {
    generateImage,
    generateImagesForRecipes,
    isGenerating,
  };
}
