import { Button } from "@/components/ui/button";
import type { ConnectivityCheckResult } from "@/utils/checkAppConnectivity";

const TITLES: Record<Exclude<ConnectivityCheckResult["reason"], "ok">, string> = {
  no_internet: "Интернет сейчас недоступен",
  blocked: "Не получилось открыть Mom Recipes",
  server_error: "Сервис ненадолго недоступен",
  timeout: "Страница не успела загрузиться",
  bad_response: "Загрузка прервалась",
};

function titleFor(result: ConnectivityCheckResult): string {
  if (result.reason === "ok") return "";
  return TITLES[result.reason] ?? "Что-то пошло не так";
}

interface Props {
  result: ConnectivityCheckResult;
}

/** Полноэкранное сообщение до монтирования основного App (см. bootstrapReactApp). */
export function ConnectivityGateScreen({ result }: Props) {
  if (result.reason === "ok") return null;

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center"
      role="alert"
    >
      <p className="text-base font-semibold text-foreground mb-2">{titleFor(result)}</p>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm leading-relaxed">{result.message}</p>
      <Button type="button" size="lg" onClick={() => window.location.reload()}>
        Попробовать снова
      </Button>
    </div>
  );
}
