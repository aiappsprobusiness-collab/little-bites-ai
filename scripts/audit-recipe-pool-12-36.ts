/**
 * Аудит сид-каталога 12–36 мес (data/toddler-seed/toddler-catalog-recipes.json).
 * Логика фильтров упрощена до паритета с Edge/клиентом (см. комментарии); аллергии — грубые токены для демо-сценариев.
 *
 * Запуск из корня: npx tsx scripts/audit-recipe-pool-12-36.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKeyIngredientSignals } from "../shared/keyIngredientSignals.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, "../data/toddler-seed/toddler-catalog-recipes.json");

type MealType = "breakfast" | "lunch" | "snack" | "dinner";

type PoolRow = {
  id: string;
  title: string;
  description?: string | null;
  meal_type?: string | null;
  min_age_months?: number | null;
  max_age_months?: number | null;
  is_soup?: boolean;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
};

const MEAL_TYPE_ALIASES: Record<string, MealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  dinner: "dinner",
};

function normalizeMealType(value: string | null | undefined): MealType | null {
  if (value == null || typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? null;
}

const SOUP_TITLE_TOKENS = ["суп", "борщ", "щи", "солянка", "soup"];
function isSoupLikeTitle(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return false;
  const t = title.toLowerCase();
  return SOUP_TITLE_TOKENS.some((tok) => t.includes(tok));
}

const SNACK_DESSERT_TITLE_TOKENS = [
  "йогурт",
  "пюре",
  "дольки",
  "печенье",
  "батончик",
  "пудинг",
  "творожок",
  "фруктовый",
  "яблочн",
  "перекус",
  "смузи",
];
const DINNER_STYLE_TITLE_TOKENS = ["рагу", "нут", "тушен", "тушён", "плов", "гриль"];

function getSanityBlockedReasons(title: string | null | undefined, slot: MealType): string[] {
  if (!title || typeof title !== "string") return [];
  const t = title.toLowerCase();
  const reasons: string[] = [];
  if (slot === "dinner" || slot === "lunch") {
    if (SNACK_DESSERT_TITLE_TOKENS.some((tok) => t.includes(tok))) reasons.push("snack_dessert_on_meal");
  }
  if (slot === "breakfast") {
    if (DINNER_STYLE_TITLE_TOKENS.some((tok) => t.includes(tok))) reasons.push("dinner_style_on_breakfast");
  }
  return reasons;
}

function recipeFitsAgeMonthsRow(min: number | null | undefined, max: number | null | undefined, ageMonths: number): boolean {
  if (max != null && ageMonths > max) return false;
  if (min != null && ageMonths < min) return false;
  return true;
}

const AGE_RESTRICTED = ["остр", "кофе", "гриб"];
const INFANT_FORBIDDEN_12 = ["свинина", "говядина", "стейк", "жарен", "копчен", "колбас"];
const TODDLER_UNDER_24_FORBIDDEN = ["стейк", "жарен", "копчен", "колбас", "бекон", "отбивн"];

function recipeBlockedByInfantKeywords(r: PoolRow, ageMonths: number): boolean {
  const text = [r.title ?? "", r.description ?? ""].join(" ").toLowerCase();
  if (ageMonths < 36 && AGE_RESTRICTED.some((t) => text.includes(t))) return true;
  if (ageMonths <= 12 && INFANT_FORBIDDEN_12.some((t) => text.includes(t))) return true;
  if (ageMonths < 24 && TODDLER_UNDER_24_FORBIDDEN.some((t) => text.includes(t))) return true;
  return false;
}

function buildRecipeText(r: PoolRow): string {
  const ing = (r.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")).join(" ");
  return [r.title ?? "", r.description ?? "", ing].join(" ").toLowerCase();
}

/** Упрощённо: токены как в типичных сценариях аудита (полный словарь — в allergenTokens на клиенте/Edge). */
function passesPreferenceAudit(r: PoolRow, allergies: string[], dislikes: string[]): boolean {
  const text = buildRecipeText(r);
  for (const a of allergies) {
    const al = a.trim().toLowerCase();
    if (!al) continue;
    if (al.includes("яйц") && text.includes("яйц")) return false;
    if (al.includes("орех") && text.includes("орех")) return false;
    if (al.includes("молок") && /\bмолок|сливк|творог|сыр|йогурт|кефир|сметан/.test(text)) return false;
  }
  for (const d of dislikes) {
    const tok = d.trim().toLowerCase();
    if (tok.length >= 2 && text.includes(tok)) return false;
  }
  return true;
}

