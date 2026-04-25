import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { trackUsageEvent, captureAttributionFromLocationOnce } from "@/utils/usageEvents";
import { trackVkAuthSuccessOnce } from "@/utils/vkAuthAnalytics";
import { HAS_SEEN_WELCOME_KEY } from "@/utils/navigation";
import { LEGAL_TERMS_VERSION } from "@/constants/legalVersions";
import { AUTH_SIGNUP_SUCCESS_PATH } from "@/constants/authSignupSuccess";

const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Введите корректный email"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

const signupSchema = z.object({
  displayName: z.string().min(2, "Имя должно быть минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
  acceptLegal: z.boolean().refine((v) => v === true, {
    message:
      "Чтобы продолжить, примите Пользовательское соглашение и Политику конфиденциальности.",
  }),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

const AUTH_INPUT_CLASS =
  "rounded-[24px] border border-slate-200/80 bg-white/50 py-4 min-h-[52px] text-foreground placeholder:text-muted-foreground/90 focus-visible:ring-0 focus-visible:border-primary shadow-none dark:border-white/10 dark:bg-[#1f2028]/90 dark:placeholder:text-[#8f92a3]";

export default function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordFieldError, setForgotPasswordFieldError] = useState<string | null>(null);
  const signupEmailRef = useRef<HTMLInputElement>(null);
  const signupPasswordRef = useRef<HTMLInputElement>(null);
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const modeSignup = searchParams.get("mode") === "signup" || searchParams.get("tab") === "signup";
  const stateSignup = (location.state as { tab?: string } | null)?.tab === "signup";
  const defaultAuthTab = modeSignup || stateSignup ? "signup" : "login";

  useEffect(() => {
    trackUsageEvent("auth_page_view");
  }, []);

  useEffect(() => {
    if (location.search) captureAttributionFromLocationOnce();
  }, [location.search]);

  useEffect(() => {
    const st = location.state as { fromRootFirstVisit?: boolean; message?: string; tab?: string } | null;
    if (!st?.fromRootFirstVisit) return;
    try {
      localStorage.setItem(HAS_SEEN_WELCOME_KEY, "true");
    } catch {
      // ignore
    }
    const { fromRootFirstVisit: _root, ...rest } = st;
    if (Object.keys(rest).length > 0) {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: rest }
      );
    } else {
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true });
    }
  }, [location.state, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const message = (location.state as { message?: string } | null)?.message;
    if (message) {
      toast({ variant: "destructive", title: message });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, toast]);

  const goToWelcome = () => {
    navigate("/welcome", { replace: true });
  };

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", email: "", password: "", acceptLegal: false },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const openForgotPassword = useCallback(() => {
    setForgotPasswordSent(false);
    setForgotPasswordFieldError(null);
    forgotPasswordForm.reset({ email: loginForm.getValues("email")?.trim() || "" });
    setForgotPasswordOpen(true);
  }, [forgotPasswordForm, loginForm]);

  const onForgotPasswordOpenChange = (open: boolean) => {
    setForgotPasswordOpen(open);
    if (!open) {
      setForgotPasswordSent(false);
      setForgotPasswordFieldError(null);
      forgotPasswordForm.reset({ email: "" });
    }
  };

  const onForgotPasswordSubmit = async (data: ForgotPasswordFormData) => {
    setForgotPasswordLoading(true);
    setForgotPasswordFieldError(null);
    trackUsageEvent("auth_password_reset_request");
    try {
      const { error } = await requestPasswordReset(data.email);
      if (error) {
        setForgotPasswordFieldError(error.message);
      } else {
        setForgotPasswordSent(true);
      }
    } catch (e) {
      setForgotPasswordFieldError(e instanceof Error ? e.message : "Не удалось отправить письмо");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    trackUsageEvent("auth_start");
    try {
      const { error } = await signIn(data.email, data.password);
      setIsLoading(false);
      if (error) {
        trackUsageEvent("auth_error", { properties: { message: error.message } });
        toast({ variant: "destructive", title: "Ошибка входа", description: error.message || "Не удалось войти. Проверьте email и пароль." });
      } else {
        trackUsageEvent("auth_success");
        trackVkAuthSuccessOnce();
        navigate("/");
      }
    } catch (err) {
      setIsLoading(false);
      trackUsageEvent("auth_error", { properties: { message: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" } });
      toast({ variant: "destructive", title: "Ошибка входа", description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" });
    }
  };

  const onSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    trackUsageEvent("cta_start_click");
    trackUsageEvent("auth_start");
    try {
      const { error } = await signUp(data.email, data.password, data.displayName, {
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
      trackUsageEvent("auth_error", { properties: { message: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" } });
      toast({ variant: "destructive", title: "Ошибка регистрации", description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center sm:justify-start p-4 pt-5 sm:p-5 sm:pt-8 pb-8 sm:pb-14 auth-page-bg">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        {/* Hero: бренд + одна строка ценности (без маркетинговых абзацев) */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-3 sm:mb-4 px-2 space-y-1"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            MomRecipes 🌿
          </h1>
          <p className="text-base sm:text-lg font-medium text-foreground/90 leading-snug text-balance">
            Меню для ребёнка — за 1 минуту
          </p>
        </motion.div>

        {/* Карточка формы */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <Card className="backdrop-blur-xl rounded-[28px] sm:rounded-[32px] bg-card/95 text-card-foreground border border-border/40 shadow-card dark:bg-card/92 dark:border-white/10 dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]">
            <CardContent className="px-4 sm:px-6 pt-5 sm:pt-6 pb-5 sm:pb-6">
              <Tabs key={defaultAuthTab} defaultValue={defaultAuthTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-5 rounded-[20px] bg-slate-100/80 p-1 h-11 dark:bg-[#353742]">
                  <TabsTrigger
                    value="login"
                    className="rounded-[16px] text-[#8b8e9d] dark:text-[#a3a6b4] dark:data-[state=active]:bg-[#1d1e27] dark:data-[state=active]:text-white dark:data-[state=active]:shadow-none"
                  >
                    Войти
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="rounded-[16px] text-[#8b8e9d] dark:text-[#a3a6b4] dark:data-[state=active]:bg-[#1d1e27] dark:data-[state=active]:text-white dark:data-[state=active]:shadow-none"
                  >
                    Регистрация
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Введите ваш email" className={AUTH_INPUT_CLASS} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Пароль</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Введите пароль"
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
                            <button
                              type="button"
                              onClick={openForgotPassword}
                              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-left pt-0.5 dark:text-[#9ca0af] dark:hover:text-white"
                            >
                              Забыли пароль?
                            </button>
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full rounded-[24px] h-14 px-6 py-6 text-white font-semibold tracking-wide flex items-center justify-center gap-2 shadow-soft hover:opacity-95 active:scale-[0.99] transition-all duration-200 bg-primary"
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                        <span>Продолжить</span>
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="signup">
                  <Form {...signupForm}>
                    <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-5">
                      <FormField
                        control={signupForm.control}
                        name="displayName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal dark:text-[#b1b4c2]">Как к вам обращаться?</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Например, Мария"
                                className={AUTH_INPUT_CLASS}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    signupEmailRef.current?.focus();
                                  }
                                }}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
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
                        control={signupForm.control}
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
                                        signupForm.handleSubmit(onSignup)();
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
                        control={signupForm.control}
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
                              <FormLabel className="text-sm font-normal text-foreground cursor-pointer !block">
                                Я принимаю{" "}
                                <Link
                                  to="/terms"
                                  className="text-primary underline underline-offset-2 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Пользовательское соглашение
                                </Link>
                                {" "}и{" "}
                                <Link
                                  to="/privacy"
                                  className="text-primary underline underline-offset-2 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Политику конфиденциальности
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
                        <span>Продолжить</span>
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
              <p className="text-center mt-4">
                <button
                  type="button"
                  onClick={goToWelcome}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 dark:text-[#a7abba] dark:hover:text-white"
                >
                  Посмотреть пример рецепта
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={onForgotPasswordOpenChange}>
        <DialogContent className="sm:max-w-md rounded-[24px] border-border shadow-xl">
          <DialogHeader>
            <DialogTitle>Восстановление пароля</DialogTitle>
            <DialogDescription>
              {forgotPasswordSent
                ? "Мы отправили ссылку на ваш email. Откройте письмо и перейдите по ссылке, чтобы задать новый пароль."
                : "Укажите email аккаунта — мы отправим ссылку для сброса пароля."}
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordSent ? (
            <DialogFooter className="sm:justify-stretch gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-[20px] border-border bg-muted/40 text-foreground hover:bg-muted hover:text-foreground dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
                onClick={() => onForgotPasswordOpenChange(false)}
              >
                Закрыть
              </Button>
            </DialogFooter>
          ) : (
            <Form {...forgotPasswordForm}>
              <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)} className="space-y-4">
                <FormField
                  control={forgotPasswordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/90 font-medium">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Ваш email"
                          className={cn(
                            AUTH_INPUT_CLASS,
                            "text-foreground placeholder:text-muted-foreground dark:bg-[#1f2028] dark:border-white/12 dark:text-foreground",
                          )}
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      {forgotPasswordFieldError ? (
                        <p className="text-sm font-medium text-destructive" role="alert">
                          {forgotPasswordFieldError}
                        </p>
                      ) : null}
                    </FormItem>
                  )}
                />
                <DialogFooter className="gap-2 sm:justify-stretch flex-col sm:flex-col">
                  <Button
                    type="submit"
                    className="w-full rounded-[20px] h-12 bg-primary text-primary-foreground"
                    disabled={forgotPasswordLoading}
                  >
                    {forgotPasswordLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                    Отправить ссылку
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
