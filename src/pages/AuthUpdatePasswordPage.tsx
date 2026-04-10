import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { trackUsageEvent } from "@/utils/usageEvents";

const schema = z
  .object({
    password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
    confirmPassword: z.string().min(6, "Пароль должен быть минимум 6 символов"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

const AUTH_INPUT_CLASS =
  "rounded-[24px] border border-slate-200/80 bg-white/50 py-4 min-h-[52px] text-foreground placeholder:text-muted-foreground/90 focus-visible:ring-0 focus-visible:border-primary shadow-none dark:border-white/10 dark:bg-[#1f2028]/90 dark:placeholder:text-[#8f92a3]";

/**
 * Публичный экран: новый пароль после перехода по ссылке из письма (recovery session).
 */
export default function AuthUpdatePasswordPage() {
  const { user, loading, authReady, updatePassword, isRecoverySession } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!authReady || loading) return;
    if (!user) {
      navigate("/auth", { replace: true, state: { message: "Ссылка недействительна или сессия истекла. Запросите новое письмо." } });
      return;
    }
    if (!isRecoverySession) {
      navigate("/", { replace: true });
    }
  }, [authReady, loading, user, isRecoverySession, navigate]);

  const onSubmit = async (data: FormData) => {
    trackUsageEvent("auth_password_reset_submit");
    const { error } = await updatePassword(data.password);
    if (error) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить пароль",
        description: error.message,
      });
      return;
    }
    trackUsageEvent("auth_password_reset_success");
    toast({ title: "Пароль обновлён", description: "Теперь можно пользоваться приложением." });
    navigate("/", { replace: true });
  };

  if (!authReady || loading || (user && !isRecoverySession)) {
    return (
      <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center auth-page-bg px-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center sm:justify-start p-4 pt-5 sm:p-5 sm:pt-8 pb-8 sm:pb-14 auth-page-bg">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4 sm:mb-6 px-2"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-2">
            Установите новый пароль
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Придумайте новый пароль для входа в аккаунт.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full"
        >
          <Card className="backdrop-blur-xl rounded-[28px] sm:rounded-[32px] bg-card/95 text-card-foreground border border-border/40 shadow-card dark:bg-card/92 dark:border-white/10 dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]">
            <CardContent className="px-4 sm:px-6 pt-6 sm:pt-7 pb-5 sm:pb-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Новый пароль</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              autoComplete="new-password"
                              placeholder="Минимум 6 символов"
                              className={cn(AUTH_INPUT_CLASS, "pr-12")}
                              {...field}
                            />
                            <button
                              type="button"
                              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation dark:text-[#9ca0af] dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Повторите пароль</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword2 ? "text" : "password"}
                              autoComplete="new-password"
                              placeholder="Ещё раз"
                              className={cn(AUTH_INPUT_CLASS, "pr-12")}
                              {...field}
                            />
                            <button
                              type="button"
                              aria-label={showPassword2 ? "Скрыть пароль" : "Показать пароль"}
                              onClick={() => setShowPassword2(!showPassword2)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation dark:text-[#9ca0af] dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              {showPassword2 ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full rounded-[24px] h-14 px-6 py-6 text-white font-semibold tracking-wide flex items-center justify-center gap-2 shadow-soft hover:opacity-95 active:scale-[0.99] transition-all duration-200 bg-primary"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                    <span>{form.formState.isSubmitting ? "Обновление пароля…" : "Сохранить пароль"}</span>
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
