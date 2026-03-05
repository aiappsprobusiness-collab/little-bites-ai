import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const DINNER_REMINDER_ENABLED_KEY = "dinner_reminder_enabled";
const DINNER_REMINDER_SHOWN_DATE_KEY = "dinner_reminder_shown_date";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shouldShowBanner(): boolean {
  if (typeof localStorage === "undefined") return false;
  if (localStorage.getItem(DINNER_REMINDER_ENABLED_KEY) !== "1") return false;
  const now = new Date();
  const hour = now.getHours();
  if (hour !== 17) return false;
  const todayKey = getTodayKey();
  if (localStorage.getItem(DINNER_REMINDER_SHOWN_DATE_KEY) === todayKey) return false;
  return true;
}

function markBannerShownToday(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DINNER_REMINDER_SHOWN_DATE_KEY, getTodayKey());
}

export function DinnerReminderBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      if (shouldShowBanner()) setVisible(true);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleDismiss = () => {
    markBannerShownToday();
    setVisible(false);
  };

  const handleOpenPlan = () => {
    markBannerShownToday();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-40 px-4 py-3 bg-primary/95 text-primary-foreground shadow-md">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <p className="flex-1 text-sm font-medium leading-snug">
          Идея ужина для вашей семьи уже готова 🍲
        </p>
        <Link
          to="/meal-plan"
          onClick={handleOpenPlan}
          className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-medium"
        >
          Открыть план
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded hover:bg-white/20"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
