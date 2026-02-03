-- Раньше здесь создавалась таблица children. Данные о членах семьи хранятся в members (V2).
-- Оставляем только функцию update_updated_at для совместимости с другими миграциями.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
