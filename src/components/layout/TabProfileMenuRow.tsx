import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabProfileMenuRowProps {
  /** Слева: чип профиля / семьи. */
  profileSlot: ReactNode;
  /** Справа: бейдж подписки + кнопка ⋮ (или только меню). Если нет — колонка не рендерится. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Верхний ряд вкладок План / Чат: профиль слева, бейдж + меню справа.
 * Единые отступы и выравнивание по центру по вертикали.
 */
export function TabProfileMenuRow({ profileSlot, trailing, className }: TabProfileMenuRowProps) {
  const hasTrailing = trailing != null && trailing !== false;
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-row items-center justify-between gap-2 min-h-[44px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">{profileSlot}</div>
      {hasTrailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}
