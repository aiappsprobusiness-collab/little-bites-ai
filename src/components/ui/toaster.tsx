import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

function toastShowsClose(
  variant: "default" | "destructive" | null | undefined,
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

        return (
          <Toast key={id} variant={variant} className={showClose ? "pr-10" : undefined} duration={duration} {...props}>
            {isDestructive ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive-foreground" strokeWidth={1.75} aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-foreground opacity-95" strokeWidth={1.75} aria-hidden />
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action ? <span className="inline-flex shrink-0 self-center">{action}</span> : null}
            {showClose ? <ToastClose /> : null}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
