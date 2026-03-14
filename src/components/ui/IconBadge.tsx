import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/** Варианты tint для плашки: спокойные премиальные оттенки, olive-first. Иконка заметно темнее фона (~15–20%). */
export type IconBadgeVariant =
  | "sage"      // питание, оливковый
  | "sand"      // дневник, тёплый беж
  | "apricot"   // малыш, здоровье
  | "mint"      // нейтральный медицинский
  | "blue"      // информация, спокойный
  | "amber";    // мягкий акцент

const VARIANT_STYLES: Record<IconBadgeVariant, { bg: string; icon: string }> = {
  sage: { bg: "bg-[#EDF2E7]", icon: "text-[#5E7B3C]" },
  sand: { bg: "bg-[#ede8df]", icon: "text-[#5c4d3d]" },
  apricot: { bg: "bg-[#f8ebe4]", icon: "text-[#8a5238]" },
  mint: { bg: "bg-[#e2ebe0]", icon: "text-[#3a5c42]" },
  blue: { bg: "bg-[#e2eaf2]", icon: "text-[#3a5c72]" },
  amber: { bg: "bg-[#f2ecd8]", icon: "text-[#6a5a2a]" },
};

export interface IconBadgeProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  variant: IconBadgeVariant;
  className?: string;
  /** Размер плашки: "md" (36px) по умолчанию, "sm" (32px) для плотных мест. Иконка: 20px (md) / 16px (sm). */
  size?: "sm" | "md";
}

/**
 * Reusable плашка с тонкой SVG-иконкой: единый визуальный язык для карточек тем и заголовков категорий.
 * Badge 36px (md) / 32px (sm), иконка 20px / 16px по центру, strokeWidth 1.8 для выразительности.
 */
export function IconBadge({ icon: Icon, variant, className, size = "md" }: IconBadgeProps) {
  const { bg, icon: iconColor } = VARIANT_STYLES[variant];
  const isSm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 rounded-[10px] border border-black/[0.04]",
        isSm ? "w-8 h-8" : "w-9 h-9",
        bg,
        className
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
