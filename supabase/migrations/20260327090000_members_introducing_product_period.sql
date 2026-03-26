-- Период введения одного продукта (прикорм <12 мес): активный продукт и дата начала (локальный календарный день).
alter table public.members
  add column if not exists introducing_product_key text null,
  add column if not exists introducing_started_at date null;

comment on column public.members.introducing_product_key is 'Ключ продукта (как в introduced_product_keys), который сейчас вводят 2–3 дня';
comment on column public.members.introducing_started_at is 'Дата начала периода введения (date, локальная для клиента при записи)';
