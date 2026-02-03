import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArticlesRow, ArticleCategoryV2 } from "@/integrations/supabase/types-v2";

const CATEGORIES: { value: ArticleCategoryV2 | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "weaning", label: "Прикорм" },
  { value: "safety", label: "Безопасность" },
  { value: "nutrition", label: "Питание" },
];

export { CATEGORIES };

export function useArticles(category: ArticleCategoryV2 | "all" | null = "all") {
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["articles", category],
    queryFn: async (): Promise<ArticlesRow[]> => {
      let q = supabase
        .from("articles")
        .select("id, title, description, content, category, is_premium, cover_image_url, age_category")
        .order("title", { ascending: true });

      if (category && category !== "all") {
        q = q.eq("category", category);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ArticlesRow[];
    },
  });

  return { articles, isLoading, categories: CATEGORIES };
}

export function useArticle(id: string | null) {
  const { data: article, isLoading } = useQuery({
    queryKey: ["article", id],
    queryFn: async (): Promise<ArticlesRow | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, description, content, category, is_premium, cover_image_url, age_category")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ArticlesRow | null;
    },
    enabled: !!id,
  });

  return { article, isLoading };
}
