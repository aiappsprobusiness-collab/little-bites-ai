import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type PaywallLegalConsentNoteProps = {
  className?: string;
  /** Светлая тема: контрастнее текст (gray-700+), тёмная без изменений. */
  tone?: "default" | "readableLight";
};

/**
 * Короткая сноска под CTA оплаты в paywall (Unified + Legacy).
 * Ссылки — client-side navigation.
 */
export function PaywallLegalConsentNote({ className, tone = "default" }: PaywallLegalConsentNoteProps) {
  const readable = tone === "readableLight";
  return (
    <p
      className={cn(
        "text-center leading-snug",
        readable
          ? "text-gray-700 dark:text-muted-foreground"
          : "text-muted-foreground",
        className,
      )}
    >
      Оплачивая подписку, вы соглашаетесь с{" "}
      <Link
        to="/terms"
        className={cn(
          "underline",
          readable
            ? "text-gray-800 hover:text-gray-950 dark:text-foreground/90 dark:hover:text-foreground"
            : "hover:text-foreground",
        )}
      >
        условиями
      </Link>
      ,{" "}
      <Link
        to="/privacy"
        className={cn(
          "underline",
          readable
            ? "text-gray-800 hover:text-gray-950 dark:text-foreground/90 dark:hover:text-foreground"
            : "hover:text-foreground",
        )}
      >
        конфиденциальностью
      </Link>{" "}
      и{" "}
      <Link
        to="/subscription/terms"
        className={cn(
          "underline",
          readable
            ? "text-gray-800 hover:text-gray-950 dark:text-foreground/90 dark:hover:text-foreground"
            : "hover:text-foreground",
        )}
      >
        подпиской
      </Link>
      .
    </p>
  );
}
