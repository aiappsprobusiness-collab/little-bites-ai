-- check_usage_limit: создаём/обновляем только если есть profiles и user_usage
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_usage') THEN
    CREATE OR REPLACE FUNCTION public.check_usage_limit(_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      _subscription_status text;
      _today_usage integer;
      _daily_limit integer := 50;
      _can_generate boolean;
      _remaining integer;
    BEGIN
      SELECT subscription_status INTO _subscription_status
      FROM public.profiles WHERE user_id = _user_id;

      IF _subscription_status = 'premium' THEN
        RETURN jsonb_build_object('can_generate', true, 'remaining', -1, 'is_premium', true, 'used_today', 0);
      END IF;

      SELECT COALESCE(generations, 0) INTO _today_usage
      FROM public.user_usage WHERE user_id = _user_id AND date = CURRENT_DATE;

      _today_usage := COALESCE(_today_usage, 0);
      _remaining := _daily_limit - _today_usage;
      _can_generate := _remaining > 0;

      RETURN jsonb_build_object(
        'can_generate', _can_generate, 'remaining', _remaining, 'is_premium', false,
        'used_today', _today_usage, 'daily_limit', _daily_limit
      );
    END;
    $function$;
  END IF;
END
$$;
