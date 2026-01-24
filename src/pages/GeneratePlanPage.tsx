import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Calendar,
  ShoppingCart,
  Check,
  Loader2,
  ChevronRight,
  Apple,
  Dumbbell,
  Heart,
  Leaf,
  Brain,
  Beef,
  AlertCircle,
  Pencil,
  Download,
} from "lucide-react";
import { ChildCarousel } from "@/components/family/ChildCarousel";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useChildren } from "@/hooks/useChildren";
import { useRecipes } from "@/hooks/useRecipes";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MealEditDialog } from "@/components/meal-plan/MealEditDialog";
import { exportMealPlanToPDF } from "@/utils/pdfExport";
import { 
  DailyPlanGenerator, 
  type ChildData as GeneratorChildData,
  type GeneratedDay as GeneratorGeneratedDay,
  type GeneratedPlan as GeneratorGeneratedPlan,
  type GeneratedMeal as GeneratorGeneratedMeal
} from "@/services/DailyPlanGenerator";

// Цели питания
const dietGoals = [
  {
    id: "weight_gain",
    label: "Набор веса",
    description: "Калорийные и питательные блюда",
    icon: Dumbbell,
    color: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  },
  {
    id: "variety",
    label: "Разнообразие",
    description: "Новые вкусы и текстуры",
    icon: Apple,
    color: "bg-green-500/10 text-green-600 border-green-500/30",
  },
  {
    id: "iron",
    label: "Железо",
    description: "Богатые железом продукты",
    icon: Beef,
    color: "bg-red-500/10 text-red-600 border-red-500/30",
  },
  {
    id: "immunity",
    label: "Иммунитет",
    description: "Витамины и антиоксиданты",
    icon: Heart,
    color: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  },
  {
    id: "brain",
    label: "Мозг",
    description: "Омега-3 и полезные жиры",
    icon: Brain,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  },
  {
    id: "digestion",
    label: "Пищеварение",
    description: "Легкоусвояемые продукты",
    icon: Leaf,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
];

// Используем типы из DailyPlanGenerator для консистентности
type GeneratedIngredient = {
  name: string;
  amount: number;
  unit: string;
};

type GeneratedMeal = GeneratorGeneratedMeal;
type GeneratedDay = GeneratorGeneratedDay;
type GeneratedPlan = GeneratorGeneratedPlan;

export default function GeneratePlanPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedChild } = useSelectedChild();
  const { calculateAgeInMonths } = useChildren();
  const { createRecipe } = useRecipes(selectedChild?.id);
  const { createMealPlan } = useMealPlans(selectedChild?.id);
  const { createList, addItem, activeList } = useShoppingLists();

  const [step, setStep] = useState<"goals" | "generating" | "preview" | "saving">("goals");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentGeneratingDay, setCurrentGeneratingDay] = useState<string | null>(null);
  const [generatedDaysProgress, setGeneratedDaysProgress] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false); // Для UI состояния кнопки

  // Meal editing state
  const [editingMeal, setEditingMeal] = useState<{
    dayName: string;
    mealType: keyof GeneratedDay;
    meal: GeneratedMeal;
  } | null>(null);

  // Refs для сохранения состояния генерации
  const generationStateRef = useRef<{
    isGenerating: boolean;
    generatedDays: Record<string, GeneratedDay>;
    currentDayIndex: number;
    childData: any;
    goalsText: string;
    accessToken: string;
    step?: string;
    progress?: number;
    selectedGoals?: string[];
    generatedPlan?: GeneratedPlan;
  } | null>(null);
  
  // Флаг для предотвращения множественных продолжений генерации
  const isRestoringRef = useRef(false);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Флаг для отслеживания активной генерации
  const isGeneratingRef = useRef(false);
  // Ref для хранения текущего генератора (для отмены)
  const currentGeneratorRef = useRef<DailyPlanGenerator | null>(null);

  // Сохранение состояния в localStorage - ОТКЛЮЧЕНО
  const saveGenerationState = (state: typeof generationStateRef.current) => {
    // Функция сохранения состояния отключена
    // Состояние больше не сохраняется в localStorage
  };

  // Периодическое автосохранение во время генерации - ОТКЛЮЧЕНО
  const startAutoSave = useCallback(() => {
    // Автосохранение отключено для уменьшения нагрузки
    // Состояние сохраняется только в ключевых точках (начало, завершение дня, завершение генерации)
  }, []);

  const stopAutoSave = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
  }, []);

  // Загрузка состояния из localStorage
  const loadGenerationState = () => {
    try {
      const saved = localStorage.getItem('mealPlanGeneration');
      if (saved) {
        const state = JSON.parse(saved);
        // Проверяем, что состояние не старше 10 минут
        if (Date.now() - state.timestamp < 10 * 60 * 1000) {
          return state;
        } else {
          localStorage.removeItem('mealPlanGeneration');
        }
      }
    } catch (e) {
      console.error('Failed to load generation state:', e);
    }
    return null;
  };

  // Очистка сохраненного состояния
  const clearGenerationState = () => {
    // Отменяем текущую генерацию если есть
    if (currentGeneratorRef.current) {
      currentGeneratorRef.current.abort();
      currentGeneratorRef.current = null;
    }
    
    localStorage.removeItem('mealPlanGeneration');
    generationStateRef.current = null;
    isGeneratingRef.current = false;
    setIsGenerating(false);
    isRestoringRef.current = false;
    stopAutoSave();
    console.log('Cleared generation state');
  };

  // Автоматическое сохранение состояния при изменении step или progress - ОТКЛЮЧЕНО
  // Состояние сохраняется только в ключевых точках (начало, завершение дня, завершение генерации)
  useEffect(() => {
    // Обновляем только ref, но не сохраняем в localStorage автоматически
    if (step === "generating" && generationStateRef.current) {
      if (generationStateRef.current.step !== step || generationStateRef.current.progress !== progress) {
        generationStateRef.current.step = step;
        generationStateRef.current.progress = progress;
        // Автосохранение отключено - не сохраняем в localStorage
      }
    }
  }, [step, progress]);

  // Продолжение генерации с сохраненного места
  const continueGeneration = useCallback(async () => {
    // Предотвращаем множественные вызовы
    if (isRestoringRef.current || isGeneratingRef.current) {
      console.log('Generation already in progress, skipping...');
      return;
    }
    
    if (!generationStateRef.current) {
      console.log('No generation state to continue');
      return;
    }

              // Устанавливаем флаги
              isRestoringRef.current = true;
              isGeneratingRef.current = true;
              setIsGenerating(true);
              const state = generationStateRef.current;
    const daysOfWeek = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const generatedDays = { ...state.generatedDays };
    let currentIndex = state.currentDayIndex;

    setStep("generating");
    const initialProgress = Math.round((currentIndex / daysOfWeek.length) * 90);
    setProgress(initialProgress);

    // Обновляем состояние сразу после установки step
    if (generationStateRef.current) {
      generationStateRef.current.step = "generating";
      generationStateRef.current.progress = initialProgress;
      saveGenerationState(generationStateRef.current);
    }

    try {
      // Отменяем предыдущую генерацию если есть
      if (currentGeneratorRef.current) {
        currentGeneratorRef.current.abort();
      }
      
      const generator = new DailyPlanGenerator(state.accessToken);
      currentGeneratorRef.current = generator; // Сохраняем для возможности отмены
      
      // Продолжаем с того дня, где остановились
      for (let i = currentIndex; i < daysOfWeek.length; i++) {
        const dayName = daysOfWeek[i];

        // Пропускаем уже сгенерированные дни
        if (generatedDays[dayName]) {
          continue;
        }

        try {
          setCurrentGeneratingDay(dayName);
          
          // Генерируем план для дня (передаем индекс для разнообразия)
          const dayPlan = await generator.generateDayPlan(
            dayName,
            state.childData,
            state.goalsText,
            i // Индекс дня для инструкций о разнообразии
          );
          
          generatedDays[dayName] = dayPlan;
          setGeneratedDaysProgress(prev => ({ ...prev, [dayName]: true }));

          // Обновляем состояние
          if (generationStateRef.current) {
            generationStateRef.current.generatedDays = generatedDays;
            generationStateRef.current.currentDayIndex = i + 1;
            generationStateRef.current.progress = Math.round(((i + 1) / daysOfWeek.length) * 90);
            saveGenerationState(generationStateRef.current);
          }

          // Update progress (each day is ~14% of total)
          setProgress(Math.round(((i + 1) / daysOfWeek.length) * 90));
        } catch (dayError: any) {
          console.error(`Error generating ${dayName}:`, dayError);
          
          // Более информативное сообщение об ошибке
          const errorMessage = dayError?.message || "Неизвестная ошибка";
          const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
          
          // Continue with other days, skip failed one
          toast({
            variant: "destructive",
            title: `Ошибка для ${dayName}`,
            description: isTimeout 
              ? "Превышено время ожидания ответа от сервера. День будет пропущен. Попробуйте позже."
              : "День будет пропущен",
          });
        } finally {
          setCurrentGeneratingDay(null);
        }

        // Small delay between requests to avoid rate limiting
        if (i < daysOfWeek.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (Object.keys(generatedDays).length === 0) {
        throw new Error("Не удалось сгенерировать ни одного дня");
      }

      // Generate shopping list from collected ingredients
      const shoppingList = generator.generateShoppingList(generatedDays);

      // Calculate total weekly calories
      let totalCalories = 0;
      for (const dayPlan of Object.values(generatedDays)) {
        for (const meal of Object.values(dayPlan)) {
          totalCalories += meal?.calories || 0;
        }
      }

      setProgress(100);

      const plan: GeneratedPlan = {
        days: generatedDays,
        shopping_list: shoppingList,
        total_calories_week: totalCalories,
      };

      setGeneratedPlan(plan);
      // Обновляем состояние перед очисткой (но не очищаем сразу, чтобы можно было восстановить)
      if (generationStateRef.current) {
        generationStateRef.current.progress = 100;
        generationStateRef.current.step = "preview";
        generationStateRef.current.generatedPlan = plan;
        generationStateRef.current.isGenerating = false; // Генерация завершена
        saveGenerationState(generationStateRef.current);
      }
      setStep("preview");
      stopAutoSave();
    } catch (err: any) {
      const errorMessage = err.message || "Ошибка генерации";
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
      
      setError(errorMessage);
      setStep("goals");
      clearGenerationState();
      stopAutoSave();
      
      toast({
        variant: "destructive",
        title: "Ошибка генерации",
        description: isTimeout
          ? "Превышено время ожидания ответа от сервера DeepSeek. Серверы могут быть перегружены. Попробуйте позже."
          : errorMessage || "Не удалось сгенерировать план",
      });
    } finally {
      isRestoringRef.current = false;
      isGeneratingRef.current = false;
      setIsGenerating(false);
      currentGeneratorRef.current = null;
    }
  }, [toast, stopAutoSave]);

  // Восстановление генерации при возврате на вкладку
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Небольшая задержка для стабилизации после возврата на вкладку
        setTimeout(() => {
          // Проверяем, есть ли сохраненное состояние генерации
          const savedState = loadGenerationState();
          console.log('Visibility change - savedState:', savedState);

          if (savedState) {
            // Проверяем, что генерация в процессе (по step или isGenerating)
            const isGenerating = savedState.step === "generating" || savedState.isGenerating;

            if (isGenerating) {
              // Предотвращаем множественное восстановление и параллельные генерации
              if (isRestoringRef.current || isGeneratingRef.current) {
                console.log('Already restoring or generating, skipping...');
                return;
              }

              console.log('Restoring generation state:', savedState);

              // Восстанавливаем состояние UI
              generationStateRef.current = savedState;

              // Восстанавливаем step и progress
              if (savedState.step) {
                setStep(savedState.step as typeof step);
              }
              if (savedState.progress !== undefined) {
                setProgress(savedState.progress);
              }
              if (savedState.selectedGoals) {
                setSelectedGoals(savedState.selectedGoals);
              }
              // Восстанавливаем прогресс по дням
              if (savedState.generatedDays) {
                const daysProgress: Record<string, boolean> = {};
                Object.keys(savedState.generatedDays).forEach(day => {
                  daysProgress[day] = true;
                });
                setGeneratedDaysProgress(daysProgress);
              }

              // Если генерация еще не завершена, продолжаем
              if (savedState.step === "generating" && savedState.currentDayIndex < 7) {
                console.log('Continuing generation from day:', savedState.currentDayIndex);
                // Небольшая задержка для плавного восстановления UI
                setTimeout(() => {
                  continueGeneration();
                }, 500);
              } else if (savedState.step === "preview" && savedState.generatedPlan) {
                // Если генерация завершена, восстанавливаем план
                console.log('Restoring completed plan');
                setGeneratedPlan(savedState.generatedPlan);
              }
            }
          }
        }, 100);
      } else {
        // При уходе со вкладки - сохраняем состояние
        if (generationStateRef.current && step === "generating") {
          saveGenerationState(generationStateRef.current);
        }
      }
    };

    // Обработка beforeunload для сохранения перед закрытием
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (generationStateRef.current && step === "generating") {
        saveGenerationState(generationStateRef.current);
        // Не блокируем закрытие, только сохраняем
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopAutoSave();
    };
  }, [step, continueGeneration, startAutoSave, stopAutoSave]);

  // Проверка сохраненного состояния при монтировании компонента
  useEffect(() => {
    const savedState = loadGenerationState();
    console.log('Component mount - savedState:', savedState);

    if (savedState) {
      // Проверяем, что генерация в процессе (по step или isGenerating)
      const isGenerating = savedState.step === "generating" || savedState.isGenerating;

      if (isGenerating) {
        // Предотвращаем параллельные генерации
        if (isGeneratingRef.current) {
          console.log('Generation already in progress on mount, skipping restore');
          return;
        }

        console.log('Restoring generation on mount:', savedState);

        // Автоматически восстанавливаем состояние генерации
        generationStateRef.current = savedState;

        // Восстанавливаем UI состояние
        if (savedState.step) {
          setStep(savedState.step as typeof step);
        }
        if (savedState.progress !== undefined) {
          setProgress(savedState.progress);
        }
        if (savedState.selectedGoals) {
          setSelectedGoals(savedState.selectedGoals);
        }
        // Восстанавливаем прогресс по дням
        if (savedState.generatedDays) {
          const daysProgress: Record<string, boolean> = {};
          Object.keys(savedState.generatedDays).forEach(day => {
            daysProgress[day] = true;
          });
          setGeneratedDaysProgress(daysProgress);
        }

        // Если генерация еще не завершена, продолжаем
        if (savedState.step === "generating" && savedState.currentDayIndex < 7) {
          console.log('Continuing generation on mount from day:', savedState.currentDayIndex);
          // Небольшая задержка для инициализации компонента
          setTimeout(() => {
            continueGeneration();
          }, 500);
        } else if (savedState.step === "preview" && savedState.generatedPlan) {
          // Если генерация завершена, восстанавливаем план
          console.log('Restoring completed plan on mount');
          setGeneratedPlan(savedState.generatedPlan);
        }
      }
    }
  }, [continueGeneration, startAutoSave, stopAutoSave]);

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((id) => id !== goalId)
        : prev.length < 3
          ? [...prev, goalId]
          : prev
    );
  };

  // Handle meal update from edit dialog
  const handleMealUpdate = (updatedMeal: GeneratedMeal) => {
    if (!generatedPlan || !editingMeal) return;

    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [editingMeal.dayName]: {
            ...prev.days[editingMeal.dayName],
            [editingMeal.mealType]: updatedMeal,
          },
        },
      };
    });
    setEditingMeal(null);
  };

  const openMealEdit = (dayName: string, mealType: keyof GeneratedDay, meal: GeneratedMeal) => {
    setEditingMeal({ dayName, mealType, meal });
  };

  // Старые функции удалены - теперь используется DailyPlanGenerator

  const generatePlan = async () => {
    if (!selectedChild || !user) return;

    // Проверяем, не идет ли уже генерация
    if (isGeneratingRef.current) {
      console.warn('Generation already in progress, ignoring new request');
      toast({
        variant: "default",
        title: "Генерация уже идет",
        description: "Дождитесь завершения текущей генерации",
      });
      return;
    }

    // Отменяем предыдущую генерацию если есть
    if (currentGeneratorRef.current) {
      console.log('Aborting previous generator');
      currentGeneratorRef.current.abort();
      currentGeneratorRef.current = null;
    }

    // Устанавливаем флаги генерации
    isGeneratingRef.current = true;
    setIsGenerating(true);

    setStep("generating");
    setProgress(0);
    setError(null);
    setCurrentGeneratingDay(null);
    setGeneratedDaysProgress({});
    
    // Очищаем старое состояние перед новой генерацией
    clearGenerationState();

    const daysOfWeek = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

    try {
      const childData = {
        name: selectedChild.name,
        ageMonths: calculateAgeInMonths(selectedChild.birth_date),
        allergies: selectedChild.allergies || [],
        dietGoals: selectedGoals.map((g) => dietGoals.find((dg) => dg.id === g)?.label || g),
        weight: selectedChild.weight || undefined,
        height: selectedChild.height || undefined,
      };

      const goalsText = selectedGoals
        .map((g) => dietGoals.find((dg) => dg.id === g)?.label)
        .join(", ");

      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token || "";

      // Сохраняем начальное состояние СРАЗУ после установки step
      generationStateRef.current = {
        isGenerating: true,
        generatedDays: {},
        currentDayIndex: 0,
        childData,
        goalsText,
        accessToken,
        step: "generating",
        progress: 0,
        selectedGoals,
      };
      // Сохраняем состояние только в начале генерации (автосохранение отключено)
      saveGenerationState(generationStateRef.current);
      console.log('Initial generation state saved:', generationStateRef.current);

      // Используем оптимизированный DailyPlanGenerator
      const generator = new DailyPlanGenerator(accessToken);
      currentGeneratorRef.current = generator; // Сохраняем для возможности отмены
      
      const weekPlan = await generator.generateWeekPlan(
        childData,
        goalsText,
        (dayIndex, progress, dayName) => {
          // Обновляем прогресс для каждого дня
          setProgress(progress);
          setCurrentGeneratingDay(dayName);
          setGeneratedDaysProgress(prev => {
            const newProgress = { ...prev };
            if (dayIndex >= 0 && dayIndex < daysOfWeek.length) {
              newProgress[daysOfWeek[dayIndex]] = true;
            }
            return newProgress;
          });
          
          // Обновляем сохраненное состояние
          if (generationStateRef.current) {
            generationStateRef.current.currentDayIndex = dayIndex + 1;
            generationStateRef.current.progress = progress;
            saveGenerationState(generationStateRef.current);
          }
        },
        (dayIndex, dayPlan) => {
          // Real-time streaming updates (опционально для UI)
          // Можно использовать для показа "Генерируется день X..."
          if (generationStateRef.current) {
            generationStateRef.current.generatedDays = {
              ...generationStateRef.current.generatedDays,
              [daysOfWeek[dayIndex]]: dayPlan,
            };
            saveGenerationState(generationStateRef.current);
          }
        }
      );

      setProgress(100);
      setCurrentGeneratingDay(null);

      // Конвертируем в формат GeneratedPlan (типы совместимы)
      const plan: GeneratedPlan = {
        days: weekPlan.days as Record<string, GeneratedDay>,
        shopping_list: weekPlan.shopping_list,
        total_calories_week: weekPlan.total_calories_week,
      };

      setGeneratedPlan(plan);
      // Обновляем состояние перед очисткой (но не очищаем сразу, чтобы можно было восстановить)
      if (generationStateRef.current) {
        generationStateRef.current.progress = 100;
        generationStateRef.current.step = "preview";
        generationStateRef.current.generatedPlan = plan;
        generationStateRef.current.isGenerating = false; // Генерация завершена
        saveGenerationState(generationStateRef.current);
      }
      setStep("preview");
      stopAutoSave();
    } catch (err: any) {
      const errorMessage = err.message || "Ошибка генерации";
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
      const isAborted = errorMessage.includes('abort') || errorMessage.includes('Abort');
      
      // Если генерация была отменена, не показываем ошибку
      if (isAborted) {
        console.log('Generation was aborted');
        return;
      }
      
      setError(errorMessage);
      setStep("goals");
      clearGenerationState();
      stopAutoSave();
      
      toast({
        variant: "destructive",
        title: "Ошибка генерации",
        description: isTimeout
          ? "Превышено время ожидания ответа от сервера DeepSeek. Серверы могут быть перегружены. Попробуйте позже или уменьшите количество дней."
          : errorMessage || "Не удалось сгенерировать план",
      });
    } finally {
      // Сбрасываем флаги после завершения (успешного или с ошибкой)
      isGeneratingRef.current = false;
      setIsGenerating(false);
      currentGeneratorRef.current = null;
    }
  };

  const savePlan = async () => {
    if (!generatedPlan || !selectedChild || !user) return;

    setStep("saving");
    setProgress(0);

    try {
      const daysOfWeek = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
      const mealTypeMap = {
        breakfast: "breakfast" as const,
        lunch: "lunch" as const,
        snack: "snack" as const,
        dinner: "dinner" as const,
      };

      // Get start of current week (Monday)
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);

      let totalMeals = 0;
      const totalExpected = Object.keys(generatedPlan.days).length * 4;

      // Create recipes and meal plans for each day
      for (const [dayName, dayPlan] of Object.entries(generatedPlan.days)) {
        const dayIndex = daysOfWeek.indexOf(dayName);
        if (dayIndex === -1) continue;

        const planDate = new Date(startOfWeek);
        planDate.setDate(startOfWeek.getDate() + dayIndex);

        for (const [mealKey, meal] of Object.entries(dayPlan)) {
          const mealType = mealTypeMap[mealKey as keyof typeof mealTypeMap];
          if (!mealType || !meal) continue;

          // Create recipe with ingredients and steps
          const ingredientsData = (meal.ingredients || []).map((ing, idx) => ({
            name: ing.name,
            amount: ing.amount || null,
            unit: ing.unit || null,
            category: "other" as const,
            order_index: idx,
          }));

          const stepsData = (meal.steps || []).map((step, idx) => ({
            instruction: step,
            step_number: idx + 1,
            duration_minutes: null,
            image_url: null,
          }));

          const recipe = await createRecipe({
            recipe: {
              title: meal.name,
              child_id: selectedChild.id,
              calories: meal.calories,
              proteins: meal.protein,
              carbs: meal.carbs,
              fats: meal.fat,
              cooking_time_minutes: meal.cooking_time || null,
              description: `Сгенерировано AI для ${selectedChild.name}`,
              tags: selectedGoals,
            },
            ingredients: ingredientsData,
            steps: stepsData,
          });


          // Create meal plan
          await createMealPlan({
            child_id: selectedChild.id,
            recipe_id: recipe.id,
            planned_date: planDate.toISOString().split("T")[0],
            meal_type: mealType,
            is_completed: false,
          });

          totalMeals++;
          setProgress(Math.round((totalMeals / totalExpected) * 80));
        }
      }

      // Create shopping list
      if (generatedPlan.shopping_list && generatedPlan.shopping_list.length > 0) {
        let listId = activeList?.id;
        if (!listId) {
          const newList = await createList("Покупки на неделю");
          listId = newList.id;
        }

        for (const item of generatedPlan.shopping_list) {
          // Parse item like "молоко - 2л" or "яблоки 1 кг"
          const match = item.match(/^(.+?)(?:\s*[-–]\s*|\s+)(\d+(?:[.,]\d+)?)\s*(.+)?$/);

          await addItem({
            shopping_list_id: listId,
            name: match ? match[1].trim() : item,
            amount: match ? parseFloat(match[2].replace(",", ".")) : null,
            unit: match?.[3]?.trim() || null,
            category: "other",
            is_purchased: false,
          });
        }
        setProgress(100);
      }

      toast({
        title: "План сохранен!",
        description: `Создано ${totalMeals} блюд и список покупок`,
      });

      // Очищаем состояние после успешного сохранения
      clearGenerationState();

      navigate("/meal-plan");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Ошибка сохранения",
        description: err.message || "Не удалось сохранить план",
      });
      setStep("preview");
    }
  };

  if (!selectedChild) {
    return (
      <MobileLayout title="Генератор плана">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет профиля ребенка</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте профиль ребенка для генерации плана
              </p>
              <Button variant="mint" onClick={() => navigate("/profile")}>
                Добавить ребенка
              </Button>
            </CardContent>
          </Card>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Генератор плана">
      <div className="space-y-6 pb-6">
        {/* Child Carousel */}
        <div className="px-4 pt-4">
          <ChildCarousel compact />
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Select Goals */}
          {step === "goals" && (
            <motion.div
              key="goals"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="px-4">
                <h2 className="text-xl font-bold mb-2">Цели питания</h2>
                <p className="text-muted-foreground text-sm">
                  Выберите до 3 целей для персонализации плана
                </p>
              </div>

              <div className="px-4 grid grid-cols-2 gap-3">
                {dietGoals.map((goal) => {
                  const isSelected = selectedGoals.includes(goal.id);
                  const IconComponent = goal.icon;

                  return (
                    <motion.button
                      key={goal.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleGoal(goal.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card"
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${goal.color}`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{goal.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {goal.description}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Allergies Warning */}
              {selectedChild.allergies && selectedChild.allergies.length > 0 && (
                <div className="px-4">
                  <Card variant="default" className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="p-3 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-700">
                          Учтём аллергии
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {selectedChild.allergies.join(", ")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Generate Button */}
              <div className="px-4">
                <Button
                  variant="mint"
                  size="lg"
                  className="w-full"
                  onClick={generatePlan}
                  disabled={isGenerating || step === "generating"}
                >
                  {isGenerating || step === "generating" ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Генерация...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Сгенерировать план на неделю
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Generating */}
          {step === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-6 space-y-6"
            >
              <Card variant="elevated" className="p-6 text-center">
                <CardContent className="p-0">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 mx-auto mb-4 rounded-full gradient-primary flex items-center justify-center"
                  >
                    <Sparkles className="w-8 h-8 text-primary-foreground" />
                  </motion.div>
                  <h3 className="text-lg font-bold mb-2">
                    Генерируем план питания
                  </h3>
                  {currentGeneratingDay && (
                    <p className="text-muted-foreground text-sm mb-4">
                      Создаём меню на {currentGeneratingDay}...
                    </p>
                  )}
                  <Progress value={progress} className="h-2 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {progress}%
                  </p>
                </CardContent>
              </Card>

              {/* Days Progress List */}
              <Card variant="default">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3 text-sm">Прогресс по дням</h4>
                  <div className="space-y-2">
                    {["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"].map((dayName, index) => {
                      const isCompleted = generatedDaysProgress[dayName];
                      const isGenerating = currentGeneratingDay === dayName;
                      
                      return (
                        <motion.div
                          key={dayName}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            isGenerating 
                              ? "bg-primary/10 border border-primary/30" 
                              : isCompleted 
                              ? "bg-green-500/10 border border-green-500/30"
                              : "bg-muted/30"
                          }`}
                        >
                          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center">
                            {isGenerating ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : isCompleted ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                            )}
                          </div>
                          <span className={`text-sm flex-1 ${
                            isGenerating 
                              ? "font-semibold text-primary" 
                              : isCompleted 
                              ? "text-green-700 dark:text-green-400"
                              : "text-muted-foreground"
                          }`}>
                            {dayName}
                          </span>
                          {isGenerating && (
                            <Badge variant="default" className="text-xs">
                              Генерируется...
                            </Badge>
                          )}
                          {isCompleted && !isGenerating && (
                            <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-700 dark:text-green-400">
                              Готово
                            </Badge>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && generatedPlan && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Summary */}
              <div className="px-4">
                <Card variant="mint">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold">План готов!</h3>
                        <p className="text-sm text-muted-foreground">
                          {Object.keys(generatedPlan.days).length} дней •{" "}
                          ~{Math.round(generatedPlan.total_calories_week / 7)} ккал/день
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Days Preview - Editable */}
              <div className="px-4 space-y-3">
                <h3 className="font-bold flex items-center gap-2">
                  Меню на неделю
                  <Badge variant="outline" className="text-xs font-normal">
                    <Pencil className="w-3 h-3 mr-1" />
                    Нажмите на блюдо для замены
                  </Badge>
                </h3>
                {Object.entries(generatedPlan.days).map(([day, meals]) => (
                  <Card key={day} variant="default">
                    <CardContent className="p-3">
                      <p className="font-semibold mb-2">{day}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          onClick={() => meals.breakfast && openMealEdit(day, "breakfast", meals.breakfast)}
                          className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <span>🌅</span>
                          <span className="truncate flex-1">{meals.breakfast?.name}</span>
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </button>
                        <button
                          onClick={() => meals.lunch && openMealEdit(day, "lunch", meals.lunch)}
                          className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <span>☀️</span>
                          <span className="truncate flex-1">{meals.lunch?.name}</span>
                        </button>
                        <button
                          onClick={() => meals.snack && openMealEdit(day, "snack", meals.snack)}
                          className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <span>🍎</span>
                          <span className="truncate flex-1">{meals.snack?.name}</span>
                        </button>
                        <button
                          onClick={() => meals.dinner && openMealEdit(day, "dinner", meals.dinner)}
                          className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <span>🌙</span>
                          <span className="truncate flex-1">{meals.dinner?.name}</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Shopping List Preview */}
              <div className="px-4">
                <Card variant="elevated">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <ShoppingCart className="w-5 h-5 text-primary" />
                      <h3 className="font-bold">Список покупок</h3>
                      <Badge variant="secondary" className="ml-auto">
                        {generatedPlan.shopping_list.length} продуктов
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {generatedPlan.shopping_list.slice(0, 6).map((item, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {item.split(" - ")[0]}
                        </Badge>
                      ))}
                      {generatedPlan.shopping_list.length > 6 && (
                        <Badge variant="secondary" className="text-xs">
                          +{generatedPlan.shopping_list.length - 6}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Actions */}
              <div className="px-4 space-y-3">
                <Button
                  variant="mint"
                  size="lg"
                  className="w-full"
                  onClick={savePlan}
                >
                  <Check className="w-5 h-5 mr-2" />
                  Сохранить план и список покупок
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    const goals = selectedGoals.map(
                      (g) => dietGoals.find((dg) => dg.id === g)?.label || g
                    );
                    exportMealPlanToPDF(generatedPlan, selectedChild?.name || "Ребенок", goals);
                    toast({
                      title: "PDF экспортирован",
                      description: "Файл сохранён в папку загрузок",
                    });
                  }}
                >
                  <Download className="w-5 h-5 mr-2" />
                  Экспорт в PDF
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setStep("goals");
                    setGeneratedPlan(null);
                  }}
                >
                  Сгенерировать заново
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Saving */}
          {step === "saving" && (
            <motion.div
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 py-12"
            >
              <Card variant="elevated" className="p-8 text-center">
                <CardContent className="p-0">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                  <h3 className="text-lg font-bold mb-2">Сохраняем план</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    Создаём рецепты и список покупок
                  </p>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {progress}%
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Meal Edit Dialog */}
        <MealEditDialog
          open={!!editingMeal}
          onOpenChange={(open) => !open && setEditingMeal(null)}
          meal={editingMeal?.meal || null}
          mealType={editingMeal?.mealType || "breakfast"}
          dayName={editingMeal?.dayName || ""}
          childData={{
            name: selectedChild?.name || "",
            ageMonths: selectedChild ? calculateAgeInMonths(selectedChild.birth_date) : 0,
            allergies: selectedChild?.allergies || [],
            goals: selectedGoals.map((g) => dietGoals.find((dg) => dg.id === g)?.label || g),
          }}
          onSave={handleMealUpdate}
        />
      </div>
    </MobileLayout>
  );
}
