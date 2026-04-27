import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  createMarketingLink,
  getMarketingLinks,
  getPublicGoUrl,
  type MarketingLinkRow,
} from "@/utils/marketingLinks";

export default function MarketingLinksPage() {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");
  const [list, setList] = useState<MarketingLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getMarketingLinks();
      setList(rows);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Не удалось загрузить ссылки",
        description: e instanceof Error ? e.message : "Ошибка Supabase",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign.trim() || !content.trim()) {
      toast({ variant: "destructive", title: "Заполните campaign и content" });
      return;
    }
    setSaving(true);
    try {
      await createMarketingLink({
        campaign: campaign.trim(),
        content: content.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });
      setCampaign("");
      setContent("");
      setSlug("");
      toast({ title: "Ссылка создана" });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось сохранить",
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyGoLink(s: string) {
    const text = getPublicGoUrl(s);
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Скопировано", description: text });
    } catch {
      toast({ variant: "destructive", title: "Не удалось скопировать" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-12">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link to="/admin/telegram-blogger-links" className="text-primary underline underline-offset-2">
          Ссылки на Telegram-бота для блогеров
        </Link>{" "}
        (не сайт, атрибуция /start)
      </p>
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Marketing links</h1>

      <form onSubmit={handleCreate} className="mb-10 space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor="m-campaign">Campaign</Label>
          <Input
            id="m-campaign"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="quick_dinners"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="m-content">Content</Label>
          <Input
            id="m-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="chicken_01"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="m-slug">Slug (optional)</Label>
          <Input
            id="m-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="оставьте пустым для автогенерации"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Сохранение…" : "Create link"}
        </Button>
      </form>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Все ссылки</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет записей</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="max-w-[200px] truncate">URL</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.click_count ?? 0}</TableCell>
                  <TableCell className="text-sm">{row.campaign}</TableCell>
                  <TableCell className="text-sm">{row.content}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={row.url}>
                    {row.url}
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyGoLink(row.slug)}>
                      Copy /go link
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
