-- Set search_path = '' on all functions that had "Function Search Path Mutable" warning.
-- All references to public objects are fully qualified; built-ins (trim, now, regexp_*, etc.) resolve via pg_catalog.

-- 1) update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) normalize_ingredient_unit
CREATE OR REPLACE FUNCTION public.normalize_ingredient_unit(unit text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  u text;
BEGIN
  IF unit IS NULL OR trim(unit) = '' THEN RETURN NULL; END IF;
  u := lower(trim(unit));
  u := regexp_replace(u, '\.$', '');
  IF u IN ('г', 'гр', 'g', 'грамм') THEN RETURN 'g'; END IF;
  IF u IN ('кг', 'kg', 'килограмм') THEN RETURN 'kg'; END IF;
  IF u IN ('мл', 'ml', 'миллилитр') THEN RETURN 'ml'; END IF;
  IF u IN ('л', 'l', 'литр') THEN RETURN 'l'; END IF;
  IF u IN ('шт', 'шт.', 'pcs', 'штук') THEN RETURN 'pcs'; END IF;
  IF u IN ('ч.л', 'ч.л.', 'чайная ложка', 'tsp', 'чл') THEN RETURN 'tsp'; END IF;
  IF u IN ('ст.л', 'ст.л.', 'столовая ложка', 'tbsp', 'стл') THEN RETURN 'tbsp'; END IF;
  RETURN u;
END;
$$;

-- 3) parse_ingredient_display_text
CREATE OR REPLACE FUNCTION public.parse_ingredient_display_text(display_text text)
RETURNS TABLE(name_clean text, amount_num numeric, unit_text text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  parts text[];
  rest text;
  num_part text;
  am numeric;
  u text;
  n text;
BEGIN
  IF display_text IS NULL OR trim(display_text) = '' THEN
    name_clean := '';
    amount_num := NULL;
    unit_text := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  rest := trim(display_text);
  parts := regexp_split_to_array(rest, '\s*[—\-]\s*');
  IF array_length(parts, 1) < 2 THEN
    name_clean := trim(rest);
    amount_num := NULL;
    unit_text := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  rest := trim(parts[array_length(parts, 1)]);
  n := trim(array_to_string(parts[1:array_length(parts, 1) - 1], ' — '));
  IF rest ~ '^(\d+(?:[.,]\d+)?)\s*(.*)$' THEN
    num_part := (regexp_match(rest, '^(\d+(?:[.,]\d+)?)\s*(.*)$'))[1];
    u := trim((regexp_match(rest, '^(\d+(?:[.,]\d+)?)\s*(.*)$'))[2]);
    num_part := replace(num_part, ',', '.');
    am := num_part::numeric;
    name_clean := n;
    amount_num := am;
    unit_text := NULLIF(u, '');
    RETURN NEXT;
    RETURN;
  END IF;
  name_clean := trim(display_text);
  amount_num := NULL;
  unit_text := NULL;
  RETURN NEXT;
END;
$$;

-- 4) ingredient_canonical (calls public.normalize_ingredient_unit)
CREATE OR REPLACE FUNCTION public.ingredient_canonical(amount_num numeric, unit_text text)
RETURNS TABLE(canonical_amount numeric, canonical_unit text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  norm text;
BEGIN
  IF amount_num IS NULL THEN
    canonical_amount := NULL;
    canonical_unit := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  norm := public.normalize_ingredient_unit(unit_text);
  IF norm = 'kg' THEN
    canonical_amount := amount_num * 1000;
    canonical_unit := 'g';
    RETURN NEXT;
    RETURN;
  END IF;
  IF norm = 'l' THEN
    canonical_amount := amount_num * 1000;
    canonical_unit := 'ml';
    RETURN NEXT;
    RETURN;
  END IF;
  IF norm IN ('g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp') THEN
    canonical_amount := amount_num;
    canonical_unit := norm;
    RETURN NEXT;
    RETURN;
  END IF;
  canonical_amount := NULL;
  canonical_unit := NULL;
  RETURN NEXT;
END;
$$;

-- 5) infer_ingredient_category (returns public.product_category)
CREATE OR REPLACE FUNCTION public.infer_ingredient_category(name_clean text)
RETURNS public.product_category
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  n text;
BEGIN
  IF name_clean IS NULL OR trim(name_clean) = '' THEN
    RETURN 'other'::public.product_category;
  END IF;
  n := lower(trim(name_clean));
  IF n ~ '(говядин|свинин|баранин|индейк|куриц|фарш|котлет)' THEN RETURN 'meat'::public.product_category; END IF;
  IF n ~ '(рыба|лосос|треск|тунец|семг|форел)' THEN RETURN 'fish'::public.product_category; END IF;
  IF n ~ '(молок|кефир|йогурт|творог|сыр|сметан|сливк)' THEN RETURN 'dairy'::public.product_category; END IF;
  IF n ~ '(круп|овсян|греч|рис|макарон|паста|мука)' THEN RETURN 'grains'::public.product_category; END IF;
  IF n ~ '(морков|кабач|тыкв|капуст|картоф|лук|огурц|помидор)' THEN RETURN 'vegetables'::public.product_category; END IF;
  IF n ~ '(яблок|банан|груш|ягод|клубник)' THEN RETURN 'fruits'::public.product_category; END IF;
  IF n ~ '(масло|оливк|сливочн)' THEN RETURN 'fats'::public.product_category; END IF;
  IF n ~ '(соль|перец|специи|укроп|петруш)' THEN RETURN 'spices'::public.product_category; END IF;
  RETURN 'other'::public.product_category;
END;
$$;

COMMENT ON FUNCTION public.infer_ingredient_category(text) IS 'Deterministic ingredient category from name for Cooper cart. Used when payload category is null or other.';

-- 6) recipes_set_norm_title (trigger)
CREATE OR REPLACE FUNCTION public.recipes_set_norm_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.norm_title := lower(btrim(NEW.title));
  ELSE
    NEW.norm_title := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) recipes_validate_not_empty (trigger)
CREATE OR REPLACE FUNCTION public.recipes_validate_not_empty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.source, '') NOT IN ('chat_ai', 'week_ai', 'manual') THEN
    RETURN NEW;
  END IF;
  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    RAISE EXCEPTION 'invalid_recipe: missing_description'
      USING HINT = 'description must be non-empty for source in (chat_ai, week_ai, manual)';
  END IF;
  IF (NEW.chef_advice IS NULL OR btrim(NEW.chef_advice) = '')
     AND (NEW.advice IS NULL OR btrim(NEW.advice) = '') THEN
    RAISE EXCEPTION 'invalid_recipe: missing_advice'
      USING HINT = 'at least one of chef_advice or advice must be non-empty for source in (chat_ai, week_ai, manual)';
  END IF;
  RETURN NEW;
END;
$$;
