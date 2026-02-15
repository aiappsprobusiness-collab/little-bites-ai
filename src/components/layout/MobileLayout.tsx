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
  /** Left block: по умолчанию пусто; false = не показывать, ReactNode = кастом (headerLeft тоже можно передать) */
  headerBrand?: ReactNode | false;
  /** Убрать блюр у хедера (только фон) */
  headerNoBlur?: boolean;
}

export function MobileLayout({
  children,
  title,
  showNav = true,
  headerLeft,
  headerRight,
  headerMeta,
  headerBrand = undefined,
  headerNoBlur = false,
}: MobileLayoutProps) {
  const showHeader =
    (title != null && title !== "") ||
    headerLeft != null ||
    headerRight != null ||
    (headerBrand != null && headerBrand !== false);
  const leftContent = headerBrand === false ? headerLeft : (headerBrand ?? headerLeft);
  const headerClassName = headerNoBlur
    ? "sticky top-0 z-40 bg-background border-b border-border/50 layout-header-safe"
    : "sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 layout-header-safe";

  return (
    <div className="min-h-screen min-h-dvh bg-background flex flex-col">
      {showHeader ? (
        <header className={headerClassName}>
          <div className="flex items-center justify-between px-4 gap-2 min-h-[var(--header-content-height)] py-[var(--header-row-py)]">
            {leftContent != null && leftContent !== false && (
              <div className="min-w-0 flex-1 flex items-center justify-start">
                {leftContent}
              </div>
            )}
            <div className={`flex-1 min-w-0 flex flex-col items-center justify-center text-center px-1 ${leftContent ? "shrink-0" : ""}`}>
              {title != null && title !== "" && (
                <h1 className="text-typo-title font-semibold text-foreground truncate w-full">{title}</h1>
              )}
              {headerMeta != null && (
                <div className="text-typo-caption text-muted-foreground mt-1 truncate w-full">{headerMeta}</div>
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
        className={`flex flex-col min-h-0 flex-1 ${showHeader ? "main-below-header" : "main-safe-top"} ${showNav ? "main-above-nav" : ""}`}
      >
        {children}
      </motion.main>
      {showNav && <BottomNavigation />}
    </div>
  );
}
