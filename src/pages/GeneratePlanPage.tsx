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

interface GeneratedIngredient {
  name: string;
  amount: number;
  unit: string;
}

interface GeneratedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  cooking_time?: number;
  ingredients?: GeneratedIngredient[];
  steps?: string[];
}

interface GeneratedDay {
  breakfast: GeneratedMeal;
  lunch: GeneratedMeal;
  snack: GeneratedMeal;
  dinner: GeneratedMeal;
}

interface GeneratedPlan {
  days: Record<string, GeneratedDay>;
  shopping_list: string[];
  total_calories_week: number;
}

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

  // Сохранение состояния в localStorage
  const saveGenerationState = (state: typeof generationStateRef.current) => {
    if (state) {
      try {
        const stateToSave = {
          ...state,
          step: step,
          progress: progress,
          selectedGoals: selectedGoals,
          timestamp: Date.now(),
        };
        localStorage.setItem('mealPlanGeneration', JSON.stringify(stateToSave));
        console.log('Saved generation state:', stateToSave);
      } catch (e) {
        console.error('Failed to save generation state:', e);
      }
    }
  };

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
    localStorage.removeItem('mealPlanGeneration');
    generationStateRef.current = null;
    console.log('Cleared generation state');
  };

  // Автоматическое сохранение состояния при изменении step или progress во время генерации
  useEffect(() => {
    if (step === "generating" && generationStateRef.current) {
      // Обновляем сохраненное состояние при изменении step или progress
      // Проверяем, что значения действительно изменились, чтобы избежать лишних сохранений
      if (generationStateRef.current.step !== step || generationStateRef.current.progress !== progress) {
        generationStateRef.current.step = step;
        generationStateRef.current.progress = progress;
        saveGenerationState(generationStateRef.current);
      }
    }
  }, [step, progress]);

  // Продолжение генерации с сохраненного места
  const continueGeneration = useCallback(async () => {
    if (!generationStateRef.current) return;

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
      // Продолжаем с того дня, где остановились
      for (let i = currentIndex; i < daysOfWeek.length; i++) {
        const dayName = daysOfWeek[i];
        
        // Пропускаем уже сгенерированные дни
        if (generatedDays[dayName]) {
          continue;
        }

        try {
          const dayPlan = await generateDayPlan(dayName, state.childData, state.goalsText, state.accessToken);
          generatedDays[dayName] = dayPlan;
          
          // Обновляем состояние
          if (generationStateRef.current) {
            generationStateRef.current.generatedDays = generatedDays;
            generationStateRef.current.currentDayIndex = i + 1;
            generationStateRef.current.progress = Math.round(((i + 1) / daysOfWeek.length) * 90);
            saveGenerationState(generationStateRef.current);
          }
          
          // Update progress (each day is ~14% of total)
          setProgress(Math.round(((i + 1) / daysOfWeek.length) * 90));
        } catch (dayError) {
          console.error(`Error generating ${dayName}:`, dayError);
          // Continue with other days, skip failed one
          toast({
            variant: "destructive",
            title: `Ошибка для ${dayName}`,
            description: "День будет пропущен",
          });
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
      const shoppingList = await generateShoppingList(generatedDays, state.accessToken);
      
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
    } catch (err: any) {
      setError(err.message || "Ошибка генерации");
      setStep("goals");
      clearGenerationState();
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: err.message || "Не удалось сгенерировать план",
      });
    }
  }, [toast]);

  // Восстановление генерации при возврате на вкладку
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Проверяем, есть ли сохраненное состояние генерации
        const savedState = loadGenerationState();
        console.log('Visibility change - savedState:', savedState);
        
        if (savedState) {
          // Проверяем, что генерация в процессе (по step или isGenerating)
          const isGenerating = savedState.step === "generating" || savedState.isGenerating;
          
          if (isGenerating) {
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
            
            // Если генерация еще не завершена, продолжаем
            if (savedState.step === "generating" && savedState.currentDayIndex < 7) {
              console.log('Continuing generation from day:', savedState.currentDayIndex);
              // Небольшая задержка для плавного восстановления UI
              setTimeout(() => {
                continueGeneration();
              }, 300);
            } else if (savedState.step === "preview" && savedState.generatedPlan) {
              // Если генерация завершена, восстанавливаем план
              console.log('Restoring completed plan');
              setGeneratedPlan(savedState.generatedPlan);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [step, continueGeneration]);

  // Проверка сохраненного состояния при монтировании компонента
  useEffect(() => {
    const savedState = loadGenerationState();
    console.log('Component mount - savedState:', savedState);
    
    if (savedState) {
      // Проверяем, что генерация в процессе (по step или isGenerating)
      const isGenerating = savedState.step === "generating" || savedState.isGenerating;
      
      if (isGenerating) {
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
  }, [continueGeneration]);

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

  // Retry logic with exponential backoff
  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries = 5,
    baseDelay = 1000
  ): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // If rate limited, retry with backoff
        if (response.status === 429) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
          console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt < maxRetries - 1) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
          console.log(`Fetch failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error("Max retries exceeded");
  };

  // Generate single day plan
  const generateDayPlan = async (
    dayName: string,
    childData: any,
    goalsText: string,
    accessToken: string
  ): Promise<GeneratedDay> => {
    const response = await fetchWithRetry(
      `https://hidgiyyunigqazssnydm.supabase.co/functions/v1/deepseek-chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        // Добавляем keepalive для продолжения запроса при переключении вкладок
        keepalive: true,
        body: JSON.stringify({
          type: "single_day",
          childData,
          messages: [
            {
              role: "user",
              content: `Создай план питания на ${dayName} для ребенка ${childData.name} (${childData.ageMonths} месяцев).

Цели питания: ${goalsText || "Сбалансированное питание"}
${childData.allergies?.length ? `ИСКЛЮЧИ эти продукты (аллергия): ${childData.allergies.join(", ")}` : "Аллергий нет"}

ВАЖНО: Все названия блюд, ингредиенты и шаги приготовления ТОЛЬКО на РУССКОМ языке!

Верни ТОЛЬКО JSON без markdown:
{
  "breakfast": {"name": "Овсяная каша с яблоком", "calories": 250, "protein": 8, "carbs": 40, "fat": 5, "cooking_time": 15, "ingredients": [{"name": "Овсяные хлопья", "amount": 100, "unit": "г"}], "steps": ["Залить водой", "Варить 10 минут"]},
  "lunch": {"name": "Куриный суп", "calories": 320, "protein": 15, "carbs": 25, "fat": 10, "cooking_time": 30, "ingredients": [{"name": "Куриное филе", "amount": 150, "unit": "г"}], "steps": ["Сварить бульон"]},
  "snack": {"name": "Творожок с бананом", "calories": 100, "protein": 5, "carbs": 20, "fat": 2, "cooking_time": 5, "ingredients": [{"name": "Творог", "amount": 100, "unit": "г"}], "steps": ["Смешать"]},
  "dinner": {"name": "Рыбные котлеты", "calories": 280, "protein": 18, "carbs": 20, "fat": 8, "cooking_time": 35, "ingredients": [{"name": "Филе рыбы", "amount": 200, "unit": "г"}], "steps": ["Приготовить фарш"]}
}`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Ошибка генерации для ${dayName}`);
    }

    const data = await response.json();
    const messageText = data.message || "";
    
    // Extract JSON
    const jsonMatch = messageText.match(/```json\s*([\s\S]*?)\s*```/) || 
                      messageText.match(/```\s*([\s\S]*?)\s*```/) ||
                      messageText.match(/(\{[\s\S]*\})/);
    
    if (!jsonMatch) {
      throw new Error(`Не удалось разобрать план для ${dayName}`);
    }
    
    const jsonStr = (jsonMatch[1] || jsonMatch[0]).trim();
    const dayPlan = JSON.parse(jsonStr);
    
    // Normalize keys
    const mealTypeMap: Record<string, keyof GeneratedDay> = {
      "завтрак": "breakfast", "breakfast": "breakfast",
      "обед": "lunch", "lunch": "lunch",
      "полдник": "snack", "snack": "snack",
      "ужин": "dinner", "dinner": "dinner",
    };
    
    const normalizedDay: Partial<GeneratedDay> = {};
    for (const [mealKey, meal] of Object.entries(dayPlan)) {
      const englishKey = mealTypeMap[mealKey.toLowerCase()] || mealKey as keyof GeneratedDay;
      if (["breakfast", "lunch", "snack", "dinner"].includes(englishKey)) {
        normalizedDay[englishKey] = meal as GeneratedMeal;
      }
    }
    
    return normalizedDay as GeneratedDay;
  };

  // Generate shopping list from all meals
  const generateShoppingList = async (
    days: Record<string, GeneratedDay>,
    accessToken: string
  ): Promise<string[]> => {
    // Collect all ingredients
    const allIngredients: string[] = [];
    for (const dayPlan of Object.values(days)) {
      for (const meal of Object.values(dayPlan)) {
        if (meal?.ingredients) {
          meal.ingredients.forEach(ing => {
            allIngredients.push(`${ing.name} - ${ing.amount || ""} ${ing.unit || ""}`);
          });
        }
      }
    }

    // Deduplicate and return
    const uniqueIngredients = [...new Set(allIngredients.map(i => i.trim().toLowerCase()))];
    return uniqueIngredients.filter(Boolean);
  };

  const generatePlan = async () => {
    if (!selectedChild || !user) return;

    setStep("generating");
    setProgress(0);
    setError(null);
    // НЕ очищаем состояние здесь - оно будет перезаписано новым

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
      // Сохраняем состояние сразу, чтобы оно было доступно при переключении вкладок
      saveGenerationState(generationStateRef.current);
      console.log('Initial generation state saved:', generationStateRef.current);

      const generatedDays: Record<string, GeneratedDay> = {};
      
      // Generate each day sequentially with progress updates
      for (let i = 0; i < daysOfWeek.length; i++) {
        const dayName = daysOfWeek[i];
        
        try {
          const dayPlan = await generateDayPlan(dayName, childData, goalsText, accessToken);
          generatedDays[dayName] = dayPlan;
          
          // Обновляем сохраненное состояние
          if (generationStateRef.current) {
            generationStateRef.current.generatedDays = generatedDays;
            generationStateRef.current.currentDayIndex = i + 1;
            generationStateRef.current.progress = Math.round(((i + 1) / daysOfWeek.length) * 90);
            saveGenerationState(generationStateRef.current);
          }
          
          // Update progress (each day is ~14% of total)
          setProgress(Math.round(((i + 1) / daysOfWeek.length) * 90));
        } catch (dayError) {
          console.error(`Error generating ${dayName}:`, dayError);
          // Continue with other days, skip failed one
          toast({
            variant: "destructive",
            title: `Ошибка для ${dayName}`,
            description: "День будет пропущен",
          });
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
      const shoppingList = await generateShoppingList(generatedDays, accessToken);
      
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
    } catch (err: any) {
      setError(err.message || "Ошибка генерации");
      setStep("goals");
      clearGenerationState();
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: err.message || "Не удалось сгенерировать план",
      });
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
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        isSelected
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
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Сгенерировать план на неделю
                  <ChevronRight className="w-5 h-5 ml-2" />
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
              className="px-4 py-12"
            >
              <Card variant="elevated" className="p-8 text-center">
                <CardContent className="p-0">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 mx-auto mb-6 rounded-full gradient-primary flex items-center justify-center"
                  >
                    <Sparkles className="w-8 h-8 text-primary-foreground" />
                  </motion.div>
                  <h3 className="text-lg font-bold mb-2">
                    Генерируем план питания
                  </h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    AI составляет меню с учётом целей и аллергий
                  </p>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {progress}%
                  </p>
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