const DISH_CATEGORY_TOKENS = [
  { token: "каша", key: "porridge" },
  { token: "овсян", key: "porridge" },
  { token: "гречн", key: "porridge" },
  { token: "суп", key: "soup" },
  { token: "борщ", key: "soup" },
  { token: "щи", key: "soup" },
  { token: "солянк", key: "soup" },
  { token: "рассольник", key: "soup" },
  { token: "окрошк", key: "soup" },
  { token: "гаспачо", key: "soup" },
];

function inferDishCategoryKey(title: string | null | undefined): string {
  const text = (title ?? "").toLowerCase();
  if (!text.trim()) return "other";
  for (const { token, key } of DISH_CATEGORY_TOKENS) {
    if (text.includes(token)) return key;
  }
  return "other";
}

/** Эффективный пул для слота: как generate-plan pickFromPoolInMemory для ребёнка 12+ (не infant). */
function effectivePoolForSlot(
  all: PoolRow[],
  slot: MealType,
  ageMonths: number,
  allergies: string[],
  dislikes: string[],
): PoolRow[] {
  let pool = all.filter((r) => recipeFitsAgeMonthsRow(r.min_age_months ?? null, r.max_age_months ?? null, ageMonths));
  pool = pool.filter((r) => !recipeBlockedByInfantKeywords(r, ageMonths));
  pool = pool.filter((r) => normalizeMealType(r.meal_type) === slot);
  if (slot === "lunch") {
    pool = pool.filter((r) => r.is_soup === true || inferDishCategoryKey(r.title) === "soup");
  }
  if (slot === "breakfast") {
    pool = pool.filter((r) => !isSoupLikeTitle(r.title));
  }
  pool = pool.filter((r) => getSanityBlockedReasons(r.title, slot).length === 0);
  pool = pool.filter((r) => passesPreferenceAudit(r, allergies, dislikes));
  return pool;
}

type JsonRecipe = {
  title: string;
  description?: string;
  meal_type: string;
  min_age_months?: number | null;
  max_age_months?: number | null;
  is_soup?: boolean;
  ingredients?: Array<{ name?: string; display_text?: string }>;
};

function toPoolRow(r: JsonRecipe, idx: number): PoolRow {
  return {
    id: `catalog-${idx}`,
    title: r.title,
    description: r.description ?? null,
    meal_type: r.meal_type,
    min_age_months: r.min_age_months ?? null,
    max_age_months: r.max_age_months ?? null,
    is_soup: r.is_soup === true,
    recipe_ingredients: (r.ingredients ?? []).map((ing) => ({
      name: ing.name,
      display_text: ing.display_text,
    })),
  };
}

function primaryKeyHistogram(rows: PoolRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows) {
    const sig = deriveKeyIngredientSignals(row);
    const pk = sig.primaryKey ?? "(none)";
    m.set(pk, (m.get(pk) ?? 0) + 1);
  }
  return m;
}

function topN(m: Map<string, number>, n: number): Array<{ key: string; count: number; pct: string }> {
  const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count, pct: `${((100 * count) / total).toFixed(1)}%` }));
}

