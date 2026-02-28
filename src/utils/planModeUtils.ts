/**
 * Helper для определения режима «Семья» на Плане и в Чате.
 * family-mode = выбран вариант «Семья» ИЛИ selectedMemberId == null при наличии членов.
 */

export function isFamilySelected(
  selectedMemberId: string | null | undefined,
  members: { id: string }[]
): boolean {
  if (selectedMemberId === "family") return true;
  if (selectedMemberId == null && members.length > 0) return true;
  return false;
}
