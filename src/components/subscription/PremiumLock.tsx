import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumLockProps {
  children: React.ReactNode;
  isLocked: boolean;
  onUnlock?: () => void;
  className?: string;
}

export function PremiumLock({ children, isLocked, onUnlock, className }: PremiumLockProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      {/* Blurred content */}
      <div className="filter blur-[2px] opacity-50 pointer-events-none select-none">
        {children}
      </div>
      
      {/* Lock overlay */}
      <button
        onClick={onUnlock}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 backdrop-blur-sm rounded-2xl transition-all hover:bg-background/60"
      >
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <span className="text-sm font-medium text-foreground">
          Premium функция
        </span>
        <span className="text-xs text-muted-foreground">
          Нажмите, чтобы разблокировать
        </span>
      </button>
    </div>
  );
}
