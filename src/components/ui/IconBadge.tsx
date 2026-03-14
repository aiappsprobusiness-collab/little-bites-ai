import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/** Варианты tint для плашки: спокойные премиальные оттенки, olive-first. */
export type IconBadgeVariant =
  | "sage"      // питание, оливковый
  | "sand"      // дневник, тёплый беж
  | "apricot"   // малыш, здоровье
  | "mint"      // нейтральный медицинский
  | "blue"      // информация, спокойный
  | "amber";    // мягкий акцент

const VARIANT_STYLES: Record<IconBadgeVariant, { bg: string; icon: string }> = {
  sage: { bg: "bg-[#e5ead8]", icon: "text-[#5a6b32]" },
  sand: { bg: "bg-[#ede8df]", icon: "text-[#7a6b5a]" },
  apricot: { bg: "bg-[#f8ebe4]", icon: "text-[#a66b4a]" },
  mint: { bg: "bg-[#e2ebe0]", icon: "text-[#4a6b52]" },
  blue: { bg: "bg-[#e2eaf2]", icon: "text-[#4a6b82]" },
  amber: { bg: "bg-[#f2ecd8]", icon: "text-[#7a6b3a]" },
};

export interface IconBadgeProps {
  icon: ComponentType<{ className?: string }>;
  variant: IconBadgeVariant;
  className?: string;
  /** Размер плашки: "md" (36px) по умолчанию, "sm" (32px) для плотных мест. */
  size?: "sm" | "md";
}

/**
 * Reusable плашка с тонкой SVG-иконкой: единый визуальный язык для карточек тем и заголовков категорий.
 * Badge ~36px, radius 10–12px, иконка 16–18px по центру.
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
      <Icon className={cn("shrink-0", isSm ? "w-4 h-4" : "w-[18px] h-[18px]", iconColor)} />
    </span>
  );
}
