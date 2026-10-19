import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

DDL = """
drop view if exists public.product_stats;
drop view if exists public.creator_stats;

create view public.product_stats as
  select product_id,
         count(*) filter (where status = 'paid') as sales_count,
         coalesce(sum(amount) filter (where status = 'paid'), 0) as gross
  from public.orders
  where product_id is not null
  group by product_id;

create view public.creator_stats as
  select p.creator_id,
         count(*) filter (where o.status = 'paid') as sales_count,
         count(distinct o.product_id) filter (where o.status = 'paid') as products_sold,
         coalesce(sum(o.amount) filter (where o.status = 'paid'), 0) as gross
  from public.orders o
  join public.products p on p.id = o.product_id
  where o.status = 'paid'
  group by p.creator_id;

grant select on public.product_stats to anon, authenticated;
grant select on public.creator_stats to anon, authenticated;
"""
try:
    print('DDL ok:', sql(DDL)[:120])
except Exception as e:
    print('DDL err:', e)
print('cols product_stats:', sql("select column_name from information_schema.columns where table_schema='public' and table_name='product_stats' order by ordinal_position;"))
print('cols creator_stats:', sql("select column_name from information_schema.columns where table_schema='public' and table_name='creator_stats' order by ordinal_position;"))
print('anon select:', sql("select table_name, privilege_type from information_schema.role_table_grants where table_name in ('product_stats','creator_stats') and grantee='anon' and privilege_type='SELECT';"))
