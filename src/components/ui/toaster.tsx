import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Варианты Toast из `toastVariants` (в т.ч. successSoft); для показа крестика и таймеров. */
function toastShowsClose(
  variant: "default" | "destructive" | "successSoft" | null | undefined,
  action: ReactNode,
  duration: number | undefined,
): boolean {
  if (variant === "destructive") return true;
  if (action != null) return true;
  if (typeof duration === "number" && !Number.isFinite(duration)) return true;
  return false;
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, duration, ...props }) {
        const showClose = toastShowsClose(variant, action, duration);
        const isDestructive = variant === "destructive";
        const isSuccessSoft = variant === "successSoft";

        const icon = isDestructive ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive-foreground" strokeWidth={1.75} aria-hidden />
        ) : (
          <CheckCircle2
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0 opacity-95",
              isSuccessSoft ? "text-primary" : "text-primary-foreground",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        );

        const textBlock = (
          <div className="grid min-w-0 flex-1 gap-0.5">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
        );

        return (
          <Toast
            key={id}
            variant={variant}
            className={cn(showClose ? "pr-10" : undefined, action ? "flex-col gap-2 !items-stretch" : undefined)}
            duration={duration}
            {...props}
          >
            {action ? (
              <>
                <div className="flex w-full min-w-0 gap-3">
                  {icon}
                  {textBlock}
                </div>
                {/** Строка действий под текстом: не сжимает заголовок узкой колонкой (раньше action был справа в одном flex-ряду). */}
                <div className="flex w-full min-w-0 flex-wrap gap-2 pl-8">{action}</div>
              </>
            ) : (
              <>
                {icon}
                {textBlock}
              </>
            )}
            {showClose ? <ToastClose /> : null}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
