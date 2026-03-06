import { recipeChefAdviceCard, recipeMiniAdviceCard } from "@/theme/recipeTokens";
import { cn } from "@/lib/utils";

export interface ChefAdviceCardProps {
  title: string;
  body: string;
  /** true = оливковый info-блок (Совет от шефа), false = нейтральный (Мини-совет) */
  isChefTip?: boolean;
  className?: string;
}

export function ChefAdviceCard({
  title,
  body,
  isChefTip = true,
  className,
}: ChefAdviceCardProps) {
  const cardClass = isChefTip ? recipeChefAdviceCard : recipeMiniAdviceCard;
  const titleClass = isChefTip
    ? "text-[11px] font-medium text-foreground mb-0.5"
    : "text-[11px] font-medium text-muted-foreground mb-0.5";

  const bodyTrimmed = (body ?? "").trim();
  if (!bodyTrimmed) return null;

  return (
    <div className={cn(cardClass, className)}>
      <span className="text-sm shrink-0 opacity-70 mt-0.5" aria-hidden>
        {isChefTip ? "👨‍🍳" : "💡"}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 min-h-0">
        <p className={titleClass}>{title}</p>
        <p className="text-sm text-foreground leading-[1.6] max-h-[6.5em] overflow-y-auto">{bodyTrimmed}</p>
      </div>
    </div>
  );
}
