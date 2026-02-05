import { motion } from "framer-motion";
import {
  Heart,
  Calendar,
  MessageCircle,
  LifeBuoy,
  ClipboardList,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Цвет центральной кнопки SOS: мягкий коралловый. Для зелёного заменить на bg-sos-fab-green (см. комментарий ниже). */
const SOS_FAB_CLASS =
  "bg-[#f4a094] shadow-lg hover:bg-[#e89588] active:scale-95";
// Альтернатива — акцентный зелёный: "bg-[#7cb083] shadow-lg hover:bg-[#6a9d70] active:scale-95"

const LEFT_TABS = [
  { icon: MessageCircle, label: "Чат", path: "/chat" },
  { icon: ClipboardList, label: "Анализ", path: "/plate-analysis" },
] as const;

const RIGHT_TABS = [
  { icon: Heart, label: "Избранное", path: "/favorites" },
  { icon: Calendar, label: "План", path: "/meal-plan" },
] as const;

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const renderTab = (
    item: (typeof LEFT_TABS)[number] | (typeof RIGHT_TABS)[number]
  ) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;
    return (
      <motion.button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 py-2 px-2 min-w-0 flex-1 rounded-xl transition-colors",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
        whileTap={{ scale: 0.95 }}
      >
        <Icon className="w-6 h-6 shrink-0" />
        <span className="text-xs font-medium truncate w-full text-center">
          {item.label}
        </span>
        {isActive && (
          <motion.div
            layoutId="navIndicator"
            className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"
          />
        )}
      </motion.button>
    );
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 safe-bottom",
        "bg-card/95 backdrop-blur-lg border-t border-border/50",
        "rounded-t-[32px] max-w-lg mx-auto"
      )}
    >
      <div className="relative flex items-end justify-between h-20 px-0">
        {/* Слева: Чат, Анализ */}
        <div className="flex flex-1 justify-around items-stretch min-w-0">
          {LEFT_TABS.map(renderTab)}
        </div>

        {/* Центральная FAB: выступает над панелью */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
          <motion.button
            onClick={() => navigate("/sos")}
            className={cn(
              "flex items-center justify-center w-14 h-14 rounded-full text-white",
              "transition-colors",
              SOS_FAB_CLASS
            )}
            whileTap={{ scale: 0.92 }}
            aria-label="SOS-консультант"
          >
            <LifeBuoy className="w-7 h-7" />
          </motion.button>
        </div>

        {/* Спейсер по центру (под FAB), чтобы не кликать по вкладкам под кнопкой */}
        <div className="w-[72px] shrink-0" aria-hidden />

        {/* Справа: Избранное, План */}
        <div className="flex flex-1 justify-around items-stretch min-w-0">
          {RIGHT_TABS.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}
