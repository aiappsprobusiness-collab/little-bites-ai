import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { motion } from "framer-motion";

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  showNav?: boolean;
}

export function MobileLayout({ children, title, showNav = true }: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {title && (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 safe-top">
          <div className="flex items-center justify-center h-14 px-4">
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          </div>
        </header>
      )}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={showNav ? "pb-24" : ""}
      >
        {children}
      </motion.main>
      {showNav && <BottomNav />}
    </div>
  );
}
