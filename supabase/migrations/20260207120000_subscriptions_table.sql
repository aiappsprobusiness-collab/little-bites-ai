-- Таблица подписок для эквайринга Т-Банк: заказ, план, статус, даты, payment_id от Тинькофф.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('month', 'year')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  started_at timestamptz,
  expires_at timestamptz,
  payment_id bigint,
  order_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_order_id ON public.subscriptions(order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id ON public.subscriptions(payment_id) WHERE payment_id IS NOT NULL;

COMMENT ON TABLE public.subscriptions IS 'Платежи подписки (Т-Банк эквайринг); webhook обновляет status и profiles_v2';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Чтение/запись только для service_role (Edge Functions). Пользователь не имеет прямого доступа.
DROP POLICY IF EXISTS "subscriptions_service_only" ON public.subscriptions;
CREATE POLICY "subscriptions_service_only" ON public.subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
