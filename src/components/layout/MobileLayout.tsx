import { ReactNode } from "react";
import { BottomNavigation } from "./BottomNavigation";
import { TopBar } from "./TopBar";
import { motion } from "framer-motion";

/**
 * LAYOUT CONTRACT (safe-area / отступы)
 * -------------------------------------
 * - Верхний отступ: задаётся ТОЛЬКО через main-below-header (или main-safe-top без хедера).
 *   НЕ добавлять на страницах: pt-safe, pt-[env(safe-area-inset-top)], дублирующий pt-* для "под хедер".
 * - Нижний отступ: задаётся ТОЛЬКО через main-above-nav при showNav.
 *   НЕ добавлять на страницах: pb-safe для "над таббаром", pb-20/pb-24 под нав — main уже учитывает.
 * - Высота хедера: ровно --layout-header-offset (safe-area + контент). Не менять padding/height внутри хедера.
 * - Хедер: title строго по центру; headerLeft — absolute left, headerRight — absolute right (top-right угол). Ничто не сдвигает заголовок.
 * - Viewport: использовать min-h-dvh / 100dvh, не 100vh, чтобы не прыгало при адресной строке.
 * - Скролл: один контейнер на странице (обычно первый ребёнок main с overflow-y-auto). Не скроллить body и вложенный div одновременно.
 */
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
  /** Кастомный контент по центру вместо title (например логотип) */
  headerCenter?: ReactNode;
  /** Убрать блюр у хедера (только фон) */
  headerNoBlur?: boolean;
  /** Доп. классы для header (например граница) */
  headerClassName?: string;
}

export function MobileLayout({
  children,
  title,
  showNav = true,
  headerLeft,
  headerRight,
  headerMeta,
  headerBrand = undefined,
  headerCenter,
  headerNoBlur = false,
  headerClassName,
}: MobileLayoutProps) {
  const showHeader =
    (title != null && title !== "") ||
    headerCenter != null ||
    headerLeft != null ||
    headerRight != null ||
    (headerBrand != null && headerBrand !== false);
  const leftContent = headerBrand === false ? headerLeft : (headerBrand ?? headerLeft);
  const baseHeaderClass = headerNoBlur
    ? "sticky top-0 z-40 bg-background border-b border-border/50 layout-header"
    : "sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 layout-header";

  return (
    <div className="h-dvh min-h-dvh bg-background flex flex-col overflow-hidden">
      {showHeader ? (
        <header className={headerClassName ? `${baseHeaderClass} ${headerClassName}` : baseHeaderClass}>
          <div className="layout-header-inner">
            <TopBar
              left={leftContent != null && leftContent !== false ? leftContent : undefined}
              center={
                headerCenter ??
                (title != null && title !== "" ? (
                  <>
                    <h1 className="text-xl font-semibold text-foreground truncate w-full leading-tight">
                      {title}
                    </h1>
                    {headerMeta != null && (
                      <p className="text-xs text-muted-foreground truncate w-full mt-0.5">
                        {headerMeta}
                      </p>
                    )}
                  </>
                ) : undefined)
              }
              right={headerRight ?? undefined}
            />
          </div>
        </header>
      ) : null}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex flex-col min-h-0 flex-1 overflow-y-auto main-scroll-contain ${showHeader ? "main-below-header" : "main-safe-top"} ${showNav ? "main-above-nav" : ""}`}
      >
        {children}
      </motion.main>
      {showNav && <BottomNavigation />}
    </div>
  );
}
