import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setActiveSessionKeyForUser } from "@/utils/activeSessionKey";
import { PROFILE_FIRST_CHILD_ONBOARDING } from "@/utils/firstChildOnboarding";
import { isRecoveryJwtSession, setRecoveryPendingFlag } from "@/utils/authRecoverySession";

const POLL_INTERVAL_MS = 300;
const MAX_WAIT_MS = 5000;
const FALLBACK_REDIRECT_DELAY_MS = 2000;

function hasAuthParams(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const params = new URLSearchParams(window.location.search);
  return (
    /access_token|refresh_token|type=recovery/.test(hash) ||
    params.has("access_token") ||
    params.has("refresh_token") ||
    params.has("code")
  );
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /** До await: hash ещё может быть целым. После getSession Supabase часто уже очистил URL — нельзя полагаться только на type=recovery в строке. */
    const recoveryHintFromUrl =
      typeof window !== "undefined" &&
      (/type=recovery/.test(window.location.hash || "") ||
        new URLSearchParams(window.location.search).get("type") === "recovery");

    const run = async () => {
      const start = Date.now();

      const getSession = () => supabase.auth.getSession().then(({ data }) => data.session);

      let session = await getSession();

      while (!session && !cancelled && Date.now() - start < MAX_WAIT_MS) {
        if (hasAuthParams()) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          session = await getSession();
        } else {
          break;
        }
      }

      if (cancelled) return;

      if (!session) {
        setFallback(true);
        const timer = setTimeout(() => {
          navigate("/auth", {
            replace: true,
            state: { message: "Не удалось подтвердить вход. Попробуйте ещё раз." },
          });
        }, FALLBACK_REDIRECT_DELAY_MS);
        return () => clearTimeout(timer);
      }

      /** Сброс пароля: JWT amr recovery и/или type=recovery в URL (если hash ещё не снят). */
      const isPasswordRecovery =
        isRecoveryJwtSession(session) || recoveryHintFromUrl;

      // Очищаем URL от токенов
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.hash = "";
        url.search = "";
        window.history.replaceState({}, "", url.pathname);
      }

      const userId = session.user.id;
      await setActiveSessionKeyForUser(userId);

      if (cancelled) return;

      if (isPasswordRecovery) {
        setRecoveryPendingFlag(true);
        navigate("/auth/reset-password", { replace: true });
        return;
      }

      const { count, error } = await supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (cancelled) return;

      if (error) {
        navigate("/meal-plan", { replace: true });
        return;
      }

      if (count === 0) {
        navigate(PROFILE_FIRST_CHILD_ONBOARDING, { replace: true });
      } else {
        navigate("/meal-plan", { replace: true });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (fallback) {
    return (
      <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center auth-page-bg px-4">
        <p className="text-muted-foreground text-center mb-2">
          Не удалось подтвердить вход. Попробуйте ещё раз.
        </p>
        <p className="text-sm text-muted-foreground">Перенаправление на страницу входа…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center auth-page-bg px-4">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">Подтверждаем вход...</p>
    </div>
  );
}
