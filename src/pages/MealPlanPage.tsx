import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const mealTypes = [
  { id: "breakfast", label: "Завтрак", emoji: "🌅", time: "08:00" },
  { id: "lunch", label: "Обед", emoji: "☀️", time: "12:00" },
  { id: "snack", label: "Полдник", emoji: "🍎", time: "15:00" },
  { id: "dinner", label: "Ужин", emoji: "🌙", time: "18:00" },
];

const mockMeals: Record<string, Record<string, { title: string; emoji: string }>> = {
  "0": {
    breakfast: { title: "Овсянка с яблоком", emoji: "🥣" },
    lunch: { title: "Суп-пюре из брокколи", emoji: "🥦" },
    dinner: { title: "Пюре с индейкой", emoji: "🍗" },
  },
  "1": {
    breakfast: { title: "Каша рисовая", emoji: "🍚" },
    snack: { title: "Банан", emoji: "🍌" },
  },
  "2": {
    lunch: { title: "Овощное рагу", emoji: "🥕" },
    dinner: { title: "Творожок", emoji: "🧁" },
  },
};

export default function MealPlanPage() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const getWeekDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const dayMeals = mockMeals[selectedDay.toString()] || {};

  return (
    <MobileLayout title="План питания">
      <div className="space-y-6">
        {/* Week Navigation */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => {
              const prev = new Date(currentWeek);
              prev.setDate(prev.getDate() - 7);
              setCurrentWeek(prev);
            }}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="font-bold">
                {weekDates[0].toLocaleDateString("ru-RU", { month: "long" })}
              </p>
              <p className="text-sm text-muted-foreground">
                {weekDates[0].getDate()} - {weekDates[6].getDate()}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => {
              const next = new Date(currentWeek);
              next.setDate(next.getDate() + 7);
              setCurrentWeek(next);
            }}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Day Selector */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, index) => {
              const date = weekDates[index];
              const isSelected = selectedDay === index;
              const hasMeals = mockMeals[index.toString()];
              
              return (
                <motion.button
                  key={day}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedDay(index)}
                  className={`flex flex-col items-center py-3 rounded-2xl transition-all ${
                    isSelected
                      ? "gradient-primary text-primary-foreground shadow-button"
                      : "bg-card shadow-soft"
                  }`}
                >
                  <span className="text-xs font-medium opacity-80">{day}</span>
                  <span className="text-lg font-bold">{date.getDate()}</span>
                  {hasMeals && !isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Meals for Selected Day */}
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">
              {weekDates[selectedDay].toLocaleDateString("ru-RU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <Button variant="ghost" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Добавить
            </Button>
          </div>

          {mealTypes.map((meal, index) => {
            const plannedMeal = dayMeals[meal.id];
            
            return (
              <motion.div
                key={meal.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  variant={plannedMeal ? "mint" : "default"}
                  className={`${!plannedMeal ? "border-dashed border-2" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="text-3xl">{plannedMeal?.emoji || meal.emoji}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{meal.label}</span>
                          <span className="text-xs text-muted-foreground">{meal.time}</span>
                        </div>
                        {plannedMeal ? (
                          <p className="text-sm text-muted-foreground mt-1">
                            {plannedMeal.title}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-1">
                            Добавить рецепт
                          </p>
                        )}
                      </div>
                      {!plannedMeal && (
                        <Button variant="ghost" size="icon">
                          <Plus className="w-5 h-5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* AI Suggestions */}
        <div className="px-4">
          <Card variant="lavender">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h3 className="font-bold mb-1">Автозаполнение</h3>
                  <p className="text-sm text-accent-foreground/80 mb-3">
                    ИИ составит сбалансированный план на основе предпочтений малыша
                  </p>
                  <Button variant="lavender" size="sm">
                    Заполнить неделю
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generate Shopping List */}
        <div className="px-4 pb-6">
          <Button variant="peach" size="lg" className="w-full">
            🛒 Создать список покупок
          </Button>
        </div>
      </div>
    </MobileLayout>
  );
}
