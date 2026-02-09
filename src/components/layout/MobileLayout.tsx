import { ReactNode } from "react";
import { BottomNavigation } from "./BottomNavigation";
import { motion } from "framer-motion";

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  showNav?: boolean;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** Optional meta line below title (e.g. recipe page: age · meal type · cook time) */
  headerMeta?: ReactNode;
}

export function MobileLayout({ children, title, showNav = true, headerLeft, headerRight, headerMeta }: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {(title != null && title !== "") || headerLeft != null || headerRight != null ? (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 safe-top">
          <div className="flex items-center justify-between min-h-14 px-4 py-3">
            <div className="w-14 min-w-[44px] flex items-center justify-start shrink-0">
              {headerLeft}
            </div>
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center px-1">
              {title != null && title !== "" && (
                <h1 className="text-lg font-bold text-foreground truncate w-full">{title}</h1>
              )}
              {headerMeta != null && (
                <div className="text-xs font-normal text-muted-foreground leading-tight mt-1 truncate w-full">{headerMeta}</div>
              )}
            </div>
            <div className="min-w-[44px] flex justify-end shrink-0 pl-2">
              {headerRight}
            </div>
          </div>
        </header>
      ) : null}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={showNav ? "pb-20" : ""}
      >
        {children}
      </motion.main>
      {showNav && <BottomNavigation />}
    </div>
  );
}
