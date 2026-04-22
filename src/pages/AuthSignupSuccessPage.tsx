import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * Экран успешной регистрации (форма отправлена без ошибки).
 * При уже активной сессии (например, без подтверждения email) сразу уводим в приложение через `/`.
 */
export default function AuthSignupSuccessPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center p-4 auth-page-bg">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" aria-hidden />
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center p-4 pt-8 pb-10 auth-page-bg">
      <div className="w-full max-w-md mx-auto">
        <Card className="backdrop-blur-xl rounded-[28px] bg-card/95 border border-border/40 shadow-card dark:bg-card/92 dark:border-white/10">
          <CardContent className="px-5 sm:px-6 py-6 space-y-4 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Регистрация успешна</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Проверьте почту и перейдите по ссылке, чтобы подтвердить аккаунт. После подтверждения можно войти в приложение.
            </p>
            <Button asChild className="w-full rounded-[20px] min-h-[48px]">
              <Link to="/auth">На страницу входа</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
