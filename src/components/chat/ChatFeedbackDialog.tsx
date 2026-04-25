import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

const DEFAULT_SUPPORT_EMAIL = "momrecipesai@gmail.com";
const MAIL_SUBJECT = "Mom Recipes: сообщение об ошибке";

function buildFeedbackMailHref(
  supportEmail: string,
  reporter?: { userId: string; accountEmail?: string | null }
): string {
  const subject = encodeURIComponent(MAIL_SUBJECT);
  const lines: string[] = [
    "Пожалуйста, опишите проблему (что делали, что увидели):",
    "",
    "",
  ];
  if (reporter?.userId) {
    lines.push("— Справка для поддержки (можно не удалять) —");
    lines.push(`ID пользователя: ${reporter.userId}`);
    if (reporter.accountEmail) {
      lines.push(`Email в аккаунте: ${reporter.accountEmail}`);
    }
  }
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
}

export interface ChatFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Адрес для mailto (по умолчанию общий ящик поддержки). */
  supportEmail?: string;
  /** Данные вошедшего пользователя — попадают в тело письма для поиска в БД (Supabase `auth.users.id`). */
  reporter?: { userId: string; accountEmail?: string | null };
}

/**
 * Подсказка перед отправкой отчёта об ошибке: скриншот + описание, затем открытие почтового клиента.
 */
export function ChatFeedbackDialog({
  open,
  onOpenChange,
  supportEmail = DEFAULT_SUPPORT_EMAIL,
  reporter,
}: ChatFeedbackDialogProps) {
  const mailHref = buildFeedbackMailHref(supportEmail, reporter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-left text-lg font-semibold leading-snug">Сообщить об ошибке</DialogTitle>
          <DialogDescription asChild>
            <div className="text-left text-[15px] leading-relaxed text-foreground/90 pt-2 space-y-2">
              <p>
                Чтобы мы могли улучшить сервис, сделайте скриншот проблемы и в письме кратко опишите ситуацию: что вы
                делали и что пошло не так. Так нам будет проще разобраться.
              </p>
              {reporter?.userId ? (
                <p className="text-foreground/75 text-sm">
                  В черновик письма добавлены ID вашего аккаунта и почта из профиля — так проще найти вашу запись в
                  системе. Отправить письмо можно с любого ящика.
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-0 pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto rounded-xl gap-2"
            onClick={() => {
              window.location.href = mailHref;
              onOpenChange(false);
            }}
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            Написать на почту
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
