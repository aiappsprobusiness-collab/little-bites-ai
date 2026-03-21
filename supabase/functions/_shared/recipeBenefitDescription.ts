/**
 * Единый источник детерминированного текста пользы (Edge + Vite).
 * Текст универсальный: только nutrition_goals + стабильный seed (recipeId / stableKey).
 * Заголовок блока («Польза для ребёнка» и т.д.) задаётся в UI отдельно (getBenefitLabel).
 */

const NUTRITION_GOALS_WHITELIST = [
  "balanced",
  "iron_support",
  "brain_development",
  "weight_gain",
  "gentle_digestion",
  "energy_boost",
] as const;

export type NutritionGoal = (typeof NUTRITION_GOALS_WHITELIST)[number];

/** Максимальная длина текста пользы после склейки (обрезка по границе предложения/слова). */
export const BENEFIT_DESCRIPTION_MAX_LENGTH = 220;

const GOAL_WHITELIST_SET = new Set<string>(NUTRITION_GOALS_WHITELIST);

function normalizeNutritionGoals(input: unknown): NutritionGoal[] {
  if (!Array.isArray(input)) return [];
  const out: NutritionGoal[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (!GOAL_WHITELIST_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as NutritionGoal);
  }
  return out;
}

export type BuildRecipeBenefitDescriptionInput = {
  /** UUID рецепта для стабильного выбора шаблонов */
  recipeId?: string | null;
  /**
   * Если recipeId ещё нет (чат до сохранения): стабильная строка
   * (например id сообщения + заголовок).
   */
  stableKey?: string | null;
  goals?: string[] | null;
  /**
   * Название блюда — добавляет энтропию к сиду, чтобы при одинаковых целях
   * разные рецепты реже получали один и тот же текст (и не сталкивались независимые mod-8 по слотам).
   */
  title?: string | null;
};

/**
 * Тот же выбор seed, что у ChatRecipeCard: после сохранения — recipeId;
 * до сохранения — `${chatMessageId}:${title}` или `title:${title}`.
 */
export function resolveBenefitDescriptionSeed(input: {
  recipeId?: string | null;
  chatMessageId?: string | null;
  title: string;
}): { recipeId?: string | null; stableKey?: string | null } {
  const rid = input.recipeId?.trim();
  if (rid) return { recipeId: rid, stableKey: undefined };
  const mid = input.chatMessageId?.trim();
  const t = (input.title ?? "").trim();
  if (mid && t) return { stableKey: `${mid}:${t}` };
  if (t) return { stableKey: `title:${t}` };
  return { stableKey: "chat" };
}

const GOAL_PRIORITY: readonly NutritionGoal[] = [
  "brain_development",
  "iron_support",
  "energy_boost",
  "gentle_digestion",
  "weight_gain",
  "balanced",
] as const;

function goalRank(g: NutritionGoal): number {
  const i = GOAL_PRIORITY.indexOf(g);
  return i === -1 ? 999 : i;
}

/** До двух акцентов по приоритету; balanced только флаг «есть база». */
export function pickPriorityAccentGoals(
  goals: NutritionGoal[]
): { hasBalanced: boolean; accents: NutritionGoal[] } {
  const normalized = normalizeNutritionGoals(goals);
  const hasBalanced = normalized.includes("balanced");
  const accents = normalized
    .filter((g) => g !== "balanced")
    .sort((a, b) => goalRank(a) - goalRank(b))
    .slice(0, 2);
  return { hasBalanced, accents };
}

function fnv1a32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Нормализация названия для сида (длина ограничена). */
export function normalizeBenefitTitleForSeed(title?: string | null): string {
  const t = (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length <= 160) return t;
  return t.slice(0, 160);
}

/**
 * Последовательный генератор индексов из одного сида (xorshift32).
 * Устраняет независимые коллизии `fnv(seed|slot) % 8` для разных UUID при тех же целях.
 */
