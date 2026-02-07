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
  "rounded-[24px] border border-slate-200/80 bg-white/50 py-4 focus-visible:ring-0 focus-visible:border-primary shadow-none min-h-[52px]";

const VALUE_CARDS = [
  { icon: "🧸", title: "Для всей семьи", text: "Рецепты, которые объединяют за столом" },
  { icon: "✨", title: "Здоровье и энергия", text: "Сбалансированное питание без перегруза" },
  { icon: "🆘", title: "Помощь 24/7", text: "Ответы, когда ребёнку тревожно или плохо" },
];

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
    try {
      const { error } = await signUp(data.email, data.password, data.displayName);
      if (error) {
        toast({ variant: "destructive", title: "Ошибка регистрации", description: error.message });
      } else {
        toast({ title: "Регистрация успешна!", description: "Проверьте почту для подтверждения аккаунта" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Ошибка регистрации", description: err instanceof Error ? err.message : "Произошла непредвиденная ошибка" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center sm:justify-start p-4 pt-5 sm:p-5 sm:pt-8 pb-8 sm:pb-14"
      style={{
        background: "radial-gradient(ellipse 80% 70% at 50% 0%, #F8F9FA 0%, #F1F5E9 100%)",
      }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        {/* Hero — бренд, польза, слоган */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4 sm:mb-6 px-2"
        >
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-tight text-foreground mb-3">
            MomRecipes 🌿
          </h1>
          <p className="text-base sm:text-lg font-medium text-foreground/90 leading-snug mb-1.5">
            Умное питание для детей и всей семьи
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            От первого прикорма до семейных ужинов без стресса
          </p>
        </motion.div>

        {/* Карточки ценностей — мини-карточки с иконкой сверху */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full space-y-3 sm:space-y-4 mb-5 sm:mb-6"
        >
          {VALUE_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.05 }}
              className="rounded-2xl bg-emerald-50/80 border border-emerald-100/80 px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm"
            >
              <div className="flex flex-row items-start gap-3">
                <span className="text-2xl sm:text-3xl leading-none shrink-0">{card.icon}</span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-snug">{card.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.text}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Карточка формы — с тенью и мягкими углами */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <Card className="bg-white/90 backdrop-blur-xl border-0 rounded-[28px] sm:rounded-[32px] shadow-xl shadow-slate-200/50">
            <CardHeader className="text-center pb-5 sm:pb-6 px-4 sm:px-6 pt-6 sm:pt-7">
              <CardTitle className="text-lg sm:text-xl font-semibold text-foreground/95">Начните заботиться о питании уже сегодня</CardTitle>
              <CardDescription className="text-muted-foreground mt-1.5">Войдите или создайте аккаунт за 1 минуту</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pt-0 pb-5 sm:pb-6">
              <Tabs defaultValue="login" className="w-full">
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
                        className="w-full rounded-[24px] h-14 px-6 py-6 text-white font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 hover:shadow-xl hover:shadow-emerald-900/30 hover:brightness-105 active:scale-[0.99] transition-all duration-200"
                        style={{ background: "linear-gradient(135deg, #6B8E23 0%, #8FBC4C 100%)" }}
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
                        className="w-full rounded-[24px] h-14 px-6 py-6 font-semibold tracking-wide flex items-center justify-center gap-2 border-2 border-emerald-200 bg-transparent text-emerald-800 hover:bg-emerald-50 hover:border-emerald-300 active:scale-[0.99] transition-all duration-200"
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                        <span>Создать аккаунт</span>
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
