import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type PaywallLegalConsentNoteProps = {
  className?: string;
};

/**
 * Короткая сноска под CTA оплаты в paywall (Unified + Legacy).
 * Ссылки — client-side navigation.
 */
export function PaywallLegalConsentNote({ className }: PaywallLegalConsentNoteProps) {
  return (
    <p className={cn("text-center text-muted-foreground leading-snug", className)}>
      Оплачивая подписку, вы соглашаетесь с{" "}
      <Link to="/terms" className="underline hover:text-foreground">
        условиями
      </Link>
      ,{" "}
      <Link to="/privacy" className="underline hover:text-foreground">
        конфиденциальностью
      </Link>{" "}
      и{" "}
      <Link to="/subscription/terms" className="underline hover:text-foreground">
        подпиской
      </Link>
      .
    </p>
  );
}