function createSeededPicker(seedBase: string): (max: number) => number {
  let state = fnv1a32(seedBase);
  if (state === 0) state = 0x9e3779b9;
  return (max: number) => {
    if (max <= 0) return 0;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % max;
  };
}

function pickByPicker<T>(arr: readonly T[], next: (max: number) => number): T {
  if (arr.length === 0) return "" as T;
  return arr[next(arr.length)]!;
}

/**
 * Независимый выбор по слоту: отдельный xorshift-стрим на `seedBase + suffix`,
 * чтобы интро / клаузы / хвост не коррелировали одним и тем же mod-8.
 */
function pickFromSlot<T>(arr: readonly T[], seedBase: string, slotSuffix: string): T {
  return pickByPicker(arr, createSeededPicker(`${seedBase}${slotSuffix}`));
}

/** Короткие завершающие хвосты после основной мысли (тире, чтобы не путать с запятыми внутри клауз). */
const ENDING_POOL: readonly string[] = [
  " — хорошо для обычных дней.",
  " — спокойно по сытости.",
  " — легко вписывается в меню недели.",
  " — удобно для насыщённых дней.",
  " — без лишней тяжести в ощущениях.",
  " — остаётся понятным выбором.",
  " — удобно сочетать с другими приёмами пищи.",
  " — хорошо ложится в домашний ритм.",
];

const FALLBACK: readonly string[] = [
  "Хороший повседневный вариант: сытно, спокойно и без лишней нагрузки.",
  "Универсальная еда на каждый день, когда хочется чего‑то понятного и питательного.",
  "Надёжный вариант для обычного меню: даёт сытость и легко вписывается в день.",
  "Простое и питательное блюдо, которое легко добавить в повседневный рацион.",
  "Еда на каждый день: с хорошей сытностью и без перегруза.",
  "Спокойный базовый вариант для меню, когда нужна понятная и питательная еда.",
  "Удачный выбор для обычных дней: сытно, ровно и без тяжести.",
  "Повседневный питательный вариант, который помогает сделать меню более собранным.",
];

const BALANCED_ONLY: readonly string[] = [
  "Сбалансированный вариант на каждый день с хорошим сочетанием белков, жиров и углеводов.",
  "Помогает держать рацион ровным и питательным без перекоса в одну сторону.",
  "Хороший вариант для повседневного меню, когда важны баланс и нормальная сытость.",
  "Даёт понятный баланс сытости и питательности для обычного ритма дня.",
  "Подходит для тех дней, когда хочется нормального, сбалансированного приёма пищи.",
  "Сбалансированное и питательное блюдо, которое легко вписать в обычный рацион.",
  "Помогает сделать меню более ровным по сытости и общей питательности.",
  "Базовый сбалансированный вариант для повседневного питания без лишнего.",
];

const BALANCED_INTRO: readonly string[] = [
  "Сбалансированный вариант, который ",
  "Хороший вариант для повседневного меню, который ",
  "Питательный и сбалансированный выбор, который ",
  "Вариант на каждый день, который ",
  "Удачный сбалансированный приём пищи, который ",
  "Ровный по питательности вариант, который ",
  "Хорошо собранный повседневный вариант, который ",
  "Сбалансированное блюдо, которое ",
];

const GENERIC_NUTRI_OPENER: readonly string[] = [
  "Этот вариант ",
  "Такой приём пищи ",
  "Блюдо ",
  "Такой выбор ",
  "Этот рецепт ",
  "Такой вариант на день ",
  "Этот приём пищи ",
  "Такой формат блюда ",
];

/** Формат C (single-goal без balanced): короткая вводная + предикат из GOAL_CLAUSES + хвост. */
const SINGLE_SOFT_PREFIX: readonly string[] = [
  "По сути это ",
  "По смыслу для рациона это ",
  "Если смотреть на цель — ",
  "С практической стороны это ",
  "Для меню это ",
  "В повседневном формате это ",
  "Если коротко — ",
  "В таком составе это ",
];

