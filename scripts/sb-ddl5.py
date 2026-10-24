import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=40).read().decode()

DDL = """
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
"""
try:
    print('DDL ok:', sql(DDL)[:120])
except Exception as e:
    print('DDL err:', e)
print('bucket:', sql("select id, name, public from storage.buckets where id='product-images';"))
print('policies:', sql("select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%product images%';"))
