import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

DDL = """
create or replace view public.product_stats as
  select product_id,
         count(*) filter (where status = 'paid') as sales_count
  from public.orders
  where product_id is not null
  group by product_id;

create or replace view public.creator_stats as
  select p.creator_id,
         count(*) filter (where o.status = 'paid') as sales_count,
         count(distinct o.product_id) filter (where o.status = 'paid') as products_sold
  from public.orders o
  join public.products p on p.id = o.product_id
  where o.status = 'paid'
  group by p.creator_id;

grant select on public.product_stats to anon, authenticated;
grant select on public.creator_stats to anon, authenticated;
"""
try:
    print('DDL result:', sql(DDL)[:200])
except Exception as e:
    print('DDL err:', e)

print('views:', sql("select table_name from information_schema.views where table_schema='public' and table_name in ('product_stats','creator_stats');"))
print('grants:', sql("select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in ('product_stats','creator_stats') order by table_name, grantee;"))
print('reloptions:', sql("select relname, reloptions from pg_class where relname in ('product_stats','creator_stats');"))
