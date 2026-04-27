import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { TELEGRAM_START_MAX_BYTES, buildBloggerLinkFromForm } from "@/utils/telegramBloggerLink";
import {
  createTelegramBlogger,
  getTelegramBloggers,
  setTelegramBloggerActive,
  type TelegramBloggerRow,
} from "@/utils/telegramBloggersDb";

const BOT = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "").trim();

const CODE_HELP = "Только a–z, 0–9 и _, до 32 символов, без пробелов — как в URL.";

export default function TelegramBloggerLinksPage() {
  const { toast } = useToast();
  const [bloggerId, setBloggerId] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmSource, setUtmSource] = useState("");

  const [rows, setRows] = useState<TelegramBloggerRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await getTelegramBloggers();
      setRows(data);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Не удалось загрузить блогеров",
        description: e instanceof Error ? e.message : "Supabase",
      });
    } finally {
      setListLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const { link, error, lengthBytes } = useMemo(
    () =>
      buildBloggerLinkFromForm(BOT, {
        bloggerId,
        utmCampaign: utmCampaign || undefined,
        utmMedium: utmMedium || undefined,
        utmSource: utmSource || undefined,
      }),
    [bloggerId, utmCampaign, utmMedium, utmSource],
  );

  async function copy() {
    if (!link) {
      toast({ variant: "destructive", title: "Сначала исправьте ошибки или заполните blogger_id" });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Ссылка скопирована" });
    } catch {
      toast({ variant: "destructive", title: "Не удалось скопировать" });
    }
  }

  async function handleAddBlogger(e: React.FormEvent) {
    e.preventDefault();
    const c = newCode.trim().toLowerCase();
    if (!c || !newName.trim()) {
      toast({ variant: "destructive", title: "Заполните код и отображаемое имя" });
      return;
    }
    if (!/^[a-z0-9_]{1,32}$/.test(c)) {
      toast({ variant: "destructive", title: "Некорректный код", description: CODE_HELP });
      return;
    }
    setSaving(true);
    try {
      await createTelegramBlogger({
        code: c,
        displayName: newName.trim(),
        channelUrl: newChannel.trim() || undefined,
      });
      setNewCode("");
      setNewName("");
      setNewChannel("");
      toast({ title: "Блогер добавлен" });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: /duplicate|unique/i.test(msg) ? "Код уже занят — введите другой." : msg,
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: TelegramBloggerRow, checked: boolean) {
    try {
      await setTelegramBloggerActive(row.id, checked);
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-12">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link to="/admin/marketing-links" className="text-primary underline underline-offset-2">
          ← Marketing links
        </Link>{" "}
        (сайт с UTM)
      </p>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Ссылки на бота для блогеров</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ссылка ведёт в Telegram, а не на сайт. Параметр <code className="text-xs">start</code> читает
        онбординг-бот; атрибуция дойдёт до регистрации в приложении. Ограничение Telegram:{" "}
        <strong>до {TELEGRAM_START_MAX_BYTES} байт</strong> в <code className="text-xs">start</code>. Таблица
        <code className="text-xs"> telegram_bloggers</code> — справочник кодов для удобства; можно и вручную
        ввести <code className="text-xs">blogger_id</code> ниже.
      </p>

      {!BOT ? (
        <div
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          Задайте в <code className="text-xs">.env</code> переменную{" "}
          <code className="text-xs">VITE_TELEGRAM_BOT_USERNAME</code> = username бота без <code className="text-xs">@</code> (как
          в BotFather), пересоберите фронт. Без неё ссылка не соберётся.
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-medium text-foreground">Справочник блогеров (Supabase)</h2>
      <form
        onSubmit={(e) => void handleAddBlogger(e)}
        className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4"
      >
        <p className="text-xs text-muted-foreground">{CODE_HELP}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="new-code">Код (blogger_id)</Label>
            <Input
              id="new-code"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="maria_01"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-name">Имя / канал (для себя)</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Мария, канал @..."
              autoComplete="off"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-ch">Ссылка на канал (необязательно)</Label>
          <Input
            id="new-ch"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            placeholder="https://t.me/..."
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Сохранение…" : "Добавить в базу"}
        </Button>
      </form>

      {listLoading ? (
        <p className="mb-6 text-sm text-muted-foreground">Загрузка списка…</p>
      ) : (
        <div className="mb-10 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Кому</TableHead>
                <TableHead className="w-[100px]">Активен</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-sm">
                    Пока нет записей — добавьте блогера выше.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.code}</TableCell>
                    <TableCell className="text-sm">{row.display_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={row.is_active}
                          onCheckedChange={(c) => void toggleActive(row, c === true)}
                          aria-label="Активен"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setBloggerId(row.code);
                          toast({ title: "Код подставлен в форму ссылки" });
                        }}
                        disabled={!row.is_active}
                      >
                        В ссылку
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 text-sm font-medium text-foreground">Собрать ссылку</h2>
      {rows.length > 0 && BOT ? (
        <div className="mb-3">
          <Label htmlFor="pick-b" className="text-muted-foreground">
            Быстро: выбрать код из базы
          </Label>
          <select
            id="pick-b"
            key={pickerKey}
            className="mt-1.5 flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                setBloggerId(v);
                setPickerKey((k) => k + 1);
                toast({ title: "Код подставлен" });
              }
            }}
          >
            <option value="">—</option>
            {rows.filter((r) => r.is_active).map((r) => (
              <option key={r.id} value={r.code}>
                {r.code} — {r.display_name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <form className="mb-6 space-y-4 rounded-lg border border-border bg-card p-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-2">
          <Label htmlFor="blogger-id">blogger_id</Label>
          <Input
            id="blogger-id"
            value={bloggerId}
            onChange={(e) => setBloggerId(e.target.value)}
            placeholder="например maria_01"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-c">utm_campaign (по желанию)</Label>
          <Input
            id="utm-c"
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
            placeholder="весна_2026"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-m">utm_medium (по желанию)</Label>
          <Input
            id="utm-m"
            value={utmMedium}
            onChange={(e) => setUtmMedium(e.target.value)}
            placeholder="post"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="utm-s">utm_source (по желанию, иначе бот поставит telegram)</Label>
          <Input
            id="utm-s"
            value={utmSource}
            onChange={(e) => setUtmSource(e.target.value)}
            placeholder="оставьте пустым или tg_channel"
            autoComplete="off"
          />
        </div>
      </form>

      {BOT ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Бот: <code className="text-foreground">{BOT}</code>
        </p>
      ) : null}

      <div className="mb-2 rounded-md border border-border bg-muted/40 p-3">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          Размер payload (start): {lengthBytes} / {TELEGRAM_START_MAX_BYTES} байт
        </p>
        <p className="mt-2 break-all font-mono text-xs sm:text-sm">{link || "—"}</p>
        <Button type="button" className="mt-3" onClick={() => void copy()} disabled={!link}>
          Скопировать ссылку
        </Button>
      </div>
    </div>
  );
}
