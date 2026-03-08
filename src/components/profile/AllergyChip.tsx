import { PreferenceChip } from "./PreferenceChip";

/** Чип аллергии — единый стиль с PreferenceChip variant="allergy" (предупреждение/ограничение). */
export function AllergyChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return <PreferenceChip label={label} variant="allergy" className={className} />;
}
