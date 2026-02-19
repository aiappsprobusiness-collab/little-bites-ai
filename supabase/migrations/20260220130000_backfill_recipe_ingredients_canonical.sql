-- Backfill recipe_ingredients: parse display_text where amount IS NULL and fill amount/unit/canonical_*
-- Depends on: parse_ingredient_display_text, normalize_ingredient_unit, ingredient_canonical (from 20260220120000)

DO $$
DECLARE
  r record;
  parsed_name text;
  parsed_amount numeric;
  parsed_unit text;
  can_amount numeric;
  can_unit text;
  batch_size int := 500;
  total_updated int := 0;
  batch_updated int;
BEGIN
  LOOP
    batch_updated := 0;
    FOR r IN
      SELECT id, name, display_text
      FROM public.recipe_ingredients
      WHERE amount IS NULL AND display_text IS NOT NULL AND trim(display_text) <> ''
      LIMIT batch_size
    LOOP
      SELECT p.name_clean, p.amount_num, p.unit_text
        INTO parsed_name, parsed_amount, parsed_unit
        FROM public.parse_ingredient_display_text(r.display_text) AS p
        LIMIT 1;

      IF parsed_amount IS NOT NULL THEN
        SELECT c.canonical_amount, c.canonical_unit INTO can_amount, can_unit
          FROM public.ingredient_canonical(parsed_amount, parsed_unit) AS c
          LIMIT 1;

        UPDATE public.recipe_ingredients
        SET
          name = COALESCE(NULLIF(trim(parsed_name), ''), name),
          amount = parsed_amount,
          unit = parsed_unit,
          canonical_amount = can_amount,
          canonical_unit = can_unit
        WHERE recipe_ingredients.id = r.id;

        batch_updated := batch_updated + 1;
      END IF;
    END LOOP;
    total_updated := total_updated + batch_updated;
    EXIT WHEN batch_updated = 0;
  END LOOP;

  IF total_updated > 0 THEN
    RAISE NOTICE 'Backfill recipe_ingredients: updated % row(s) total.', total_updated;
  END IF;
END;
$$;
