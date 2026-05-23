/**
 * Чистая логика гидрации/сохранения порций RecipePage при открытии из плана.
 * @see docs/dev/plan-recipe-servings-persistence-2026-03.md
 */

export type PlanServingsHydrateInput = {
  hydrated: boolean;
  servingsViewKey: string;
  servingsSelected: number;
  slotServings: number | undefined;
  planSlotResolved: boolean;
  dayPlanBlocked: boolean;
  servingsBase: number;
  userChanged: boolean;
};

export type PlanServingsHydrateResult = {
  servingsSelected: number;
  hydrated: boolean;
  userChanged: boolean;
  /** Однократно записать servings_base в слот (в JSON ещё нет servings). */
  persistBaseToSlot: number | null;
};

/** Следующее состояние после эффекта гидрации (fromMealPlan). */
export function computePlanServingsHydration(input: PlanServingsHydrateInput): PlanServingsHydrateResult {
  const {
    hydrated,
    servingsSelected,
    slotServings,
    planSlotResolved,
    dayPlanBlocked,
    servingsBase,
    userChanged,
  } = input;

  const base = { servingsSelected, hydrated, userChanged, persistBaseToSlot: null as number | null };

  if (dayPlanBlocked || userChanged) {
    return base;
  }

  if (hydrated) {
    // После гидрации не откатываем UI на slotServings — только ручной степпер или новый viewKey.
    return base;
  }

  if (slotServings != null && slotServings >= 1) {
    return {
      servingsSelected: slotServings,
      hydrated: true,
      userChanged: false,
      persistBaseToSlot: null,
    };
  }

  if (!planSlotResolved) {
    return { ...base, hydrated: false };
  }

  const sb = Math.max(1, servingsBase);
  return {
    servingsSelected: sb,
    hydrated: true,
    userChanged: false,
    persistBaseToSlot: sb,
  };
}

export type ShouldPersistPlanServingsInput = {
  servingsSelected: number;
  slotServings: number | undefined;
  userChanged: boolean;
  /** Значение из гидрации servings_base, ещё не записанное в слот. */
  pendingBasePersist: number | null;
};

/** Нужен ли PATCH meals.*.servings (избегаем 1 !== undefined и цикл 1↔2). */
export function shouldPersistPlanServings(input: ShouldPersistPlanServingsInput): boolean {
  const { servingsSelected, slotServings, userChanged, pendingBasePersist } = input;
  if (servingsSelected < 1) return false;

  if (slotServings != null) {
    return servingsSelected !== slotServings;
  }

  if (userChanged) return true;
  if (pendingBasePersist != null && servingsSelected === pendingBasePersist) return true;
  return false;
}
