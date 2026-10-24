import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=40).read().decode()

DDL = """
-- 1) International payout options
alter table public.creator_payouts add column if not exists country text;
alter table public.creator_payouts add column if not exists currency text;
alter table public.creator_payouts add column if not exists paypal_email text;
alter table public.creator_payouts add column if not exists payoneer_email text;
alter table public.creator_payouts add column if not exists wise_email text;
alter table public.creator_payouts add column if not exists bank_name text;
alter table public.creator_payouts add column if not exists bank_swift text;
alter table public.creator_payouts add column if not exists bank_iban text;
alter table public.creator_payouts add column if not exists bank_country text;

-- 2) Product file uploads
alter table public.products add column if not exists file_path text;

-- 3) Private storage bucket for product files
insert into storage.buckets (id, name, public) values ('product-files','product-files', false)
on conflict (id) do update set public = false;

-- 4) Storage policies (secure)
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
"""
try:
    print('DDL ok:', sql(DDL)[:120])
except Exception as e:
    print('DDL err:', e)

print('payout cols:', sql("select column_name from information_schema.columns where table_schema='public' and table_name='creator_payouts' order by ordinal_position;"))
print('products file_path:', sql("select column_name from information_schema.columns where table_schema='public' and table_name='products' and column_name='file_path';"))
print('bucket:', sql("select id, name, public from storage.buckets where id='product-files';"))
print('storage policies:', sql("select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%product files%';"))
