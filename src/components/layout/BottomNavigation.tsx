import { Heart, CalendarDays, CircleUserRound, Lightbulb, MessageCircle } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** 5 вкладок: План | Чат | Избранное | Помощь маме | Профиль.
 * Link вместо button+navigate: на Android Chrome тапы надёжнее обрабатываются браузером,
 * меньше зависимость от main thread; touch-action: manipulation убирает 300ms задержку. */
const TABS = [
  { icon: CalendarDays, label: "План", path: "/meal-plan" },
  { icon: MessageCircle, label: "Чат", path: "/chat" },
  { icon: Heart, label: "Избранное", path: "/favorites" },
  { icon: Lightbulb, label: "Помощь маме", path: "/sos" },
  { icon: CircleUserRound, label: "Профиль", path: "/profile" },
] as const;

export function BottomNavigation() {
  const location = useLocation();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 safe-bottom-nav",
        "bg-white border-t border-primary-border/50",
        "rounded-t-2xl max-w-lg mx-auto shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      )}
      style={{ minHeight: "var(--layout-nav-height)", touchAction: "manipulation" }}
    >
      <div className="flex items-stretch justify-around px-1 h-[var(--layout-nav-height)]" style={{ touchAction: "manipulation" }}>
        {TABS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/sos" && location.pathname.startsWith("/sos")) ||
            (item.path === "/profile" && (location.pathname === "/profile" || location.pathname.startsWith("/profile/")));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center justify-center py-2 px-2 min-w-0 flex-1 rounded-xl transition-colors active:scale-95",
                isActive ? "text-primary" : "text-nav-muted"
              )}
            >
              <Icon className={cn("w-5.5 h-5.5 shrink-0", isActive && "opacity-90")} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
