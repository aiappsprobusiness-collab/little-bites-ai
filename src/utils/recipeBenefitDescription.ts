import { getAgeCategory } from "@/utils/ageCategory";
import {
  normalizeNutritionGoals,
  type NutritionGoal,
} from "@/utils/nutritionGoals";
import type { MemberTypeV2 } from "@/integrations/supabase/types-v2";

/** Тон текста пользы: не меняет заголовки блока (они по-прежнему из getBenefitLabel). */
export type BenefitProfileContext = "child" | "adult" | "family";

export type BuildRecipeBenefitDescriptionInput = {
  /** UUID рецепта для стабильного выбора шаблонов */
  recipeId?: string | null;
  /**
   * Если recipeId ещё нет (чат до сохранения): стабильная строка
   * (например id сообщения + заголовок).
   */
  stableKey?: string | null;
  goals?: string[] | null;
  context: BenefitProfileContext;
};

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

function pickFrom<T>(arr: readonly T[], seed: string): T {
  if (arr.length === 0) return "" as T;
  const idx = fnv1a32(seed) % arr.length;
  return arr[idx]!;
}

/**
 * Контекст тона по выбору профиля в UI и возрасту.
 * Заголовки блока не трогаем — только для buildRecipeBenefitDescription.
 */
export function resolveBenefitProfileContext(input: {
  selectedMemberId: string | null;
  ageMonths?: number | null;
  memberType?: MemberTypeV2 | "family" | null;
}): BenefitProfileContext {
  if (input.selectedMemberId === "family") return "family";
  if (input.memberType === "family") return "family";
  const am = input.ageMonths;
  if (am != null && Number.isFinite(am) && am >= 0) {
    return getAgeCategory(am) === "adult" ? "adult" : "child";
  }
  return "family";
}

const FALLBACK: Record<BenefitProfileContext, readonly string[]> = {
  child: [
    "Сбалансированный и понятный вариант для повседневного меню.",
    "Лёгкое полезное блюдо, которое хорошо вписывается в обычный рацион.",
    "Питательный вариант без лишней тяжести — удобно на каждый день.",
  ],
  adult: [
    "Сбалансированный вариант для регулярного рациона без лишних сложностей.",
    "Питательное блюдо, которое хорошо подходит для повседневного меню.",
    "Понятный по составу вариант для спокойного и ровного питания.",
  ],
  family: [
    "Сбалансированный и понятный вариант для повседневного меню.",
    "Лёгкое полезное блюдо, которое удобно ставить на общий стол.",
    "Питательный вариант, который спокойно вписывается в обычные дни.",
  ],
};

const BALANCED_ONLY: Record<BenefitProfileContext, readonly string[]> = {
  child: [
    "Сбалансированное блюдо на каждый день — питательно и без перегруза.",
    "Гармоничный по составу вариант, который легко поставить в привычное меню.",
    "Понятное и сбалансированное блюдо для спокойных будней.",
  ],
  adult: [
    "Сбалансированный вариант с ясным составом для повседневного рациона.",
    "Ровное по смыслу блюдо: питательно и без лишнего усложнения.",
    "Сбалансированное блюдо, которое хорошо держит привычный ритм питания.",
  ],
  family: [
    "Сбалансированный вариант, который спокойно подходит для обычных дней.",
    "Лёгкое по ощущению и сбалансированное блюдо для повседневного стола.",
    "Питательно и по делу — без лишнего усложнения в меню.",
  ],
};

/** Начало фразы перед клаузами (строчные клаузы). */
const BALANCED_INTRO: Record<BenefitProfileContext, readonly string[]> = {
  child: [
    "Лёгкое и сбалансированное блюдо, которое ",
    "Сбалансированный и понятный вариант, который ",
    "Питательное блюдо на каждый день, которое ",
  ],
  adult: [
    "Сбалансированный вариант, который ",
    "Питательное блюдо с ясным акцентом, которое ",
    "Удобный для повседневного рациона вариант, который ",
  ],
  family: [
    "Лёгкий и сбалансированный вариант, который ",
    "Сбалансированное блюдо для обычных дней, которое ",
    "Понятное по смыслу блюдо, которое ",
  ],
};

const GENERIC_NUTRI_OPENER: Record<BenefitProfileContext, readonly string[]> = {
  child: [
    "Питательное блюдо, которое ",
    "Вкусный и полезный вариант, который ",
  ],
  adult: [
    "Питательное блюдо, которое ",
    "Сытный и понятный вариант, который ",
  ],
  family: [
    "Питательное блюдо, которое ",
    "Универсальный вариант на каждый день, который ",
  ],
};

const GOAL_CLAUSES: Record<
  NutritionGoal,
  Record<BenefitProfileContext, readonly string[]>
> = {
  balanced: {
    child: ["хорошо вписывается в привычное меню"],
    adult: ["спокойно держит баланс в повседневном рационе"],
    family: ["удачно смотрится в обычном меню"],
  },
  brain_development: {
    child: ["помогает поддерживать внимание", "поддерживает внимание в спокойном темпе"],
    adult: ["помогает сохранять концентрацию", "поддерживает внимание в течение дня"],
    family: ["поддерживает внимание без лишней суеты", "спокойно поддерживает концентрацию в быту"],
  },
  iron_support: {
    child: ["делает рацион более насыщенным по железу", "добавляет в меню больше железа в понятной форме"],
    adult: ["делает рацион плотнее по железу", "помогает разнообразить рацион по железу"],
    family: ["помогает сделать рацион богаче по железу", "вносит в меню больше железа без усложнений"],
  },
  energy_boost: {
    child: ["даёт мягкий заряд бодрости", "поддерживает бодрость в спокойном режиме"],
    adult: ["поддерживает стабильную энергию", "помогает сохранять бодрость в течение дня"],
    family: ["поддерживает энергию в течение дня", "даёт ровный запас бодрости"],
  },
  gentle_digestion: {
    child: ["мягко усваивается и не перегружает", "легко заходит и комфортно сидит в желудке"],
    adult: ["легко усваивается и ощущается комфортно", "мягко подходит для спокойного пищеварения"],
    family: ["мягко подходит для повседневного меню", "легко усваивается в обычном ритме дня"],
  },
  weight_gain: {
    child: ["более сытное и питательное", "даёт комфортное насыщение без тяжести"],
    adult: ["даёт комфортное насыщение", "ощущается сытнее и питательнее"],
    family: ["питательное и сытное без ощущения тяжести", "даёт спокойное насыщение"],
  },
};

