import { motion } from "framer-motion";
import { Heart, Calendar, MessageCircle, Stethoscope } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: MessageCircle, label: "Чат", path: "/chat" },
  { icon: Heart, label: "Избранное", path: "/favorites" },
  { icon: Stethoscope, label: "SOS", path: "/sos" },
  { icon: Calendar, label: "План", path: "/meal-plan" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="navIndicator"
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
