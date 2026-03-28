/**
 * Популярные вопросы для блока «Сегодня спрашивают» на вкладке «Помощь маме».
 * Ротация: 1 вопрос в день, детерминированно по дате и категории дня.
 * Удобно расширять: новые вопросы, смена категорий, замена на analytics/backend без смены UI.
 */

export type PopularQuestionCategory = "nutrition" | "baby" | "allergy" | "routine";

export type PopularQuestion = {
  id: string;
  text: string;
  category: PopularQuestionCategory;
  access: "free" | "premium";
};

/** Пул популярных вопросов. Порядок влияет на ротацию внутри категории. */
export const POPULAR_QUESTIONS: PopularQuestion[] = [
  // Free
  {
    id: "free-new-product",
    text: "Как безопасно вводить новый продукт?",
    category: "nutrition",
    access: "free",
  },
  {
    id: "free-stool-frequency",
    text: "Сколько раз в день должен быть стул у малыша?",
    category: "baby",
    access: "free",
  },
  {
    id: "free-eating-less",
    text: "Ребёнок стал хуже есть — это норма?",
    category: "baby",
    access: "free",
  },
  {
    id: "free-product-not-suitable",
    text: "Как понять, что продукт не подошёл?",
    category: "nutrition",
    access: "free",
  },
  {
    id: "free-hard-stool",
    text: "Стул стал плотным — это запор или норма?",
    category: "baby",
    access: "free",
  },
  {
    id: "free-schedule-or-appetite",
    text: "Нужно ли кормить по режиму или по аппетиту?",
    category: "routine",
    access: "free",
  },
  // Premium
  {
    id: "premium-vegetables",
    text: "Ребёнок не хочет есть овощи — что делать?",
    category: "nutrition",
    access: "premium",
  },
  {
    id: "premium-puree-to-pieces",
    text: "Как мягко перевести с пюре на кусочки?",
    category: "nutrition",
    access: "premium",
  },
  {
    id: "premium-spitting",
    text: "Срыгивания у ребёнка — когда это нормально?",
    category: "baby",
    access: "premium",
  },
  {
    id: "premium-mouth-redness",
    text: "Покраснение вокруг рта после еды — это опасно?",
    category: "allergy",
    access: "premium",
  },
  {
    id: "premium-when-doctor",
    text: "Когда после реакции нужно срочно к врачу?",
    category: "allergy",
    access: "premium",
  },
  {
    id: "premium-snacks",
    text: "Ребёнок постоянно просит перекусы — что делать?",
    category: "routine",
    access: "premium",
  },
  {
    id: "premium-sweet-snacks",
    text: "Чем заменить частые сладкие перекусы?",
    category: "routine",
    access: "premium",
  },
  {
    id: "premium-enough-food",
    text: "Как понять, хватает ли ребёнку еды за день?",
    category: "nutrition",
    access: "premium",
  },
];

/** Категория дня по дню недели (0 = Вс, 1 = Пн, ... 6 = Сб). */
const CATEGORY_BY_DAY_OF_WEEK: Record<number, PopularQuestionCategory> = {
  0: "routine",   // Вс
  1: "nutrition", // Пн
  2: "baby",      // Вт
  3: "allergy",   // Ср
  4: "routine",   // Чт
  5: "nutrition", // Пт
  6: "baby",      // Сб
};

export interface GetPopularQuestionOptions {
  /** Есть доступ (Premium/Trial). Если false, ротация только среди вопросов с access: "free". */
  hasAccess: boolean;
  /** Опционально: дата для тестов. По умолчанию — текущая дата (локальная). */
  date?: Date;
}

/**
 * Возвращает один популярный вопрос на день.
 * - Вопрос меняется 1 раз в день.
 * - Ротация по кругу, детерминирована по дате (без random).
 * - Сначала выбирается категория дня (Пн=nutrition, Вт=baby, ...).
 * - Внутри категории — по индексу дня в году.
 * - Если в категории нет вопроса для текущего access — берётся следующий из общего пула по access.
 */
export function getPopularQuestionForToday(
  options: GetPopularQuestionOptions
): PopularQuestion {
  const { hasAccess, date = new Date() } = options;
  const dayOfWeek = date.getDay();
  const category = CATEGORY_BY_DAY_OF_WEEK[dayOfWeek] ?? "nutrition";
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
  );

  const pool = hasAccess
    ? [...POPULAR_QUESTIONS]
    : POPULAR_QUESTIONS.filter((q) => q.access === "free");

  if (pool.length === 0) {
    return POPULAR_QUESTIONS[0];
  }

  const inCategory = pool.filter((q) => q.category === category);
  const list = inCategory.length > 0 ? inCategory : pool;
  const index = dayOfYear % list.length;
  return list[index];
}
