-- 0003_updates.sql — additions made after the initial schema.
-- (These were applied live via the Supabase Management API; kept here so the
--  database can be rebuilt reproducibly from the migrations folder.)

-- 1) International payout options for creators
alter table public.creator_payouts add column if not exists country text;
alter table public.creator_payouts add column if not exists currency text;
alter table public.creator_payouts add column if not exists paypal_email text;
alter table public.creator_payouts add column if not exists payoneer_email text;
alter table public.creator_payouts add column if not exists wise_email text;
alter table public.creator_payouts add column if not exists bank_name text;
alter table public.creator_payouts add column if not exists bank_swift text;
alter table public.creator_payouts add column if not exists bank_iban text;
alter table public.creator_payouts add column if not exists bank_country text;

-- 2) Digital product file (private) + product photo (public)
alter table public.products add column if not exists file_path text;

-- 3) Orders: marker so the owner is emailed only once per order
alter table public.orders add column if not exists notified_at timestamptz;

-- 4) Storage: PRIVATE bucket for the actual product files (buyers only)
insert into storage.buckets (id, name, public) values ('product-files','product-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Creators upload own product files" on storage.objects;
create policy "Creators upload own product files" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Creators read own product files" on storage.objects;
create policy "Creators read own product files" on storage.objects for select to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Creators delete own product files" on storage.objects;
create policy "Creators delete own product files" on storage.objects for delete to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Buyers read purchased product files" on storage.objects;
create policy "Buyers read purchased product files" on storage.objects for select to authenticated
  using (bucket_id = 'product-files' and exists (
    select 1 from public.orders o
    join public.products p on p.id = o.product_id
    where o.buyer_id = auth.uid() and o.status = 'paid' and p.file_path = storage.objects.name
  ));

-- 5) Storage: PUBLIC bucket for product photos (shown on the marketplace)
insert into storage.buckets (id, name, public) values ('product-images','product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Creators upload product images" on storage.objects;
create policy "Creators upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone reads product images" on storage.objects;
create policy "Anyone reads product images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Creators delete own product images" on storage.objects;
create policy "Creators delete own product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 6) Data API grants (RLS still applies — these only allow the API to reach the tables)
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
