import { motion } from "framer-motion";
import { Heart, Calendar, MessageCircle, LifeBuoy, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/** 5 вкладок: План | Чат | Избранное | Помощь маме | Профиль */
const TABS = [
  { icon: Calendar, label: "План", path: "/meal-plan" },
  { icon: MessageCircle, label: "Чат", path: "/chat" },
  { icon: Heart, label: "Избранное", path: "/favorites" },
  { icon: LifeBuoy, label: "Помощь маме", path: "/sos" },
  { icon: User, label: "Профиль", path: "/profile" },
] as const;

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const handleTabClick = (path: string) => {
    navigate(path);
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 safe-bottom-nav",
        "bg-white border-t border-slate-200",
        "rounded-t-2xl max-w-lg mx-auto shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      )}
      style={{ minHeight: "var(--layout-nav-height)" }}
    >
      <div className="flex items-stretch justify-around px-1 h-[var(--layout-nav-height)]">
        {TABS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/sos" && location.pathname.startsWith("/sos")) ||
            (item.path === "/profile" && (location.pathname === "/profile" || location.pathname.startsWith("/profile/")));
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              onClick={() => handleTabClick(item.path)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2.5 px-2 min-w-0 flex-1 rounded-xl transition-colors",
                isActive ? "text-emerald-600" : "text-slate-500"
              )}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className={cn("w-5 h-5 shrink-0", isActive && "opacity-90")} />
              <span className={cn("text-xs truncate w-full text-center", isActive ? "font-semibold text-emerald-600" : "font-normal text-slate-500")}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="navIndicator"
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-600"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
