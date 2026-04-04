/**
 * Угадать product_category по строке (name + display_text), порядок проверок как в
 * supabase infer_ingredient_category. Используется клиентом, Edge и shared-хелперами.
 */

export function normalizeIngredientTextForCategoryMatch(name: string, displayText?: string | null): string {
  const raw = `${name ?? ""} ${displayText ?? ""}`.trim().toLowerCase().replace(/ё/g, "е");
  return raw.replace(/\s+/g, " ").trim();
}

export function inferDbProductCategoryFromText(combined: string): string {
  const n = normalizeIngredientTextForCategoryMatch(combined, "");
  if (!n) return "other";

  if (/(^|\s)(томатн|томатная)\s+паст|паста\s+томатн|томатн\s+соус/.test(n)) {
    return "other";
  }

  if (
    /говядин|свинин|баранин|индейк|куриц|фарш|котлет|телятин|окорок|грудинк|шея|колбас|сосиск|бекон|ветчин/.test(
      n,
    )
  ) {
    return "meat";
  }
  if (
    /рыба|лосос|треск|тунец|тунц|семг|форел|карп|судак|минтай|сельд|скумбр|кальмар|креветк|краб|икра|стейк\s+тун|филе\s+тун/.test(
      n,
    )
  ) {
    return "fish";
  }
  if (/молок|кефир|йогурт|творог|сыр|сметан|сливк|ряженк|простокваш|тофу|тофю/.test(n)) {
    return "dairy";
  }
  if (/круп|овсян|греч|рис|макарон|паста|мука|лапш|хлеб|сухар|булгур|киноа|перлов/.test(n)) {
    return "grains";
  }
  if (
    /морков|кабач|тыкв|капуст|картоф|лук|огурц|помидор|перец|баклажан|горох|фасол|чеснок|сельдер|шпинат|салат|редис|свекл|редиск|броккол|цветн|зелен|порей|спарж|артишок|руккол|мангольд/.test(
      n,
    )
  ) {
    return "vegetables";
  }
  if (
    /яблок|банан|груш|ягод|клубник|черник|малин|виноград|слив|абрикос|персик|манго|апельсин|лимон|мандарин|киви|авокадо|гранат|инжир/.test(
      n,
    )
  ) {
    return "fruits";
  }
  if (/масло|оливк|сливочн|подсолнечн|растительн/.test(n)) {
    return "fats";
  }
  if (
    /соль|специи|укроп|петруш|базилик|кинза|кориандр|лавр|гвоздик|кориц|имбир|паприк|орегано|тимьян|мята|уксус|мёд|(^|\s)мед([\s,]|$)|перец\s*черн|перец\s*молот|душист/.test(
      n,
    )
  ) {
    return "spices";
  }

  return "other";
}
