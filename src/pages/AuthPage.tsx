import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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
  "rounded-[16px] border border-slate-200/80 bg-white/50 py-4 focus-visible:ring-0 focus-visible:border-primary shadow-none min-h-[52px]";

export default function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

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
    try {
      const { error } = await signIn(data.email, data.password);
      setIsLoading(false);
      if (error) {
        toast({ variant: "destructive", title: "Ошибка входа", description: error.message || "Не удалось войти. Проверьте email и пароль." });
      } else {
        navigate("/");
      }
    } catch (err) {
      setIsLoading(false);
      toast({ variant: "destructive", title: "Ошибка входа", description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" });
    }
  };

  const onSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const { error } = await signUp(data.email, data.password, data.displayName);
    setIsLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Ошибка регистрации", description: error.message });
    } else {
      toast({ title: "Регистрация успешна!", description: "Проверьте почту для подтверждения аккаунта" });
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center sm:justify-start p-3 pt-4 sm:p-4 sm:pt-6 pb-6 sm:pb-12"
      style={{
        background: "radial-gradient(ellipse 80% 70% at 50% 0%, #F8F9FA 0%, #F1F5E9 100%)",
      }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        {/* Заголовок Hero — более значимый */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-2 sm:mb-4"
        >
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-widest text-foreground">Mom Recipes</h1>
        </motion.div>

        {/* Подзаголовок — слоган в два ряда */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-center mb-4 sm:mb-6 px-2"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            От первого прикорма до изысканного ужина.
            <br />
            Умное планирование рациона для здоровья, красоты и спокойствия.
          </p>
        </motion.div>

        {/* Блок преимуществ — отцентрован, компактный */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full space-y-2 sm:space-y-3 mb-4 sm:mb-5 text-center"
        >
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2 leading-relaxed">
            <span>👪</span> Семейный уют: Рецепты, которые объединяют за столом.
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2 leading-relaxed">
            <span>✨</span> Красота и Здоровье: Сбалансированное меню для вашей энергии.
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2 leading-relaxed">
            <span>🆘</span> Поддержка 24/7: Быстрые ответы на любые вопросы о питании.
          </p>
        </motion.div>

        {/* Карточка формы — визуально единое целое с блоком выше */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
        <Card className="bg-white/80 backdrop-blur-xl border-0 rounded-[40px] shadow-lg">
          <CardHeader className="text-center pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-lg">Добро пожаловать</CardTitle>
            <CardDescription>Войдите или создайте аккаунт</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-5 sm:pb-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 rounded-full bg-slate-100/80 p-1">
                <TabsTrigger value="login" className="rounded-full">Вход</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-full">Регистрация</TabsTrigger>
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
                            <Input placeholder="mail@example.com" className={AUTH_INPUT_CLASS} {...field} />
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
                                placeholder="••••••"
                                className={AUTH_INPUT_CLASS}
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full rounded-full h-12 text-white font-medium uppercase tracking-wider flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #6B8E23 0%, #8FBC4C 100%)" }}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                      <span>Войти</span>
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
                          <FormLabel className="text-muted-foreground font-normal">Ваше имя</FormLabel>
                          <FormControl>
                            <Input placeholder="Мария" className={AUTH_INPUT_CLASS} {...field} />
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
                            <Input type="email" placeholder="mail@example.com" className={AUTH_INPUT_CLASS} {...field} />
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
                                placeholder="••••••"
                                className={AUTH_INPUT_CLASS}
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                              placeholder="••••••"
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
                      className="w-full rounded-full h-12 text-white font-medium uppercase tracking-wider flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #6B8E23 0%, #8FBC4C 100%)" }}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                      <span>Начать готовить с Mom Recipes</span>
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
      </div>
    </div>
  );
}
