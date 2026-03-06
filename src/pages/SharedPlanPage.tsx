import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedPlanByRef, type SharedPlanPayload, isSharedPlanWeek } from "@/services/sharedPlan";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

const MEAL_EMOJI: Record<string, string> = {
  breakfast: "🍳",
  lunch: "🍲",
  snack: "🍓",
  dinner: "🥘",
};

const APP_URL = "https://momrecipes.online";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

export default function SharedPlanPage() {
  const { ref } = useParams<{ ref: string }>();
  const [plan, setPlan] = useState<SharedPlanPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found">("loading");

  useEffect(() => {
    const r = ref?.trim();
    if (!r) {
      setStatus("not_found");
      return;
    }
    getSharedPlanByRef(r)
      .then((data) => {
        if (data) {
          setPlan(data);
          setStatus("found");
        } else {
          setStatus("not_found");
        }
      })
      .catch(() => setStatus("not_found"));
  }, [ref]);

  const handleOpenApp = () => {
    window.location.href = `${APP_URL}/meal-plan`;
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Загрузка плана…</p>
        </div>
      </div>
    );
  }

  if (status === "not_found" || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">План не найден или ссылка устарела</p>
          <Button onClick={() => (window.location.href = APP_URL)}>Перейти в приложение</Button>
        </div>
      </div>
    );
  }

  if (isSharedPlanWeek(plan)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 px-4 py-8 max-w-md mx-auto w-full">
          <h1 className="text-xl font-semibold text-foreground mb-1">Меню на неделю из MomRecipes</h1>
          <p className="text-muted-foreground text-sm mb-0.5">План питания для семьи на 7 дней</p>
          <p className="text-muted-foreground/80 text-xs mb-6">Составлено автоматически за 30 секунд</p>
          <ul className="space-y-6 list-none pl-0">
            {plan.days.map((day) => (
              <li key={day.date} className="border-b border-border/60 pb-5 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-foreground mb-2">{day.label}</p>
                {day.meals.length > 0 ? (
                  <ul className="space-y-2">
                    {day.meals.map((m) => (
                      <li key={m.slot} className="flex gap-2 items-start text-sm">
                        <span className="shrink-0 text-base" aria-hidden>{MEAL_EMOJI[m.slot] ?? "🍽"}</span>
                        <span className="text-foreground">{m.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm italic">День пока не заполнен</p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-10 pt-6 border-t">
            <Button
              className="w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground h-12 font-semibold"
              onClick={handleOpenApp}
            >
              <Sparkles className="w-5 h-5 mr-2 shrink-0" />
              ✨ Получить свой план питания
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const dateLabel = formatDateLabel(plan.date);
  const capitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 px-4 py-8 max-w-md mx-auto w-full">
        <h1 className="text-xl font-semibold text-foreground mb-1">Меню на день из MomRecipes</h1>
        <p className="text-muted-foreground text-sm mb-0.5">План питания для семьи</p>
        <p className="text-muted-foreground/80 text-xs mb-4">Составлено автоматически за 30 секунд</p>
        <p className="text-muted-foreground text-sm mb-6">{capitalized}</p>
        <ul className="space-y-4">
          {plan.meals.map((m) => (
            <li key={m.meal_type} className="flex gap-3 items-start">
              <span className="text-2xl shrink-0" aria-hidden>{MEAL_EMOJI[m.meal_type] ?? "🍽"}</span>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label ?? m.meal_type}</p>
                <p className="text-foreground font-medium">{m.title}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-10 pt-6 border-t">
          <Button
            className="w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground h-12 font-semibold"
            onClick={handleOpenApp}
          >
            <Sparkles className="w-5 h-5 mr-2 shrink-0" />
            ✨ Получить свой план питания
          </Button>
        </div>
      </main>
    </div>
  );
}