const SINGLE_FULL: Record<
  Exclude<NutritionGoal, "balanced">,
  Record<BenefitProfileContext, readonly string[]>
> = {
  brain_development: {
    child: [
      "Блюдо, которое мягко поддерживает внимание и хорошо заходит в обычные дни.",
      "Спокойный вариант, который помогает держать внимание без перегруза.",
    ],
    adult: [
      "Питательное блюдо, которое помогает сохранять концентрацию в течение дня.",
      "Вариант, который поддерживает внимание в привычном ритме работы и быта.",
    ],
    family: [
      "Питательное блюдо, которое поддерживает внимание в спокойном повседневном ритме.",
      "Универсальный вариант, который мягко поддерживает внимание в течение дня.",
    ],
  },
  iron_support: {
    child: [
      "Питательный вариант, который делает рацион богаче по железу.",
      "Блюдо, которое помогает добавить железо в меню без лишних сложностей.",
    ],
    adult: [
      "Вариант, который плотнее по железу и хорош для разнообразия рациона.",
      "Питательное блюдо с акцентом на железо в понятной подаче.",
    ],
    family: [
      "Блюдо, которое помогает сделать повседневный рацион богаче по железу.",
      "Удобный способ добавить железо в меню без лишней суеты.",
    ],
  },
  energy_boost: {
    child: [
      "Блюдо, которое мягко поддерживает бодрость и хорошо для активного дня.",
      "Лёгкий по ощущению заряд энергии без перегруза.",
    ],
    adult: [
      "Сбалансированный вариант для стабильной энергии в течение дня.",
      "Блюдо, которое поддерживает ровную бодрость без скачков.",
    ],
    family: [
      "Вариант, который поддерживает энергию в обычном ритме дня.",
      "Питательное блюдо для спокойной бодрости на целый день.",
    ],
  },
  gentle_digestion: {
    child: [
      "Лёгкий вариант, который мягко усваивается и не перегружает.",
      "Комфортное блюдо для спокойного пищеварения в будни.",
    ],
    adult: [
      "Лёгкий и комфортный вариант для спокойного пищеварения.",
      "Блюдо, которое мягко заходит и не отягощает.",
    ],
    family: [
      "Лёгкий и сбалансированный вариант, который мягко подходит для повседневного меню.",
      "Комфортное блюдо для обычных дней без лишней тяжести.",
    ],
  },
  weight_gain: {
    child: [
      "Питательный и более сытный вариант, который хорошо подходит для регулярного рациона.",
      "Сытное и питательное блюдо без ощущения тяжести.",
    ],
    adult: [
      "Более сытный и питательный вариант с комфортным насыщением.",
      "Питательное блюдо, которое даёт спокойное насыщение.",
    ],
    family: [
      "Питательное и сытное блюдо, которое хорошо держит общий стол.",
      "Сытный вариант без лишней тяжести для повседневного меню.",
    ],
  },
};

function clampBenefitLength(s: string, max = 168): string {
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
  const ctx = input.context;
  const normalizedGoals = normalizeNutritionGoals(input.goals);
  const seedBase = `${input.recipeId?.trim() || input.stableKey?.trim() || "na"}|${ctx}|${normalizedGoals.join(",")}`;
  const { hasBalanced, accents } = pickPriorityAccentGoals(normalizedGoals);

  let out: string;

  if (accents.length === 0) {
    out = hasBalanced
      ? pickFrom(BALANCED_ONLY[ctx], `${seedBase}|balOnly`)
      : pickFrom(FALLBACK[ctx], `${seedBase}|fb`);
    return clampBenefitLength(out);
  }

  if (accents.length === 1) {
    const g = accents[0]!;
    if (hasBalanced) {
      const intro = pickFrom(BALANCED_INTRO[ctx], `${seedBase}|intro`);
      const clause = pickFrom(GOAL_CLAUSES[g][ctx], `${seedBase}|cl`);
      out = `${intro}${clause}.`;
    } else {
      out = pickFrom(SINGLE_FULL[g][ctx], `${seedBase}|single`);
    }
    return clampBenefitLength(out);
  }

  const g1 = accents[0]!;
  const g2 = accents[1]!;
  if (hasBalanced) {
    const intro = pickFrom(BALANCED_INTRO[ctx], `${seedBase}|intro`);
    const c1 = pickFrom(GOAL_CLAUSES[g1][ctx], `${seedBase}|c1`);
    const c2 = pickFrom(GOAL_CLAUSES[g2][ctx], `${seedBase}|c2`);
    out = `${intro}${c1} и ${c2}.`;
  } else {
    const opener = pickFrom(GENERIC_NUTRI_OPENER[ctx], `${seedBase}|op`);
    const c1 = pickFrom(GOAL_CLAUSES[g1][ctx], `${seedBase}|c1`);
    const c2 = pickFrom(GOAL_CLAUSES[g2][ctx], `${seedBase}|c2`);
    out = `${opener}${c1} и ${c2}.`;
  }

  return clampBenefitLength(out);
}
