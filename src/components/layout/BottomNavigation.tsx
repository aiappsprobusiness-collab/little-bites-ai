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
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";

/** Центральная кнопка SOS: градиент #FF7F50 → #FF6B6B, коралловая тень, 64×64. */
const SOS_FAB_STYLE = {
  background: "linear-gradient(135deg, #FF7F50 0%, #FF6B6B 100%)",
  boxShadow: "0 8px 24px -4px rgba(255, 127, 80, 0.45)",
};

const LEFT_TABS = [
  { icon: MessageCircle, label: "Чат", path: "/chat" },
  { icon: Heart, label: "Избранное", path: "/favorites" },
] as const;

const RIGHT_TABS = [
  { icon: ClipboardList, label: "Дневник", path: "/diary" },
  { icon: Calendar, label: "План", path: "/meal-plan" },
] as const;

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPremium } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);

  const handleSosClick = () => {
    if (!isPremium) {
      setShowPaywall(true);
      return;
    }
    navigate("/sos");
  };

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
        "bg-white/70 backdrop-blur-xl border-t-0",
        "rounded-t-[35px] max-w-lg mx-auto shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]"
      )}
    >
      <div className="relative flex items-end justify-between h-20 px-0">
        {/* Слева: Чат, Избранное */}
        <div className="flex flex-1 justify-around items-stretch min-w-0">
          {LEFT_TABS.map(renderTab)}
        </div>

        {/* Центральная FAB: 64×64, поверх всех слоёв, кликабельна */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-[999] flex items-center justify-center pointer-events-auto">
          <motion.button
            onClick={handleSosClick}
            className="flex items-center justify-center w-16 h-16 rounded-full text-white transition-transform hover:scale-105 active:scale-95"
            style={SOS_FAB_STYLE}
            whileTap={{ scale: 0.92 }}
            aria-label="SOS-консультант"
          >
            <LifeBuoy className="w-8 h-8" />
          </motion.button>
        </div>

        {/* Спейсер по центру (под FAB), чтобы не кликать по вкладкам под кнопкой */}
        <div className="w-[72px] shrink-0" aria-hidden />

        {/* Справа: Дневник, План */}
        <div className="flex flex-1 justify-around items-stretch min-w-0">
          {RIGHT_TABS.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}
