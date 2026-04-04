/**
 * Операторный backfill: осторожно проставляет dual display-слой для старых строк recipe_ingredients.
 * Идемпотентно: трогает только measurement_mode = canonical_only и только если enrich даёт dual.
 *
 * Требует: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Запуск:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/backfill-recipe-ingredient-dual-display.ts
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/backfill-recipe-ingredient-dual-display.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { enrichIngredientMeasurementForSave } from "../shared/ingredientMeasurementDisplay.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  let from = 0;
  const page = 400;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("recipe_ingredients")
      .select("id, name, display_text, canonical_amount, canonical_unit, category, measurement_mode")
      .eq("measurement_mode", "canonical_only")
      .not("canonical_amount", "is", null)
      .order("id", { ascending: true })
      .range(from, from + page - 1);

    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (!rows?.length) break;

    for (const row of rows) {
      scanned++;
      const enrichment = enrichIngredientMeasurementForSave({
        name: row.name,
        display_text: row.display_text,
        canonical_amount: row.canonical_amount,
        canonical_unit: row.canonical_unit,
        category: row.category,
      });
      if (enrichment.measurement_mode !== "dual" || !enrichment.display_text) continue;

      if (dryRun) {
        console.log("[dry-run] would update", row.id, enrichment.display_text);
        updated++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("recipe_ingredients")
        .update({
          display_amount: enrichment.display_amount,
          display_unit: enrichment.display_unit,
          display_quantity_text: enrichment.display_quantity_text,
          measurement_mode: enrichment.measurement_mode,
          display_text: enrichment.display_text,
        })
        .eq("id", row.id)
        .eq("measurement_mode", "canonical_only");

      if (!upErr) updated++;
    }

    if (rows.length < page) break;
    from += page;
  }

  console.log(
    dryRun ? `Dry-run: scanned=${scanned}, would_update=${updated}` : `Done: scanned=${scanned}, updated=${updated}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
