/**
 * Функция для построения контекста семьи из нескольких профилей
 * Используется для генерации общих рецептов для нескольких членов семьи
 */

export interface FamilyMemberProfile {
  id: string;
  userId: string;
  name: string;
  ageMonths: number | null;
  isChild: boolean;
  allergies: string[];
}

export interface FamilyContext {
  familyDescription: string;
  allAllergies: string[];
  minChildAgeMonths: number | undefined;
}

/**
 * Строит контекст семьи из выбранных профилей
 */
export function buildFamilyContext(selectedMembers: FamilyMemberProfile[]): FamilyContext {
  if (selectedMembers.length === 0) {
    return {
      familyDescription: '',
      allAllergies: [],
      minChildAgeMonths: undefined,
    };
  }

  // Объединяем все аллергии
  const allAllergiesSet = new Set<string>();
  selectedMembers.forEach((member) => {
    (member.allergies || []).forEach((allergy) => {
      if (allergy?.trim()) {
        allAllergiesSet.add(allergy.trim());
      }
    });
  });

  // Находим минимальный возраст среди детей
  const childAges = selectedMembers
    .filter((m) => m.isChild && m.ageMonths != null)
    .map((m) => m.ageMonths!);
  const minChildAgeMonths = childAges.length > 0 ? Math.min(...childAges) : undefined;

  // Формируем описание каждого члена семьи
  const memberDescriptions = selectedMembers.map((member) => {
    const agePart =
      member.ageMonths != null
        ? `${member.ageMonths} мес`
        : member.isChild
          ? 'ребёнок'
          : 'взрослый';
    const allergiesPart =
      member.allergies && member.allergies.length > 0
        ? member.allergies.join(', ')
        : 'нет';

    return `${member.name} (${agePart}, аллергии: ${allergiesPart})`;
  });

  return {
    familyDescription: memberDescriptions.join('\n'),
    allAllergies: Array.from(allAllergiesSet),
    minChildAgeMonths,
  };
}
