alter table public.members
  add column if not exists introduced_product_keys text[] not null default '{}';
