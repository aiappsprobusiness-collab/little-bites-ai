import { useAuth } from "@/hooks/useAuth";
import {
  FIRST_CHILD_WELCOME_BODY,
  getFirstChildWelcomeHeadline,
} from "@/utils/firstChildWelcomeCopy";

export function FirstChildWelcomeBanner() {
  const { user } = useAuth();

  return (
    <div
      className="rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-3 text-sm leading-snug text-foreground"
      role="status"
    >
      <p className="font-semibold text-foreground">{getFirstChildWelcomeHeadline(user)}</p>
      <p className="mt-1 text-muted-foreground">{FIRST_CHILD_WELCOME_BODY}</p>
    </div>
  );
}
