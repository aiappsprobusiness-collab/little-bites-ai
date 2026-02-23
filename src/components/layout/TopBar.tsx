import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Единая кнопка-иконка в TopBar: 32px, круг, прозрачный фон, hover/active — лёгкая заливка. */
export function TopBarIconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors shrink-0",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TopBarProps {
  /** Левый слот (назад, аватар). Если пусто — сохраняется min-width для центрирования заголовка. */
  left?: ReactNode;
  /** Заголовок по центру (20px semibold). */
  title?: string;
  /** Подзаголовок под title (12–13px muted), одна строка. */
  subtitle?: string;
  /** Кастомный контент по центру вместо title+subtitle. */
  center?: ReactNode;
  /** Правый слот (actions). Gap 8px между кнопками. */
  right?: ReactNode;
  className?: string;
}

/**
 * Единый TopBar приложения: 56px высота контента, 16px отступы, left/center/right.
 * Нижний разделитель и фон задаются через layout-header; safe-area — через обёртку.
 */
export function TopBar({ left, title, subtitle, center, right, className }: TopBarProps) {
  const hasLeft = left != null && left !== false;
  const hasRight = right != null;

  return (
    <div
      className={cn(
        "layout-topbar-inner relative flex items-center w-full min-h-[32px] h-8 px-4",
        className
      )}
    >
      {/* Левый слот: фиксированная ширина если пусто, чтобы центр не прыгал */}
      <div className="absolute left-0 top-0 bottom-0 flex items-center pl-4 z-10 min-w-[40px]">
        {hasLeft ? left : null}
      </div>

      {/* Центр: title+subtitle или кастом center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-14">
        {center != null ? (
          center
        ) : title != null && title !== "" ? (
          <>
            <h1 className="text-xl font-semibold text-foreground truncate w-full leading-tight">
              {title}
            </h1>
            {subtitle != null && subtitle !== "" && (
              <p className="text-xs text-muted-foreground truncate w-full mt-0.5">{subtitle}</p>
            )}
          </>
        ) : null}
      </div>

      {/* Правый слот: gap 8px */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end gap-2 pr-4 z-10 min-w-[40px]">
        {hasRight ? right : null}
      </div>
    </div>
  );
}
