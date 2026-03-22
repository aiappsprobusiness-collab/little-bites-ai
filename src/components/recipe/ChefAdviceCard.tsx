import { Card } from "@/components/ui/card";
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
    ? "text-[11px] font-medium text-foreground"
    : "text-[11px] font-medium text-muted-foreground";

  const bodyTrimmed = (body ?? "").trim();
  if (!bodyTrimmed) return null;

  /** Без CardHeader/CardContent: у них p-5 и gap с Card дают лишний «воздух» между заголовком и текстом. */
  const innerClass = isChefTip ? "px-4 py-3.5" : "p-3.5";

  return (
    <Card className={cn(cardClass, className)}>
      <div className={cn(innerClass, "flex flex-col gap-1.5")}>
        <div className="flex flex-row items-center gap-2 min-w-0">
          <span className="text-sm shrink-0 leading-none opacity-80" aria-hidden>
            {isChefTip ? "👨‍🍳" : "💡"}
          </span>
          <p className={cn(titleClass, "leading-tight")}>{title}</p>
        </div>
        <p className="text-sm text-foreground leading-[1.55] min-w-0">{bodyTrimmed}</p>
      </div>
    </Card>
  );
}
