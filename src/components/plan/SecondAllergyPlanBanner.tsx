import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type SecondAllergyPlanBannerProps = {
  onLearnMore: () => void;
  onDismiss: () => void;
};

export function SecondAllergyPlanBanner({ onLearnMore, onDismiss }: SecondAllergyPlanBannerProps) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-pill-surface/40 px-4 py-3 flex gap-3 items-start">
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-medium text-foreground leading-snug">
          Учитываем одну аллергию в бесплатной версии
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          В полной версии можно указать все аллергии — подбор будет точнее.
        </p>
        <Button type="button" size="sm" variant="secondary" className="h-8 rounded-lg" onClick={onLearnMore}>
          Узнать про полную версию
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 h-8 w-8"
        aria-label="Скрыть"
        onClick={onDismiss}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