const GOAL_CLAUSES: Record<NutritionGoal, readonly string[]> = {
  balanced: [
    "помогает держать рацион более ровным",
    "хорошо вписывается в повседневное сбалансированное меню",
    "даёт понятное сочетание сытости и питательности",
    "подходит для обычных дней, когда важен общий баланс питания",
    "делает приём пищи более собранным по составу",
    "помогает сохранять баланс в течение дня",
    "поддерживает более ровный ритм питания",
    "даёт хорошую базу для повседневного меню",
  ],

  brain_development: [
    "хорошо подходит для дней, когда нужно сосредоточиться",
    "помогает поддерживать внимание и концентрацию",
    "подходит для моментов, когда важна собранность",
    "хорошо подходит в дни, когда впереди много дел, требующих сосредоточенности",
    "помогает сделать питание более полезным для умственной активности",
    "подходит для дней учёбы или напряжённой работы",
    "поддерживает более ровное самочувствие при умственной нагрузке",
    "хорошо вписывается в дни, когда важна ясность головы",
  ],

  iron_support: [
    "помогает сделать рацион богаче железом",
    "хорошо подходит, когда хочется добавить в меню больше железа",
    "поддерживает рацион с акцентом на продукты, важные для уровня железа",
    "хорошо вписывается в меню, где нужен дополнительный источник железа",
    "помогает усилить железосодержащую часть рациона",
    "делает питание более подходящим для поддержки железа",
    "может быть хорошим вариантом для меню с акцентом на железо",
    "поддерживает более насыщенный железом рацион",
  ],

  energy_boost: [
    "помогает дольше сохранять энергию в течение дня",
    "хорошо подходит для дней, когда нужен стабильный запас сил",
    "может быть особенно уместным при активном ритме дня",
    "даёт хорошую пищевую опору для более энергичного дня",
    "помогает поддерживать бодрость без ощущения перегруза",
    "подходит для тех дней, когда хочется больше устойчивой энергии",
    "может помочь сделать день более ровным по силам и сытости",
    "хорошо вписывается в меню для активных и насыщенных дней",
  ],

  gentle_digestion: [
    "хорошо подходит для более мягкого и комфортного питания",
    "может быть уместным, когда хочется избежать тяжести после еды",
    "поддерживает более спокойный и комфортный формат питания",
    "подходит для дней, когда хочется чего‑то более лёгкого для пищеварения",
    "помогает сделать рацион мягче по ощущениям после еды",
    "может быть хорошим вариантом для более щадящего питания",
    "хорошо вписывается в меню, когда важен комфорт после приёма пищи",
    "поддерживает более лёгкое и спокойное самочувствие после еды",
  ],

  weight_gain: [
    "помогает сделать рацион более калорийным и сытным",
    "может быть полезным, когда важно добирать больше энергии с едой",
    "подходит для меню с акцентом на дополнительную питательность",
    "даёт более плотную сытость и помогает усилить рацион",
    "может быть хорошим вариантом, когда нужно больше пищевой плотности",
    "поддерживает рацион, в котором важно добирать калории без хаоса в меню",
    "хорошо вписывается в питание с акцентом на набор и поддержание веса",
    "помогает сделать приём пищи более насыщенным по энергии",
  ],
};

