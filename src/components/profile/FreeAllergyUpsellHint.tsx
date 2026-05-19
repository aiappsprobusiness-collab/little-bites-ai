import {
  FREE_ALLERGY_LIMIT_REACHED_HINT,
  FREE_ALLERGY_UPSELL_LINK_LABEL,
} from "@/utils/friendlyLimitCopy";

interface FreeAllergyUpsellHintProps {
  onLearnMore: () => void;
  className?: string;
}

/** Подсказка под полем аллергий на Free после первой записи; paywall — только по клику на ссылку. */
export function FreeAllergyUpsellHint({ onLearnMore, className }: FreeAllergyUpsellHintProps) {
  return (
    <p className={className ?? "text-xs text-muted-foreground mt-1 leading-snug"}>
      {FREE_ALLERGY_LIMIT_REACHED_HINT}{" "}
      <button
        type="button"
        onClick={onLearnMore}
        className="text-primary font-medium underline underline-offset-2 hover:opacity-90"
      >
        {FREE_ALLERGY_UPSELL_LINK_LABEL}
      </button>
    </p>
  );
}
