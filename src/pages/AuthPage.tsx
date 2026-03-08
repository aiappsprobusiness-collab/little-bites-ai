import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { trackUsageEvent, hasShareRecipeAttribution } from "@/utils/usageEvents";
import { trackLandingEvent } from "@/utils/landingAnalytics";

const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
});

const signupSchema = z.object({
  displayName: z.string().min(2, "Имя должно быть минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

const AUTH_INPUT_CLASS =
  "rounded-[24px] border border-slate-200/80 bg-white/50 py-4 focus-visible:ring-0 focus-visible:border-primary shadow-none min-h-[52px]";

export default function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultAuthTab = (location.state as { tab?: string } | null)?.tab === "signup" ? "signup" : "login";

  useEffect(() => {
    trackUsageEvent("auth_page_view");
  }, []);

  const goToWelcome = () => {
    if (hasShareRecipeAttribution()) {
      trackLandingEvent("share_recipe_cta_click");
      navigate("/welcome?source=share_recipe", { replace: true });
      return;
    }
    navigate("/welcome", { replace: true });
  };

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });

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
      const { error } = await signUp(data.email, data.password, data.displayName);
      if (error) {
        trackUsageEvent("auth_error", { properties: { message: error.message } });
        toast({ variant: "destructive", title: "Ошибка регистрации", description: error.message });
      } else {
        trackUsageEvent("auth_success");
        toast({ title: "Регистрация успешна!", description: "Проверьте почту для подтверждения аккаунта" });
      }
    } catch (err) {
      trackUsageEvent("auth_error", { properties: { message: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" } });
      toast({ variant: "destructive", title: "Ошибка регистрации", description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen min-h-dvh flex flex-col items-center justify-center sm:justify-start p-4 pt-5 sm:p-5 sm:pt-8 pb-8 sm:pb-14"
      style={{
        background: "radial-gradient(ellipse 80% 70% at 50% 0%, #F8F9FA 0%, #F3F6EC 100%)",
      }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        {/* Hero — заголовок и подзаголовок */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4 sm:mb-6 px-2"
        >
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-tight text-foreground mb-3">
            MomRecipes 🌿
          </h1>
          <p className="text-base sm:text-lg font-medium text-foreground/90 leading-snug mb-1.5">
            Меню на сегодня за 1 минуту
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Учитываем возраст, аллергии и продукты,
            <br />
            которые ребёнок любит или не ест.
          </p>
        </motion.div>

        {/* Карточка формы */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <Card className="bg-white/90 backdrop-blur-xl border-0 rounded-[28px] sm:rounded-[32px] shadow-xl shadow-slate-200/50">
            <CardContent className="px-4 sm:px-6 pt-6 sm:pt-7 pb-5 sm:pb-6">
              <Tabs defaultValue={defaultAuthTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 rounded-[20px] bg-slate-100/80 p-1 h-11">
                  <TabsTrigger value="login" className="rounded-[16px]">Вход</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-[16px]">Создать аккаунт</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal">Email</FormLabel>
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
                            <FormLabel className="text-muted-foreground font-normal">Пароль</FormLabel>
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
                                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation"
                                >
                                  {showPassword ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
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
                            <FormLabel className="text-muted-foreground font-normal">Как к вам обращаться?</FormLabel>
                            <FormControl>
                              <Input placeholder="Например, Мария" className={AUTH_INPUT_CLASS} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal">Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Введите ваш email" className={AUTH_INPUT_CLASS} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal">Пароль</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Придумайте пароль (от 6 символов)"
                                  className={cn(AUTH_INPUT_CLASS, "pr-12")}
                                  {...field}
                                />
                                <button
                                  type="button"
                                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation"
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
                        control={signupForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-muted-foreground font-normal">Повторите пароль</FormLabel>
                            <FormControl>
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Введите пароль ещё раз"
                                className={AUTH_INPUT_CLASS}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full rounded-[24px] h-14 px-6 py-6 font-semibold tracking-wide flex items-center justify-center gap-2 border-2 border-primary-border bg-transparent text-primary hover:bg-primary-light hover:border-primary active:scale-[0.99] transition-all duration-200"
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                        <span>Начать и собрать меню</span>
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
              <p className="text-center mt-4">
                <button
                  type="button"
                  onClick={goToWelcome}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Попробовать пример без регистрации
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