const SINGLE_FULL: Record<Exclude<NutritionGoal, "balanced">, readonly string[]> = {
  brain_development: [
    "Хороший вариант для дней, когда нужно сосредоточиться: помогает поддерживать внимание и концентрацию через питание.",
    "Подходит для активных дней, когда важно, чтобы еда работала не только на сытость, но и на сосредоточенность.",
    "Такой вариант хорошо вписывается в рацион, если хочется сделать питание более полезным для внимания и ясности головы.",
    "Может быть особенно уместным в дни учёбы и работы, когда важны концентрация и ровное самочувствие.",
    "Поддерживает рацион, в котором есть акцент на питание для внимания, концентрации и умственной активности.",
    "Хороший выбор для тех дней, когда хочется больше пользы для сосредоточенности и работы головой.",
    "Такой приём пищи помогает сделать день более собранным, если впереди много задач и умственной нагрузки.",
    "Уместный вариант для дней, когда хочется добавить в рацион больше поддержки для внимания и умственной активности.",
  ],

  iron_support: [
    "Хороший вариант для рациона с акцентом на железо: помогает сделать питание более насыщенным по этому направлению.",
    "Помогает добавить в меню больше продуктов, важных для поддержки уровня железа.",
    "Подходит для рациона, где нужен дополнительный акцент на железо без лишнего усложнения меню.",
    "Такой вариант помогает сделать питание более уместным для задач, связанных с поддержкой железа.",
    "Может быть хорошим выбором, если хочется усилить железосодержащую часть повседневного рациона.",
    "Поддерживает более насыщенный железом рацион и хорошо вписывается в обычное меню.",
    "Уместный вариант для дней, когда хочется добавить в питание больше опоры на железо.",
    "Помогает сделать рацион богаче железом и при этом сохранить нормальную сытость.",
  ],

  energy_boost: [
    "Хороший вариант для активных дней, когда хочется дольше сохранять силы и энергию.",
    "Помогает поддерживать более стабильную бодрость и лучше держаться в насыщенном ритме дня.",
    "Подходит для дней, когда нужна еда с хорошей сытостью и более ровной отдачей энергии.",
    "Такой вариант может быть особенно уместным, если впереди много дел и нужна надёжная пищевая опора.",
    "Помогает сделать рацион более подходящим для дней с высокой активностью и нагрузкой.",
    "Даёт хорошую базу по сытости и энергии для обычного, но насыщенного дня.",
    "Может быть удачным выбором, когда хочется поддержать силы без ощущения тяжести после еды.",
    "Хорошо вписывается в меню для дней, когда важны бодрость, сытость и устойчивый запас энергии.",
  ],

  gentle_digestion: [
    "Хороший вариант для более мягкого питания, когда хочется избежать тяжести после еды.",
    "Подходит для дней, когда важны комфортное пищеварение и лёгкое самочувствие после приёма пищи.",
    "Такой вариант помогает сделать рацион спокойнее и мягче по ощущениям после еды.",
    "Может быть особенно уместным, когда хочется щадящего и более комфортного питания.",
    "Поддерживает рацион, в котором важны лёгкость, мягкость и комфорт после еды.",
    "Удачный выбор для дней, когда хочется снизить ощущение перегруза после приёма пищи.",
    "Помогает сделать питание более комфортным и спокойным для пищеварения.",
    "Хорошо вписывается в рацион, если сейчас хочется более мягкой и щадящей еды.",
  ],

  weight_gain: [
    "Хороший вариант для рациона, где важно добирать больше калорий и поддерживать более плотную сытость.",
    "Подходит для питания с акцентом на дополнительную энергию и более выраженную питательность.",
    "Такой вариант помогает сделать рацион более насыщенным по калорийности и общей сытости.",
    "Может быть особенно уместным, когда нужно усилить питание без хаотичных перекусов.",
    "Поддерживает меню, в котором важны дополнительная энергия, сытость и пищевая плотность.",
    "Хороший выбор для тех дней, когда хочется сделать питание более насыщенным и калорийным.",
    "Помогает усилить рацион по энергии и сделать приём пищи более плотным по отдаче.",
    "Уместный вариант для меню с акцентом на набор веса или на дополнительную питательность.",
  ],
};

function clampBenefitLength(s: string, max = BENEFIT_DESCRIPTION_MAX_LENGTH): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1).trimEnd();
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(","), cut.lastIndexOf(" "));
  const base = last > 40 ? cut.slice(0, last) : cut;
  return base.endsWith(".") ? base : `${base}.`;
}

