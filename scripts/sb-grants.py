import os, json, urllib.request
tok = os.environ.get('TOKEN',''); ref = os.environ.get('REF','')
def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=30).read().decode()

GRANTS = """
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
"""
try:
    print('grants applied:', sql(GRANTS)[:120])
except Exception as e:
    print('grants err:', e)

print('RECHECK:', sql("""select c.relname,
  has_table_privilege('anon',c.oid,'SELECT') as anon_sel,
  has_table_privilege('authenticated',c.oid,'SELECT') as auth_sel,
  has_table_privilege('authenticated',c.oid,'INSERT') as auth_ins
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by c.relname;"""))
