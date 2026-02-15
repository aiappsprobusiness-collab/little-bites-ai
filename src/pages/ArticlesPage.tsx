import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, BookOpen } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Paywall } from "@/components/subscription/Paywall";
import { useArticles, useArticle, CATEGORIES } from "@/hooks/useArticles";
import { useSubscription } from "@/hooks/useSubscription";
import { ArticleReaderModal } from "@/components/articles/ArticleReaderModal";
import type { ArticlesRow, ArticleCategoryV2 } from "@/integrations/supabase/types-v2";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function ArticlesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const idFromUrl = searchParams.get("id");

  const [selectedCategory, setSelectedCategory] = useState<ArticleCategoryV2 | "all">("all");
  const [selectedArticle, setSelectedArticle] = useState<ArticlesRow | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const { articles, isLoading, categories } = useArticles(selectedCategory);
  const { article: articleFromUrl, isLoading: isLoadingUrlArticle } = useArticle(idFromUrl);
  const { isPremium, hasAccess } = useSubscription();
  const { toast } = useToast();

  // Deep-link: open article when URL has ?id=...
  useEffect(() => {
    if (!idFromUrl) return;
    if (isLoadingUrlArticle) return;
    if (articleFromUrl) {
      if (articleFromUrl.is_premium && !hasAccess) {
        setShowPaywall(true);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("id");
          return next;
        });
        return;
      }
      setSelectedArticle(articleFromUrl);
      setReaderOpen(true);
    } else {
      toast({ variant: "destructive", title: "Статья не найдена" });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("id");
        return next;
      });
    }
  }, [idFromUrl, articleFromUrl, isLoadingUrlArticle, hasAccess, setSearchParams, toast]);

  const handleCardClick = (article: ArticlesRow) => {
    if (article.is_premium && !hasAccess) {
      setShowPaywall(true);
      return;
    }
    setSelectedArticle(article);
    setReaderOpen(true);
  };

  return (
    <MobileLayout title="База знаний" showNav>
      <div className="px-4 pt-4 pb-24">
        {/* Горизонтальный скролл категорий */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-4">
          <div className="flex gap-2 min-w-max">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value as ArticleCategoryV2 | "all")}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-full text-typo-muted font-semibold transition-colors",
                  selectedCategory === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-typo-muted">Загрузка статей...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-typo-muted">В этой категории пока нет статей</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {articles.map((article, index) => (
              <motion.button
                key={article.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleCardClick(article)}
                className="text-left rounded-2xl overflow-hidden border border-border/50 bg-card shadow-soft hover:shadow-md active:scale-[0.98] transition-all"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {article.cover_image_url ? (
                    <img
                      src={article.cover_image_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                      <BookOpen className="w-10 h-10 text-primary/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {article.is_premium && !hasAccess && (
                    <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 flex items-center justify-center shadow">
                      <Lock className="w-4 h-4 text-amber-600" />
                    </span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="font-semibold text-typo-muted text-white drop-shadow-md line-clamp-2">
                      {article.title}
                    </h3>
                    {article.description && (
                      <p className="text-typo-caption text-white/90 mt-0.5 line-clamp-1 drop-shadow">
                        {article.description}
                      </p>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <Paywall isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
      <ArticleReaderModal
        article={selectedArticle}
        open={readerOpen}
        onOpenChange={(open) => {
          setReaderOpen(open);
          if (!open) {
            setSelectedArticle(null);
            if (idFromUrl) {
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("id");
                return next;
              });
            }
          }
        }}
      />
    </MobileLayout>
  );
}