export function buildRecipeBenefitDescription(
  input: BuildRecipeBenefitDescriptionInput
): string {
  const normalizedGoals = normalizeNutritionGoals(input.goals);
  const primary = input.recipeId?.trim() || input.stableKey?.trim() || "na";
  const titleSeed = normalizeBenefitTitleForSeed(input.title);
  const seedBase = `${primary}|${normalizedGoals.join(",")}|${titleSeed}`;
  const { hasBalanced, accents } = pickPriorityAccentGoals(normalizedGoals);

  let out: string;

  if (accents.length === 0) {
    out = hasBalanced
      ? pickFromSlot(BALANCED_ONLY, seedBase, "|acc0|bal")
      : pickFromSlot(FALLBACK, seedBase, "|acc0|fb");
    return clampBenefitLength(out);
  }

  if (accents.length === 1) {
    const g = accents[0]!;
    if (hasBalanced) {
      const intro = pickFromSlot(BALANCED_INTRO, seedBase, "|b1|intro");
      const clause = pickFromSlot(GOAL_CLAUSES[g], seedBase, `|b1|cl|${g}`);
      const ending = pickFromSlot(ENDING_POOL, seedBase, "|b1|end");
      out = `${intro}${clause}${ending}`;
    } else {
      /**
       * Формат A: готовая строка из SINGLE_FULL.
       * Формат B: GENERIC_NUTRI_OPENER + клауза + ENDING.
       * Формат C: SINGLE_SOFT_PREFIX + клауза + ENDING.
       */
      const singleFmt = fnv1a32(`${seedBase}|sgfmt|${g}`) % 3;
      if (singleFmt === 0) {
        out = pickFromSlot(SINGLE_FULL[g], seedBase, `|sg|full|${g}`);
      } else if (singleFmt === 1) {
        const opener = pickFromSlot(GENERIC_NUTRI_OPENER, seedBase, `|sg|op|${g}`);
        const clause = pickFromSlot(GOAL_CLAUSES[g], seedBase, `|sg|cl|${g}`);
        const ending = pickFromSlot(ENDING_POOL, seedBase, `|sg|end|${g}`);
        out = `${opener}${clause}${ending}`;
      } else {
        const soft = pickFromSlot(SINGLE_SOFT_PREFIX, seedBase, `|sg|soft|${g}`);
        const clause = pickFromSlot(GOAL_CLAUSES[g], seedBase, `|sg|f2cl|${g}`);
        const ending = pickFromSlot(ENDING_POOL, seedBase, `|sg|f2e|${g}`);
        out = `${soft}${clause}${ending}`;
      }
    }
    return clampBenefitLength(out);
  }

  const g1 = accents[0]!;
  const g2 = accents[1]!;
  if (hasBalanced) {
    const intro = pickFromSlot(BALANCED_INTRO, seedBase, "|b2|intro");
    const c1 = pickFromSlot(GOAL_CLAUSES[g1], seedBase, `|b2|c1|${g1}`);
    const c2 = pickFromSlot(GOAL_CLAUSES[g2], seedBase, `|b2|c2|${g2}`);
    const ending = pickFromSlot(ENDING_POOL, seedBase, "|b2|end");
    out = `${intro}${c1}, и ${c2}${ending}`;
  } else {
    const opener = pickFromSlot(GENERIC_NUTRI_OPENER, seedBase, "|o2|op");
    const c1 = pickFromSlot(GOAL_CLAUSES[g1], seedBase, `|o2|c1|${g1}`);
    const c2 = pickFromSlot(GOAL_CLAUSES[g2], seedBase, `|o2|c2|${g2}`);
    const ending = pickFromSlot(ENDING_POOL, seedBase, "|o2|end");
    out = `${opener}${c1}, и ${c2}${ending}`;
  }

  return clampBenefitLength(out);
}
