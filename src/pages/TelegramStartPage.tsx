import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { trackUsageEvent, captureAttributionFromLocationOnce } from "@/utils/usageEvents";
import { trackVkAuthSuccessOnce } from "@/utils/vkAuthAnalytics";
import { LEGAL_TERMS_VERSION } from "@/constants/legalVersions";
import { AUTH_SIGNUP_SUCCESS_PATH } from "@/constants/authSignupSuccess";

/** Упрощённый signup после Telegram-бота: без имени, тот же бэкенд, что `/auth`. */
const liteSignupSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
  acceptLegal: z.boolean().refine((v) => v === true, {
    message:
      "Чтобы продолжить, примите Пользовательское соглашение и Политику конфиденциальности.",
  }),
});

type LiteSignupFormData = z.infer<typeof liteSignupSchema>;

const AUTH_INPUT_CLASS =
  "rounded-[24px] border border-slate-200/80 bg-white/50 py-4 min-h-[52px] text-foreground placeholder:text-muted-foreground/90 focus-visible:ring-0 focus-visible:border-primary shadow-none dark:border-white/10 dark:bg-[#1f2028]/90 dark:placeholder:text-[#8f92a3]";

export default function TelegramStartPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const signupEmailRef = useRef<HTMLInputElement>(null);
  const signupPasswordRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const authLoginHref = useMemo(() => {
    const p = new URLSearchParams(location.search);
    p.delete("mode");
    p.delete("tab");
    const q = p.toString();
    return q ? `/auth?${q}` : "/auth";
  }, [location.search]);

  useEffect(() => {
    trackUsageEvent("tg_start_page_view");
  }, []);

  useEffect(() => {
    if (location.search) captureAttributionFromLocationOnce();
  }, [location.search]);

  const form = useForm<LiteSignupFormData>({
    resolver: zodResolver(liteSignupSchema),
    defaultValues: { email: "", password: "", acceptLegal: false },
  });

  const onSubmit = async (data: LiteSignupFormData) => {
    setIsLoading(true);
    trackUsageEvent("cta_start_click");
    trackUsageEvent("auth_start");
    try {
      const { error } = await signUp(data.email, data.password, undefined, {
        acceptedTermsVersion: data.acceptLegal ? LEGAL_TERMS_VERSION : undefined,
      });
      if (error) {
        trackUsageEvent("auth_error", { properties: { message: error.message } });
        toast({ variant: "destructive", title: "Ошибка регистрации", description: error.message });
      } else {
        trackUsageEvent("auth_success");
        trackVkAuthSuccessOnce();
        toast({ title: "Регистрация успешна!", description: "Проверьте почту для подтверждения аккаунта" });
        navigate(AUTH_SIGNUP_SUCCESS_PATH, { replace: true });
      }
    } catch (err) {
      trackUsageEvent("auth_error", {
        properties: { message: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" },
      });
      toast({
        variant: "destructive",
        title: "Ошибка регистрации",
        description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center bg-splash">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center sm:justify-start p-4 pt-5 sm:p-5 sm:pt-8 pb-8 sm:pb-14 auth-page-bg">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-3 sm:mb-4 px-2 space-y-2"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">MomRecipes 🌿</h1>
          <p className="text-base sm:text-lg font-medium text-foreground/90 leading-snug text-balance">
            Продолжим?
          </p>
          <p className="text-sm text-muted-foreground leading-snug text-balance max-w-sm mx-auto">
            Сохрани меню из бота в приложении — подберём новые блюда с учётом твоих ответов в Telegram.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <Card className="backdrop-blur-xl rounded-[28px] sm:rounded-[32px] bg-card/95 text-card-foreground border border-border/40 shadow-card dark:bg-card/92 dark:border-white/10 dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]">
            <CardContent className="px-4 sm:px-6 pt-5 sm:pt-6 pb-5 sm:pb-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => {
                      const { ref: fieldRef, ...rest } = field;
                      return (
                        <FormItem>
                          <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Введите ваш email"
                              className={AUTH_INPUT_CLASS}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  signupPasswordRef.current?.focus();
                                }
                              }}
                              ref={(el) => {
                                fieldRef(el);
                                signupEmailRef.current = el;
                              }}
                              {...rest}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => {
                      const { ref: fieldRef, ...rest } = field;
                      return (
                        <FormItem>
                          <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Пароль</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Придумайте пароль"
                                className={cn(AUTH_INPUT_CLASS, "pr-12")}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    form.handleSubmit(onSubmit)();
                                  }
                                }}
                                ref={(el) => {
                                  fieldRef(el);
                                  signupPasswordRef.current = el;
                                }}
                                {...rest}
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
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="acceptLegal"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            className="mt-0.5 dark:border-[#717488] dark:data-[state=checked]:border-primary"
                          />
                        </FormControl>
                        <div className="space-y-1.5 leading-snug">
                          <FormLabel className="text-xs font-normal text-muted-foreground cursor-pointer !block dark:text-[#9ca0af]">
                            Принимаю{" "}
                            <Link
                              to="/terms"
                              className="text-primary/90 underline underline-offset-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              условия
                            </Link>
                            {" и "}
                            <Link
                              to="/privacy"
                              className="text-primary/90 underline underline-offset-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              конфиденциальность
                            </Link>
                          </FormLabel>
                          <FormMessage className="!mt-0 text-[13px] font-normal !text-muted-foreground dark:!text-[#c6a2a2]" />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full rounded-[24px] h-14 px-6 py-6 text-white font-semibold tracking-wide flex items-center justify-center gap-2 shadow-soft hover:opacity-95 active:scale-[0.99] transition-all duration-200 bg-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                    <span>Получить доступ</span>
                  </Button>
                </form>
              </Form>

              <p className="text-center text-sm text-muted-foreground mt-4 dark:text-[#9ca0af]">
                <Link to={authLoginHref} className="underline underline-offset-4 hover:text-foreground dark:hover:text-white">
                  Уже есть аккаунт — войти
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
