import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/** Варианты tint для плашки: токены `--icon-*` в index.css (светлая/тёмная тема). */
export type IconBadgeVariant =
  | "sage"
  | "sand"
  | "apricot"
  | "mint"
  | "blue"
  | "amber";

const VARIANT_STYLES: Record<IconBadgeVariant, { bg: string; icon: string }> = {
  sage: { bg: "bg-[var(--icon-sage-bg)]", icon: "text-[var(--icon-sage-fg)]" },
  sand: { bg: "bg-[var(--icon-sand-bg)]", icon: "text-[var(--icon-sand-fg)]" },
  apricot: { bg: "bg-[var(--icon-apricot-bg)]", icon: "text-[var(--icon-apricot-fg)]" },
  mint: { bg: "bg-[var(--icon-mint-bg)]", icon: "text-[var(--icon-mint-fg)]" },
  blue: { bg: "bg-[var(--icon-blue-bg)]", icon: "text-[var(--icon-blue-fg)]" },
  amber: { bg: "bg-[var(--icon-amber-bg)]", icon: "text-[var(--icon-amber-fg)]" },
};

export interface IconBadgeProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  variant: IconBadgeVariant;
  className?: string;
  /** Размер плашки: "md" (36px) по умолчанию, "sm" (32px) для плотных мест. */
  size?: "sm" | "md";
}

/**
 * Плашка с SVG-иконкой: единый визуальный язык для карточек тем и заголовков категорий.
 */
export function IconBadge({ icon: Icon, variant, className, size = "md" }: IconBadgeProps) {
  const { bg, icon: iconColor } = VARIANT_STYLES[variant];
  const isSm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 rounded-[10px] border border-border/40",
        isSm ? "w-8 h-8" : "w-9 h-9",
        bg,
        className,
      )}
      aria-hidden
    >
      <Icon
        className={cn("shrink-0", isSm ? "w-4 h-4" : "w-5 h-5", iconColor)}
        strokeWidth={1.8}
      />
    </span>
  );
}
