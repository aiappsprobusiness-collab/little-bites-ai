import { Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import type { ArticlesRow } from "@/integrations/supabase/types-v2";

interface ArticleReaderModalProps {
  article: ArticlesRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
}

export function ArticleReaderModal({ article, open, onOpenChange, isLoading }: ArticleReaderModalProps) {
  const { toast } = useToast();

  const handleShare = async () => {
    if (!article) return;
    const shareData = {
      title: article.title,
      text: article.description || article.title,
      url: window.location.origin + "/articles?id=" + article.id,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        toast({ title: "Поделиться", description: "Ссылка на статью отправлена" });
      } else {
        const url = shareData.url;
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          toast({ title: "Ссылка скопирована" });
        } else {
          toast({ variant: "destructive", title: "Копирование недоступно" });
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast({ variant: "destructive", title: "Ошибка", description: "Не удалось поделиться" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-2 shrink-0 flex flex-row items-start justify-between gap-2">
          <DialogTitle className="text-typo-title pr-8">{article?.title ?? ""}</DialogTitle>
          <DialogDescription className="sr-only">Содержимое статьи</DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="shrink-0"
            title="Поделиться статьей"
          >
            <Share2 className="w-5 h-5" />
          </Button>
        </DialogHeader>
        <div className="overflow-y-auto px-4 pb-6 prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 [&>*]:text-typo-muted">
          {isLoading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : article?.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground">Нет содержимого.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