function titleHeuristicStats(rows: PoolRow[]) {
  let puree = 0;
  let porridgeTitle = 0;
  let fingerish = 0;
  let casserole = 0;
  let stew = 0;
  for (const r of rows) {
    const t = (r.title ?? "").toLowerCase();
    if (t.includes("пюре")) puree++;
    if (/каша|овсян|гречн|пшенн|манн/.test(t)) porridgeTitle++;
    if (/дольк|полоск|кусоч|палочк|фингер|на палоч/.test(t)) fingerish++;
    if (/запеканк|кассерол/.test(t)) casserole++;
    if (/рагу|тушен|плов|жаркое/.test(t)) stew++;
  }
  return { puree, porridgeTitle, fingerish, casserole, stew, n: rows.length };
}

const WATCH_KEYS = [
  "salmon",
  "cod",
  "fish",
  "trout",
  "hake",
  "pollock",
  "beef",
  "turkey",
  "buckwheat",
  "broccoli",
  "cauliflower",
  "zucchini",
  "corn",
  "egg",
  "cottage_cheese",
  "kefir",
  "yogurt",
] as const;

function countPrimaryInSet(rows: PoolRow[], keySet: Set<string>): number {
  let n = 0;
  for (const r of rows) {
    const pk = deriveKeyIngredientSignals(r).primaryKey;
    if (pk && keySet.has(pk)) n++;
  }
  return n;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(CATALOG, "utf8")) as { recipes: JsonRecipe[] };
  const rows = (raw.recipes ?? []).map((r, i) => toPoolRow(r, i));

  console.log("=== Источник ===");
  console.log("Файл:", CATALOG);
  console.log("Рецептов в JSON:", rows.length);

  const byMeal: Record<string, number> = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
  for (const r of rows) {
    const m = normalizeMealType(r.meal_type);
    if (m) byMeal[m]++;
  }
  console.log("\n=== Распределение meal_type (каталог) ===");
  console.log(JSON.stringify(byMeal, null, 2));

  const pkAll = primaryKeyHistogram(rows);
  const uniques = [...pkAll.keys()].filter((k) => k !== "(none)").length;
  console.log("\n=== primary_key: уникальных:", uniques);
  console.log("Топ-15 primary_key (весь каталог):");
  console.table(topN(pkAll, 15));

  const watchSet = new Set<string>(WATCH_KEYS);
  const watchCount = countPrimaryInSet(rows, watchSet);
  console.log(
    "\n=== Доля 'недостающих' семейств (primary ∈ {рыба/говядина/индейка/гречка/овощи/яйцо/кисломолочное}):",
    watchCount,
    `(${((100 * watchCount) / rows.length).toFixed(1)}% рецептов)`,
  );

  console.log("\n=== Эвристики по title (весь каталог) ===");
  console.log(titleHeuristicStats(rows));

  const ages = [18, 24, 30] as const;
  const scenarios: Array<{ name: string; allergies: string[]; dislikes: string[] }> = [
    { name: "без аллергий/dislikes", allergies: [], dislikes: [] },
    { name: "аллергия: яйцо (грубый токен)", allergies: ["яйцо"], dislikes: [] },
    { name: "аллергия: орехи", allergies: ["орехи"], dislikes: [] },
    { name: "dislike: морковь", allergies: [], dislikes: ["морков"] },
  ];

  const slots: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

  for (const age of ages) {
    console.log(
      `\n========== Возраст ${age} мес: эффективный пул по слотам (Edge-подобно: возраст + keyword + meal + soup lunch + sanity + аудит-аллергии) ==========`,
    );
    for (const { name, allergies, dislikes } of scenarios) {
      console.log(`\n--- ${name} ---`);
      for (const slot of slots) {
        const eff = effectivePoolForSlot(rows, slot, age, allergies, dislikes);
        const hist = primaryKeyHistogram(eff);
        const top = topN(hist, 5);
        console.log(
          `  ${slot}: ${eff.length} кандидатов | топ primary:`,
          top.map((x) => `${x.key}(${x.count})`).join(", ") || "—",
        );
      }
    }
  }

  console.log("\n=== Готово ===");
}

main();
