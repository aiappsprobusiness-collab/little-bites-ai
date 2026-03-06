import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

  return (
    <Card className={cn(cardClass, "flex flex-col overflow-hidden p-0", className)}>
      <CardHeader className="flex flex-row gap-2 items-center py-3 px-4 pb-1.5">
        <span className="text-sm shrink-0 opacity-70" aria-hidden>
          {isChefTip ? "👨‍🍳" : "💡"}
        </span>
        <p className={titleClass}>{title}</p>
      </CardHeader>
      <CardContent className="py-0 px-4 pb-4 min-w-0">
        <p className="text-sm text-foreground leading-[1.6] max-h-[6.5em] overflow-y-auto">{bodyTrimmed}</p>
      </CardContent>
    </Card>
  );
}
