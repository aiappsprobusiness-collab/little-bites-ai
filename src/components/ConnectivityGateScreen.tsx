import { Button } from "@/components/ui/button";
import type { ConnectivityCheckResult } from "@/utils/checkAppConnectivity";

const TITLES: Record<Exclude<ConnectivityCheckResult["reason"], "ok">, string> = {
  no_internet: "Нет подключения",
  blocked: "Не удаётся открыть приложение",
  server_error: "Сервис недоступен",
  timeout: "Долгое ожидание",
  bad_response: "Проверка связи",
};

function titleFor(result: ConnectivityCheckResult): string {
  if (result.reason === "ok") return "";
  return TITLES[result.reason] ?? "Ошибка";
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
        Обновить страницу
      </Button>
    </div>
  );
}
