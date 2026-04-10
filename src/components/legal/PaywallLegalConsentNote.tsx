import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type PaywallLegalConsentNoteProps = {
  className?: string;
  /** `readableLight` — ссылки чуть темнее основного текста в светлой теме. */
  tone?: "default" | "readableLight";
};

/**
 * Короткая сноска под CTA оплаты в paywall (Unified + Legacy).
 * Ссылки — client-side navigation.
 */
export function PaywallLegalConsentNote({ className, tone = "default" }: PaywallLegalConsentNoteProps) {
  const readable = tone === "readableLight";
  const baseLight = "text-gray-500 dark:text-muted-foreground";
  const linkLight = readable
    ? "text-gray-600 hover:text-gray-800 dark:text-foreground/90 dark:hover:text-foreground"
    : "text-gray-600 hover:text-gray-800 dark:hover:text-foreground";
  return (
    <p className={cn("text-center leading-snug", baseLight, className)}>
      Оплачивая подписку, вы соглашаетесь с{" "}
      <Link to="/terms" className={cn("underline underline-offset-2", linkLight)}>
        условиями
      </Link>
      ,{" "}
      <Link to="/privacy" className={cn("underline underline-offset-2", linkLight)}>
        конфиденциальностью
      </Link>{" "}
      и{" "}
      <Link to="/subscription/terms" className={cn("underline underline-offset-2", linkLight)}>
        подпиской
      </Link>
      .
    </p>
  );
}
