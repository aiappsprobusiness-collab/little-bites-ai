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

/** Центральная кнопка «Быстрый помощник»: тёплый акцент, спокойный тон. */
const FAB_STYLE = {
  background: "linear-gradient(135deg, #6B8E23 0%, #8FBC4C 100%)",
  boxShadow: "0 6px 20px -4px rgba(107, 142, 35, 0.35)",
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
          "relative flex flex-col items-center justify-center gap-1 py-2.5 px-2 min-w-0 flex-1 rounded-xl transition-colors",
          isActive ? "text-emerald-700" : "text-slate-500"
        )}
        whileTap={{ scale: 0.95 }}
      >
        <Icon className={cn("w-5 h-5 shrink-0", isActive && "opacity-90")} />
        <span className={cn("text-xs truncate w-full text-center", isActive ? "font-medium text-emerald-700" : "font-normal text-slate-500")}>
          {item.label}
        </span>
        {isActive && (
          <motion.div
            layoutId="navIndicator"
            className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500/80"
          />
        )}
      </motion.button>
    );
  };

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 safe-bottom-nav",
        "bg-white/70 backdrop-blur-xl border-t-0",
        "rounded-t-[35px] max-w-lg mx-auto shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]"
      )}
    >
      <div className="relative flex items-end justify-between h-20 px-0">
        {/* Слева: Чат, Избранное */}
        <div className="flex flex-1 justify-around items-stretch min-w-0">
          {LEFT_TABS.map(renderTab)}
        </div>

        {/* Центральная FAB: в центре таббара, без выхода за пределы */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] flex items-center justify-center pointer-events-auto w-14 h-14">
          <motion.button
            onClick={handleSosClick}
            className="w-14 h-14 flex items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
            style={FAB_STYLE}
            whileTap={{ scale: 0.92 }}
            animate={{
              boxShadow: [
                "0 6px 20px -4px rgba(107, 142, 35, 0.35)",
                "0 6px 24px -2px rgba(107, 142, 35, 0.45)",
                "0 6px 20px -4px rgba(107, 142, 35, 0.35)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            aria-label="Быстрый помощник"
          >
            <LifeBuoy className="w-7 h-7" />
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
