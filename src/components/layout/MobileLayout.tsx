import { ReactNode } from "react";
import { BottomNavigation } from "./BottomNavigation";
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
    ? "sticky top-0 z-40 bg-background border-b border-border/50 layout-header"
    : "sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 layout-header";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {showHeader ? (
        <header className={headerClassName}>
          <div className="layout-header-inner relative flex items-center">
            {/* Левый слот: absolute left (назад и т.д.) */}
            {leftContent != null && leftContent !== false && (
              <div className="absolute left-0 top-0 bottom-0 flex items-center pl-4 z-10">
                {leftContent}
              </div>
            )}
            {/* Заголовок строго по центру; не сдвигается слотами */}
            {title != null && title !== "" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-12">
                <h1 className="text-typo-title font-semibold text-foreground truncate w-full">{title}</h1>
                {headerMeta != null && (
                  <div className="text-typo-caption text-muted-foreground mt-1 truncate w-full">{headerMeta}</div>
                )}
              </div>
            )}
            {/* Правый слот (селектор профиля): всегда top-right */}
            <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-4 z-10">
              {headerRight}
            </div>
          </div>
        </header>
      ) : null}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex flex-col min-h-0 flex-1 main-scroll-contain ${showHeader ? "main-below-header" : "main-safe-top"} ${showNav ? "main-above-nav" : ""}`}
      >
        {children}
      </motion.main>
      {showNav && <BottomNavigation />}
    </div>
  );
}
